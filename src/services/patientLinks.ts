import { getApiUserId } from "./api"

interface PatientLinkInput {
  authUserId?: string
  patientId?: string
  name?: string
  email?: string
  cpf?: string
}

const STORAGE_KEY = "mediconnect:patient-links"

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function onlyDigits(value?: string): string {
  return value?.replace(/\D/g, "") ?? ""
}

function resolveAuthUserId(input: PatientLinkInput): string | undefined {
  return input.authUserId?.trim() || getApiUserId() || undefined
}

function keysFor(input: PatientLinkInput): string[] {
  const uid = resolveAuthUserId(input)
  if (!uid) return []

  const prefix = `uid:${uid}:`
  return [
    input.email ? `${prefix}email:${normalizeText(input.email)}` : "",
    input.cpf ? `${prefix}cpf:${onlyDigits(input.cpf)}` : "",
    input.name ? `${prefix}name:${normalizeText(input.name)}` : "",
  ].filter(Boolean)
}

function readLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch {
    return {}
  }
}

function writeLinks(links: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
  } catch {
    // localStorage indisponível; o fluxo da API continua normal.
  }
}

export function rememberPatientLink(input: PatientLinkInput): void {
  if (!input.patientId) return
  const keys = keysFor(input)
  if (keys.length === 0) return

  const links = readLinks()
  keys.forEach((key) => { links[key] = input.patientId! })
  writeLinks(links)
}

export function resolveRememberedPatientId(input: PatientLinkInput): string | undefined {
  const keys = keysFor(input)
  if (keys.length === 0) return undefined

  const links = readLinks()
  return keys.map((key) => links[key]).find(Boolean)
}

export function getAllRememberedPatientIds(): string[] {
  return [...new Set(Object.values(readLinks()).filter(Boolean))]
}

/** Evita reutilizar vínculo de outro login no mesmo navegador. */
export function clearPatientLinksForUser(authUserId: string): void {
  const uid = authUserId.trim()
  if (!uid) return
  const prefix = `uid:${uid}:`
  const links = readLinks()
  let changed = false
  for (const key of Object.keys(links)) {
    if (key.startsWith(prefix)) {
      delete links[key]
      changed = true
    }
  }
  if (changed) writeLinks(links)
}
