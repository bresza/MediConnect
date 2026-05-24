import type { Appointment, AppointmentStatus } from "../types"

/** Data local YYYY-MM-DD (hoje). */
export function todayDateStr(): string {
  const t = new Date()
  const y = t.getFullYear()
  const m = String(t.getMonth() + 1).padStart(2, "0")
  const d = String(t.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** True se o dia da consulta já passou (antes de hoje). */
export function isAppointmentDayPast(appointment: Appointment): boolean {
  return appointment.date < todayDateStr()
}

export function appointmentDateTime(appointment: Appointment): number {
  return new Date(`${appointment.date}T${appointment.time}:00`).getTime()
}

export function isAppointmentFuture(appointment: Appointment): boolean {
  const ts = appointmentDateTime(appointment)
  return Number.isFinite(ts) && ts > Date.now()
}

const UNCONFIRMED_STATUSES = ["scheduled", "requested", "pending"] as const

function isUnconfirmedStatus(status: AppointmentStatus | string): boolean {
  return (UNCONFIRMED_STATUSES as readonly string[]).includes(status)
}

/**
 * Status exibido no portal do paciente.
 * Após o dia da consulta, se não estiver confirmada → ausente.
 */
export function getPatientDisplayStatus(appointment: Appointment): AppointmentStatus {
  const { status } = appointment
  if (status === "cancelled" || status === "completed" || status === "absent") {
    return status
  }
  if (isAppointmentDayPast(appointment) && isUnconfirmedStatus(status)) {
    return "absent"
  }
  return status
}

/** Consultas na aba "Agendadas" (futuras ativas + passadas não compareceu). */
export function showInPatientScheduledTab(appointment: Appointment): boolean {
  if (appointment.status === "cancelled" || appointment.status === "completed") {
    return false
  }
  const display = getPatientDisplayStatus(appointment)
  if (display === "absent") return true
  if (isAppointmentDayPast(appointment)) return false
  return display !== "cancelled" && display !== "completed"
}

export function canPatientManageAppointment(appointment: Appointment): boolean {
  const display = getPatientDisplayStatus(appointment)
  if (display === "absent" || display === "completed" || display === "cancelled") {
    return false
  }
  return isAppointmentFuture(appointment)
}

export const PATIENT_APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
  absent: "Ausente",
  pending: "Pendente",
  requested: "Solicitada",
}

export function patientAppointmentStatusLabel(status: AppointmentStatus): string {
  return PATIENT_APPOINTMENT_STATUS_LABELS[status] ?? status
}
