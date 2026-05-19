export {
  crmDigits,
  crmUf,
  formatCepBR,
  formatCpfBR,
  formatCrm,
  formatPhoneBR,
  onlyDigits,
} from "./masks"
export {
  formatCpfBR as formatCpf,
  formatPhoneBR as formatPhone,
  formatZipCodeBR as formatZipCode,
} from "./masks"

// ─── Time helpers ─────────────────────────────────────────────────
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0")
  const m = (minutes % 60).toString().padStart(2, "0")
  return `${h}:${m}`
}

// ─── Appointment conflict detection ───────────────────────────────
import type { Appointment } from "../types"

export interface ConflictInfo {
  conflicting: Appointment
  message: string
}

export function checkConflict(
  appointments: Appointment[],
  doctorName: string,
  date: string,
  time: string,
  duration: number,
  excludeId?: string,
): ConflictInfo | null {
  const newStart = timeToMinutes(time)
  const newEnd   = newStart + duration

  const found = appointments.find((a) => {
    if (a.doctorName !== doctorName) return false
    if (a.date !== date)             return false
    if (a.id === excludeId)          return false

    const aStart = timeToMinutes(a.time)
    const aEnd   = aStart + a.duration

    return newStart < aEnd && newEnd > aStart
  })

  if (!found) return null

  const foundEnd = minutesToTime(timeToMinutes(found.time) + found.duration)
  return {
    conflicting: found,
    message: `${doctorName} já tem agendamento com ${found.patientName} das ${found.time} às ${foundEnd} (${found.duration} min). Escolha um horário após ${foundEnd}.`,
  }
}

// ─── String helpers ────────────────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

// Particulas que ficam em minusculas quando aparecem no meio do nome
// (preserva: "Joao da Silva" e nao "Joao Da Silva").
const NAME_LOWERCASE_PARTICLES = new Set([
  "da", "de", "di", "do", "du", "das", "dos", "del", "della", "e", "y",
])

// Padroniza nome para exibicao: primeira letra de cada palavra em maiuscula,
// resto em minusculas. Preserva particulas em minusculas exceto no inicio.
// Exemplos: "JOAO SILVA" -> "Joao Silva"; "joao da silva" -> "Joao da Silva".
export function toTitleCase(value: string): string {
  if (!value) return value
  const parts = value.trim().toLocaleLowerCase("pt-BR").split(/\s+/)

  return parts
    .map((word, index) => {
      if (!word) return word
      if (index > 0 && NAME_LOWERCASE_PARTICLES.has(word)) return word
      return word.replace(/^([\p{L}])/u, (match) => match.toLocaleUpperCase("pt-BR"))
    })
    .join(" ")
}

// Comparador case-insensitive e accent-aware para ordenar listas em pt-BR.
const NAME_COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", usage: "sort", ignorePunctuation: true })

export function compareByName(a: string, b: string): number {
  return NAME_COLLATOR.compare(a ?? "", b ?? "")
}

// Retorna uma copia ordenada alfabeticamente. Itens sem nome ficam no final.
export function sortByName<T>(items: T[], getName: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => {
    const nameA = getName(a)?.trim() ?? ""
    const nameB = getName(b)?.trim() ?? ""
    if (!nameA && !nameB) return 0
    if (!nameA) return 1
    if (!nameB) return -1
    return compareByName(nameA, nameB)
  })
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  consultation: "Consulta",
  exam:         "Exame",
  return:       "Retorno",
  procedure:    "Procedimento",
}

export function formatAppointmentType(type: string): string {
  return APPOINTMENT_TYPE_LABELS[type] ?? type
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  Cash:      "Dinheiro",
  Card:      "Cartão",
  Pix:       "Pix",
  Insurance: "Convênio",
  Transfer:  "Transferência",
}

export function formatPaymentMethod(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}

// ─── Especialidades médicas ────────────────────────────────────────

export function normalizeSpecialtyKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

const SPECIALTY_CANONICAL: Record<string, string> = {
  "clinica geral":  "Clínica Geral",
  "clinico geral":  "Clínica Geral",
  "medico clinico": "Clínica Geral",
  "medicina geral": "Clínica Geral",
  "ginicologista":  "Ginecologista",
  "ginicologia":    "Ginecologia",
}

/** "GINECOLOGISTA" → "Ginecologista"; "clinica geral" → "Clínica Geral". */
export function formatSpecialtyLabel(raw?: string | null): string {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return "Clínica Geral"
  const key = normalizeSpecialtyKey(trimmed)
  if (SPECIALTY_CANONICAL[key]) return SPECIALTY_CANONICAL[key]
  return toTitleCase(trimmed)
}

export function uniqueSpecialtyLabels(values: Array<string | undefined | null>): string[] {
  const map = new Map<string, string>()
  for (const raw of values) {
    const label = formatSpecialtyLabel(raw)
    const key = normalizeSpecialtyKey(label)
    if (!map.has(key)) map.set(key, label)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

export function specialtyMatches(a: string, b: string): boolean {
  return normalizeSpecialtyKey(a) === normalizeSpecialtyKey(b)
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "")
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const calcDigit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i)
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10])
}

export function hasAtLeastTwoNames(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2
}
