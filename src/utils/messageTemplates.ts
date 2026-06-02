import type { Appointment, Patient } from "../types"
import { formatDateOnly } from "./index"

const PLACEHOLDER_APPT = /\{data\}|\{hora\}/i

export function messageTemplateNeedsAppointment(text: string): boolean {
  return PLACEHOLDER_APPT.test(text)
}

function formatAppointmentTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return time.trim()
  return `${match[1].padStart(2, "0")}:${match[2]}`
}

/** Substitui {nome}, {data} e {hora} pelo paciente e pela consulta informada. */
export function fillMessageTemplate(
  template: string,
  patient: Patient | undefined,
  appointment: Appointment | null | undefined,
): string {
  const nome = (patient?.socialName ?? patient?.name ?? "").trim()
  const data = appointment?.date ? formatDateOnly(appointment.date) : ""
  const hora = appointment?.time ? formatAppointmentTime(appointment.time) : ""

  return template
    .replace(/\{nome\}/gi, nome)
    .replace(/\{data\}/gi, data)
    .replace(/\{hora\}/gi, hora)
}

export function hasUnresolvedMessagePlaceholders(text: string): boolean {
  return /\{nome\}|\{data\}|\{hora\}/i.test(text)
}
