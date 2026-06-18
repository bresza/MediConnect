import { ApiError, SUPABASE_ANON_KEY, SUPABASE_URL, getApiToken } from "./api"
import type { Patient } from "../types"

const BUCKET = "avatars"
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const

export function isDataUrl(value?: string | null): boolean {
  return Boolean(value?.startsWith("data:image/"))
}

export function isRemotePhotoUrl(value?: string | null): boolean {
  return Boolean(value && !isDataUrl(value) && /^https?:\/\//i.test(value))
}

function extensionFromMime(mime: string): string {
  if (mime.includes("png")) return "png"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  return "jpg"
}

function patientPhotoObjectPath(patientId: string, ext: string): string {
  return `patients/${patientId}.${ext}`
}

export function getPatientPhotoPublicUrl(objectPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`
}

function storageHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getApiToken()
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    ...extra,
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function toUploadBlob(source: File | string): Promise<{ blob: Blob; mime: string }> {
  if (typeof source === "string") {
    const response = await fetch(source)
    const blob = await response.blob()
    return { blob, mime: blob.type || "image/jpeg" }
  }
  return { blob: source, mime: source.type || "image/jpeg" }
}

async function storageUpload(objectPath: string, blob: Blob, mime: string): Promise<void> {
  const headers = storageHeaders({
    "Content-Type": mime,
    "x-upsert":     "true",
  })

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`
  let response = await fetch(url, { method: "PUT", headers, body: blob })

  if (!response.ok && (response.status === 404 || response.status === 405)) {
    response = await fetch(url, { method: "POST", headers, body: blob })
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => response.statusText)
    throw new ApiError(response.status, raw || "Falha ao enviar a foto para o armazenamento.")
  }
}

async function storageDelete(objectPath: string): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`,
    { method: "DELETE", headers: storageHeaders() },
  )
  if (!response.ok && response.status !== 404) {
    const raw = await response.text().catch(() => response.statusText)
    throw new ApiError(response.status, raw || "Falha ao remover a foto do armazenamento.")
  }
}

interface StorageObjectRow {
  name?: string
}

/** Lista fotos salvas em `avatars/patients/*` e mapeia patientId -> URL publica. */
export async function listPatientPhotoUrlMap(): Promise<Map<string, string>> {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: "patients/", limit: 1000 }),
  })

  if (!response.ok) return new Map()

  const rows = await response.json().catch(() => []) as StorageObjectRow[]
  const map = new Map<string, string>()

  for (const row of rows ?? []) {
    const name = row.name ?? ""
    const match = name.match(/^patients\/([^/.]+)\.[^.]+$/i)
    if (!match) continue
    map.set(match[1], getPatientPhotoPublicUrl(name))
  }

  return map
}

export async function attachPatientPhotos(patients: Patient[]): Promise<Patient[]> {
  if (patients.length === 0) return patients
  const photoMap = await listPatientPhotoUrlMap().catch(() => new Map<string, string>())
  return patients.map((patient) => ({
    ...patient,
    photoUrl: photoMap.get(patient.id) ?? patient.photoUrl,
  }))
}

export async function attachPatientPhoto(patient: Patient): Promise<Patient> {
  const photoMap = await listPatientPhotoUrlMap().catch(() => new Map<string, string>())
  return {
    ...patient,
    photoUrl: photoMap.get(patient.id) ?? patient.photoUrl,
  }
}

/** Envia a foto para o bucket `avatars` e retorna a URL publica persistivel. */
export async function uploadPatientPhoto(
  patientId: string,
  source: File | string,
): Promise<string> {
  if (!patientId) throw new Error("Paciente sem identificador para salvar a foto.")
  if (typeof source === "string" && !isDataUrl(source) && isRemotePhotoUrl(source)) {
    return source
  }

  const { blob, mime } = await toUploadBlob(source)
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("A foto deve ter no máximo 5 MB.")
  }

  const ext = extensionFromMime(mime)
  const objectPath = patientPhotoObjectPath(patientId, ext)
  await storageUpload(objectPath, blob, mime)
  return getPatientPhotoPublicUrl(objectPath)
}

export async function deletePatientPhotoFromStorage(patientId: string): Promise<void> {
  if (!patientId) return
  await Promise.all(
    PHOTO_EXTENSIONS.map((ext) =>
      storageDelete(patientPhotoObjectPath(patientId, ext)).catch(() => undefined),
    ),
  )
}

/** Converte data URL local em URL remota no Storage (sem coluna `photo_url` no banco). */
export async function resolvePatientPhotoUrl(
  patientId: string,
  photoUrl?: string | null,
): Promise<string | undefined> {
  const trimmed = photoUrl?.trim()
  if (!trimmed) return undefined
  if (isDataUrl(trimmed)) return uploadPatientPhoto(patientId, trimmed)
  return trimmed
}
