import type { Appointment, WaitlistEntry } from "../types"
import { createAppointment } from "./appointments"
import { sendPatientSmsNotification } from "./appointmentNotifications"
import { updateFreedSlotStatus } from "./freedSlots"
import {
  enrollPatientInWaitlist,
  updateWaitlistEntry,
  WAITLIST_COLOR_LABEL,
  type EnrollPatientInput,
} from "./waitlist"

export type GapFillTrigger = "patient_cancellation" | "staff_cancellation" | "no_show"

export interface WaitlistFillResult {
  filled:    boolean
  appointment?: Appointment
  entry?:      WaitlistEntry
  notified?:   boolean
  message?:    string
}

export type FreedSlot = Pick<
  Appointment,
  "id" | "patientId" | "patientName" | "doctorId" | "doctorName" | "date" | "time" | "duration" | "type"
>

function formatSlotLabel(date: string, time: string): string {
  const dt = new Date(`${date}T${time}:00`)
  if (Number.isNaN(dt.getTime())) return `${date} às ${time}`
  const datePart = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  })
  return `${datePart} às ${time}`
}

export function buildPromotionSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  trigger: GapFillTrigger,
): string {
  const slot = formatSlotLabel(date, time)
  const firstName = patientName.trim().split(/\s+/)[0] || patientName
  const reason = trigger === "no_show"
    ? "liberação de horário na agenda"
    : "desistência de outro paciente"
  return `Olá ${firstName}, sua consulta com ${doctorName} foi agendada para ${slot} após ${reason} na fila prioritária. Veja detalhes no portal. Para remarcar, fale conosco.`
}

async function notifyPromotedPatient(
  patientId: string,
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  trigger: GapFillTrigger,
): Promise<boolean> {
  const sms = buildPromotionSms(patientName, doctorName, date, time, trigger)
  return sendPatientSmsNotification({
    patientId,
    patientName,
    content: sms,
    sentBy: "Sistema — fila de espera",
  })
}

export async function notifyWaitlistEnrollment(
  patientId: string,
  patientName: string,
  doctorName: string,
  specialty: string | undefined,
  priorityColor: WaitlistEntry["priorityColor"],
): Promise<void> {
  const firstName = patientName.trim().split(/\s+/)[0] || patientName
  const target = specialty ? `${doctorName} (${specialty})` : doctorName
  const priorityLabel = WAITLIST_COLOR_LABEL[priorityColor]
  const sms = `Olá ${firstName}, você entrou na fila de espera para consulta com ${target}. Prioridade: ${priorityLabel}. Avisaremos por SMS quando surgir vaga.`
  await sendPatientSmsNotification({
    patientId,
    patientName,
    content: sms,
    sentBy: "Sistema — fila de espera",
  })
}

/** Inscreve o paciente na fila e envia confirmação por SMS quando houver telefone. */
export async function enrollPatientInWaitlistFromPortal(
  input: EnrollPatientInput,
): Promise<{ entry: WaitlistEntry; created: boolean }> {
  const result = await enrollPatientInWaitlist(input)
  if (result.created) {
    await notifyWaitlistEnrollment(
      input.patient.id,
      input.patient.socialName || input.patient.name,
      input.doctorName ?? "a clínica",
      input.specialty,
      result.entry.priorityColor,
    )
  }
  return result
}

/**
 * Agenda manualmente um paciente da fila no horário liberado (confirmação da recepção).
 */
export async function bookWaitlistEntryForSlot(
  entry: WaitlistEntry,
  freed: FreedSlot,
  trigger: GapFillTrigger = "staff_cancellation",
  options?: { freedSlotId?: string; filledBy?: string },
): Promise<WaitlistFillResult> {
  const slotTime = new Date(`${freed.date}T${freed.time}:00`)
  if (Number.isNaN(slotTime.getTime()) || slotTime <= new Date()) {
    return { filled: false, message: "Horário não é futuro." }
  }

  if (entry.patientId === freed.patientId) {
    return { filled: false, message: "Paciente é o mesmo da vaga liberada." }
  }

  const notePrefix = `Encaixe confirmado (fila ${WAITLIST_COLOR_LABEL[entry.priorityColor]}).`
  const observations = [
    notePrefix,
    trigger === "patient_cancellation"
      ? "Vaga liberada por cancelamento do paciente."
      : trigger === "no_show"
        ? "Vaga liberada por ausência."
        : "Vaga liberada por cancelamento.",
  ].join(" ")

  try {
    const appointment = await createAppointment({
      patientId:   entry.patientId,
      patientName: entry.patientName,
      doctorId:    freed.doctorId,
      doctorName:  freed.doctorName,
      date:        freed.date,
      time:        freed.time,
      duration:    freed.duration,
      type:        freed.type,
      status:      "scheduled",
      observations,
    }, { skipConfirmationSms: true })

    await updateWaitlistEntry({
      ...entry,
      status: "scheduled",
      notes: [entry.notes, observations].filter(Boolean).join("\n"),
    })

    if (options?.freedSlotId) {
      await updateFreedSlotStatus(options.freedSlotId, "filled", options.filledBy).catch(() => {})
    }

    const notified = await notifyPromotedPatient(
      entry.patientId,
      entry.patientName,
      freed.doctorName,
      freed.date,
      freed.time,
      trigger,
    )

    return { filled: true, appointment, entry, notified }
  } catch (err) {
    return {
      filled: false,
      message: err instanceof Error ? err.message : "Falha ao agendar encaixe.",
    }
  }
}

/** @deprecated Use bookWaitlistEntryForSlot após confirmação da recepção. */
export async function fillGapFromWaitlist(
  _freed: FreedSlot,
  _trigger: GapFillTrigger = "staff_cancellation",
): Promise<WaitlistFillResult> {
  console.warn("[waitlist] fillGapFromWaitlist está obsoleto — use sugestão manual + bookWaitlistEntryForSlot")
  return { filled: false, message: "Encaixe automático desativado. Use a sugestão da fila na agenda." }
}
