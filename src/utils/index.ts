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
