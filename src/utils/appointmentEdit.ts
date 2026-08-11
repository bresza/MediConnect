import type { Appointment } from "../types"

/**
 * When editing, the current appointment occupies its own slot in availability
 * queries, so we may re-inject that time. Never inject it after doctor/date
 * changes — that would bypass API availability and allow out-of-grade booking.
 */
export function keepTimeForEdit(
  editing: Pick<Appointment, "doctorId" | "date" | "time"> | null | undefined,
  doctorId: string,
  date: string,
): string | undefined {
  if (!editing?.time) return undefined
  if (editing.doctorId !== doctorId || editing.date !== date) return undefined
  return editing.time
}

/** Whether a manual waitlist "Agendar" save should mark the entry scheduled. */
export function shouldCompleteWaitlistOnSave(input: {
  editingAppointment: boolean
  waitlistEntry: { status: string; patientId: string } | null | undefined
  patientId: string
}): boolean {
  if (input.editingAppointment) return false
  if (!input.waitlistEntry) return false
  if (input.waitlistEntry.status !== "waiting") return false
  return input.waitlistEntry.patientId === input.patientId
}
