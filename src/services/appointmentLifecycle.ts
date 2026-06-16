import type { Appointment } from "../types"
import { updateAppointment } from "./appointments"
import {
  notifyAppointmentAbsent,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
} from "./appointmentNotifications"
import {
  type FreedAppointmentSlot,
  type FreedSlotInput,
  recordFreedSlot,
} from "./freedSlots"
import { getWaitlist } from "./waitlist"
import { rankWaitlistForGap, type GapSuggestion, type FreedSlotContext } from "./waitlistAi"
import type { GapFillTrigger } from "./waitlistAutomation"

export interface SlotFreedResult {
  freedSlot:   FreedAppointmentSlot | null
  suggestions: GapSuggestion[]
}

export interface ApplyAppointmentUpdateResult {
  appointment: Appointment
  slotFreed?:  SlotFreedResult
}

function isFutureSlot(date: string, time: string): boolean {
  const slotTime = new Date(`${date}T${time}:00`)
  return !Number.isNaN(slotTime.getTime()) && slotTime > new Date()
}

function toFreedContext(freed: FreedSlotInput): FreedSlotContext {
  return {
    id:          freed.id,
    doctorId:    freed.doctorId,
    doctorName:  freed.doctorName,
    date:        freed.date,
    time:        freed.time,
    duration:    freed.duration,
    type:        freed.type,
    patientId:   freed.patientId,
    patientName: freed.patientName,
  }
}

export async function onSlotFreed(
  freed: FreedSlotInput,
  trigger: GapFillTrigger,
): Promise<SlotFreedResult> {
  if (!isFutureSlot(freed.date, freed.time)) {
    return { freedSlot: null, suggestions: [] }
  }

  const freedSlot = await recordFreedSlot(freed, trigger).catch((err) => {
    console.warn("[lifecycle] falha ao registrar vaga:", err)
    return null
  })

  let waitlist = []
  try {
    waitlist = await getWaitlist()
  } catch {
    return { freedSlot, suggestions: [] }
  }

  const suggestions = await rankWaitlistForGap(toFreedContext(freed), waitlist, 3)
  return { freedSlot, suggestions }
}

export async function onAppointmentCancelled(
  appointment: Appointment,
  trigger: GapFillTrigger = "staff_cancellation",
): Promise<SlotFreedResult> {
  await notifyAppointmentCancelled(appointment).catch((err) => {
    console.warn("[lifecycle] SMS cancelamento:", err)
  })
  return onSlotFreed(appointment, trigger)
}

export async function onAppointmentAbsent(appointment: Appointment): Promise<SlotFreedResult> {
  await notifyAppointmentAbsent(appointment).catch((err) => {
    console.warn("[lifecycle] SMS ausência:", err)
  })
  return onSlotFreed(appointment, "no_show")
}

export async function onAppointmentRescheduled(
  previous: Appointment,
  next: Appointment,
): Promise<void> {
  const rescheduled =
    previous.date !== next.date ||
    previous.time !== next.time

  if (!rescheduled) return
  if (previous.status === "cancelled" || previous.status === "absent") return

  await notifyAppointmentRescheduled(previous, next).catch((err) => {
    console.warn("[lifecycle] SMS remarcação:", err)
  })
}

export async function applyAppointmentUpdate(
  previous: Appointment,
  next: Appointment,
  options?: { trigger?: GapFillTrigger },
): Promise<ApplyAppointmentUpdateResult> {
  const saved = await updateAppointment(next)

  await onAppointmentRescheduled(previous, saved)

  const becameCancelled = previous.status !== "cancelled" && saved.status === "cancelled"
  const becameAbsent = previous.status !== "absent" && saved.status === "absent"

  if (becameCancelled) {
    const trigger = options?.trigger ?? "staff_cancellation"
    const slotFreed = await onAppointmentCancelled(saved, trigger)
    return { appointment: saved, slotFreed }
  }

  if (becameAbsent) {
    const slotFreed = await onAppointmentAbsent(saved)
    return { appointment: saved, slotFreed }
  }

  return { appointment: saved }
}

export async function applyPatientAppointmentReschedule(
  previous: Appointment,
  next: Appointment,
): Promise<Appointment> {
  const saved = await updateAppointment(next)
  await onAppointmentRescheduled(previous, saved)
  return saved
}

export async function applyPatientAppointmentCancellation(
  appointment: Appointment,
): Promise<SlotFreedResult> {
  await notifyAppointmentCancelled(appointment).catch((err) => {
    console.warn("[lifecycle] SMS cancelamento paciente:", err)
  })
  return onSlotFreed(appointment, "patient_cancellation")
}
