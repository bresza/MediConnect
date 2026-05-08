interface PatientLinkInput {
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

function keysFor(input: PatientLinkInput): string[] {
  return [
    input.email ? `email:${normalizeText(input.email)}` : "",
    input.cpf ? `cpf:${onlyDigits(input.cpf)}` : "",
    input.name ? `name:${normalizeText(input.name)}` : "",
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
    // localStorage indisponivel; o fluxo da API continua normal.
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
  const links = readLinks()
  return keysFor(input)
    .map((key) => links[key])
    .find(Boolean)
}
