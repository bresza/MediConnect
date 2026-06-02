import { ApiError, SUPABASE_ANON_KEY, SUPABASE_URL, getApiToken } from "./api"
import type { Patient } from "../types"

/** Bucket documentado: `POST/GET /storage/v1/object/avatars/{path}`. */
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

/** Path no Storage conforme API: `{userId}/avatar.jpg`. */
export function avatarObjectPath(userId: string, ext = "jpg"): string {
  return `${userId}/avatar.${ext}`
}

/**
 * URL de download documentada: `GET /storage/v1/object/avatars/{path}` (sem `/public/`).
 */
export function getAvatarDownloadUrl(objectPath: string, cacheBust?: number): string {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/")
  const base = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`
  return cacheBust ? `${base}?v=${cacheBust}` : base
}

/** @deprecated Use {@link getAvatarDownloadUrl}. */
export function getPatientPhotoPublicUrl(objectPath: string): string {
  return getAvatarDownloadUrl(objectPath)
}

/** Converte URLs legadas (`/object/public/avatars/...`) para o endpoint documentado quando possível. */
export function normalizeAvatarUrl(url?: string | null, userId?: string | null): string | undefined {
  const trimmed = url?.trim()
  if (trimmed) {
    if (isDataUrl(trimmed)) return trimmed
    if (/^https?:\/\//i.test(trimmed)) {
      const withoutPublic = trimmed.replace(
        /\/storage\/v1\/object\/public\/avatars\//i,
        "/storage/v1/object/avatars/",
      )
      return withoutPublic
    }
  }

  if (userId?.trim()) return getAvatarDownloadUrl(avatarObjectPath(userId.trim()))
  return trimmed || undefined
}

/** Mensagem legível para erros do Supabase Storage (ex.: RLS 403). */
export function storageErrorMessage(raw: string, status = 0): string {
  let message = raw
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string }
    message = parsed.message ?? parsed.error ?? raw
  } catch {
    /* texto puro */
  }

  if (
    status === 403 &&
    /row-level security|rls|violates.*policy|unauthorized/i.test(message)
  ) {
    return (
      "O servidor bloqueou o envio da foto (permissão no Storage). " +
      "Seus outros dados do perfil ainda podem ser salvos. " +
      "Se o problema continuar, o time da API precisa liberar upload no bucket avatars para usuários autenticados."
    )
  }

  if (status === 403) {
    return "Sem permissão para enviar a foto. Verifique se está logado."
  }

  return message || "Falha ao enviar a foto para o armazenamento."
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

/** Upload conforme API: `POST /storage/v1/object/avatars/{path}` multipart/form-data. */
async function storageUpload(objectPath: string, blob: Blob): Promise<void> {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/")
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`
  const formData = new FormData()
  const filename = objectPath.split("/").pop() || "avatar.jpg"
  formData.append("file", blob, filename)

  const response = await fetch(url, {
    method: "POST",
    headers: storageHeaders({ "x-upsert": "true" }),
    body: formData,
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => response.statusText)
    throw new ApiError(response.status, storageErrorMessage(raw, response.status))
  }
}

async function storageDelete(objectPath: string): Promise<void> {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/")
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`,
    { method: "DELETE", headers: storageHeaders() },
  )
  if (!response.ok && response.status !== 404) {
    const raw = await response.text().catch(() => response.statusText)
    throw new ApiError(response.status, raw || "Falha ao remover a foto do armazenamento.")
  }
}

export function avatarUrlForUser(userId?: string | null, ext = "jpg"): string | undefined {
  if (!userId?.trim()) return undefined
  return getAvatarDownloadUrl(avatarObjectPath(userId.trim(), ext))
}

function resolveStorageUserId(patient: Patient): string | undefined {
  return patient.userId?.trim() || undefined
}

export async function attachPatientPhotos(patients: Patient[]): Promise<Patient[]> {
  return patients.map((patient) => {
    const userId = resolveStorageUserId(patient)
    const fromUser = userId ? avatarUrlForUser(userId) : undefined
    return {
      ...patient,
      photoUrl: normalizeAvatarUrl(fromUser ?? patient.photoUrl, userId),
    }
  })
}

export async function attachPatientPhoto(patient: Patient): Promise<Patient> {
  const userId = resolveStorageUserId(patient)
  const fromUser = userId ? avatarUrlForUser(userId) : undefined
  return {
    ...patient,
    photoUrl: normalizeAvatarUrl(fromUser ?? patient.photoUrl, userId),
  }
}

/** Envia avatar para `avatars/{userId}/avatar.{ext}` e retorna URL de download documentada. */
export async function uploadAvatar(
  userId: string,
  source: File | string,
): Promise<string> {
  if (!userId.trim()) throw new Error("Usuário sem identificador para salvar a foto.")
  if (typeof source === "string" && !isDataUrl(source) && isRemotePhotoUrl(source)) {
    return normalizeAvatarUrl(source, userId) ?? source
  }

  const { blob, mime } = await toUploadBlob(source)
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("A foto deve ter no máximo 5 MB.")
  }

  const ext = extensionFromMime(mime)
  const objectPath = avatarObjectPath(userId.trim(), ext)
  await storageUpload(objectPath, blob)
  return getAvatarDownloadUrl(objectPath, Date.now())
}

/** @deprecated Prefer {@link uploadAvatar} com `userId`. */
export async function uploadPatientPhoto(
  patientId: string,
  source: File | string,
): Promise<string> {
  return uploadAvatar(patientId, source)
}

export async function deleteAvatarFromStorage(userId: string): Promise<void> {
  if (!userId.trim()) return
  const uid = userId.trim()
  await Promise.all(
    PHOTO_EXTENSIONS.map((ext) =>
      storageDelete(avatarObjectPath(uid, ext)).catch(() => undefined),
    ),
  )
}

/** @deprecated Prefer {@link deleteAvatarFromStorage}. */
export async function deletePatientPhotoFromStorage(patientId: string): Promise<void> {
  return deleteAvatarFromStorage(patientId)
}

/** Converte data URL local em URL remota no Storage. */
export async function resolveAvatarPhotoUrl(
  userId: string,
  photoUrl?: string | null,
): Promise<string | undefined> {
  const trimmed = photoUrl?.trim()
  if (!trimmed) return undefined
  if (isDataUrl(trimmed)) return uploadAvatar(userId, trimmed)
  return normalizeAvatarUrl(trimmed, userId)
}

/** @deprecated Prefer {@link resolveAvatarPhotoUrl} com `userId`. */
export async function resolvePatientPhotoUrl(
  patientId: string,
  photoUrl?: string | null,
): Promise<string | undefined> {
  return resolveAvatarPhotoUrl(patientId, photoUrl)
}
