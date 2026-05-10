export { formatCpfBR as formatCpf, formatPhoneBR as formatPhone, formatZipCodeBR as formatZipCode, onlyDigits } from "./masks"

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
