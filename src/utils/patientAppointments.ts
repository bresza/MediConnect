import type { Appointment, AppointmentStatus, Patient } from "../types"

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

/** True se data/hora da consulta já passou. */
export function isAppointmentPast(appointment: Appointment): boolean {
  const ts = appointmentDateTime(appointment)
  return Number.isFinite(ts) && ts <= Date.now()
}

/**
 * Status exibido no portal do paciente.
 * Após o horário da consulta, se não estiver confirmada/concluída → ausente.
 */
export function getPatientDisplayStatus(appointment: Appointment): AppointmentStatus {
  const { status } = appointment
  if (status === "cancelled" || status === "completed" || status === "absent") {
    return status
  }
  if (isAppointmentPast(appointment) && isUnconfirmedStatus(status)) {
    return "absent"
  }
  return status
}

/** Consultas na aba "Agendadas" (futuras/pendentes ou concluídas — compareceu). */
export function showInPatientScheduledTab(appointment: Appointment): boolean {
  if (appointment.status === "cancelled") return false
  const display = getPatientDisplayStatus(appointment)
  if (display === "absent") return false
  if (display === "completed" || appointment.status === "completed") return true
  return isAppointmentFuture(appointment)
}

/** Consultas na aba "Ausentes" (não compareceu). */
export function showInPatientAbsentTab(appointment: Appointment): boolean {
  if (appointment.status === "cancelled") return false
  return getPatientDisplayStatus(appointment) === "absent"
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

const NON_VISIT_STATUSES = new Set<AppointmentStatus>(["cancelled", "blocked", "absent"])

function normalizeDateKey(value?: string): string | undefined {
  const match = value?.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1]
}

function latestDateKey(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

/** Conta como visita passada: compareceu ou consulta já ocorreu (exc. cancelada/bloqueada/ausente). */
export function countsAsPastVisit(appointment: Appointment): boolean {
  if (NON_VISIT_STATUSES.has(appointment.status)) return false
  return isAppointmentPast(appointment) || isAppointmentDayPast(appointment)
}

/** Data (YYYY-MM-DD) da última visita do paciente com base nos agendamentos visíveis. */
export function getPatientLastVisitFromAppointments(
  patientId: string,
  appointments: Appointment[],
): string | undefined {
  let last: string | undefined
  for (const appt of appointments) {
    if (appt.patientId !== patientId || !countsAsPastVisit(appt)) continue
    last = latestDateKey(last, appt.date)
  }
  return last
}

/** Preenche `lastVisit` a partir da agenda quando a API não retorna `last_visit`. */
export function enrichPatientsWithVisits(
  patients: Patient[],
  appointments: Appointment[],
): Patient[] {
  if (patients.length === 0 || appointments.length === 0) {
    return patients.map((p) => {
      const fromApi = normalizeDateKey(p.lastVisit)
      return fromApi && fromApi !== p.lastVisit ? { ...p, lastVisit: fromApi } : p
    })
  }

  return patients.map((patient) => {
    const fromApi = normalizeDateKey(patient.lastVisit)
    const fromAppts = getPatientLastVisitFromAppointments(patient.id, appointments)
    const lastVisit = latestDateKey(fromApi, fromAppts)
    if (!lastVisit || lastVisit === patient.lastVisit) return patient
    return { ...patient, lastVisit }
  })
}
