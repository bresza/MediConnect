import type { Appointment, WaitlistEntry } from "../types"
import { createAppointment, deleteAppointment, getAvailableSlots } from "./appointments"
import { sendMessage } from "./domain"
import { getPatientById } from "./patients"
import {
  enrollPatientInWaitlist,
  getWaitlist,
  suggestForGap,
  updateWaitlistEntry,
  WAITLIST_COLOR_LABEL,
  type EnrollPatientInput,
} from "./waitlist"

export type GapFillTrigger = "patient_cancellation" | "staff_cancellation" | "no_show"

export interface WaitlistFillResult {
  filled: boolean
  appointment?: Appointment
  entry?: WaitlistEntry
  notified?: boolean
  message?: string
}

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

function buildPromotionSms(
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

async function sendPatientSms(
  patientId: string,
  patientName: string,
  content: string,
  sentBy: string,
): Promise<boolean> {
  try {
    const patient = await getPatientById(patientId)
    const phone = patient?.phone?.trim()
    if (!phone) return false
    await sendMessage({
      patientId,
      patientName,
      content,
      status: "Pending",
      date: new Date().toISOString().slice(0, 10),
      channel: "SMS",
      sentBy,
      phoneNumber: phone,
    })
    return true
  } catch {
    return false
  }
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
  return sendPatientSms(patientId, patientName, sms, "Sistema — fila de espera")
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
  await sendPatientSms(patientId, patientName, sms, "Sistema — fila de espera")
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

type FreedSlot = Pick<
  Appointment,
  "id" | "patientId" | "patientName" | "doctorId" | "doctorName" | "date" | "time" | "duration" | "type"
>

/**
 * Preenche uma vaga liberada com o próximo paciente prioritário da fila
 * (`appointment_waitlist` via REST ou fallback localStorage).
 */
export async function fillGapFromWaitlist(
  freed: FreedSlot,
  trigger: GapFillTrigger = "staff_cancellation",
): Promise<WaitlistFillResult> {
  const slotTime = new Date(`${freed.date}T${freed.time}:00`)
  if (Number.isNaN(slotTime.getTime()) || slotTime <= new Date()) {
    return { filled: false, message: "Horário não é futuro." }
  }

  let waitlist: WaitlistEntry[]
  try {
    waitlist = await getWaitlist()
  } catch {
    return { filled: false, message: "Não foi possível consultar a fila." }
  }

  const candidate = suggestForGap(waitlist, { doctorId: freed.doctorId })
  if (!candidate) {
    return { filled: false, message: "Nenhum paciente na fila compatível." }
  }

  if (candidate.patientId === freed.patientId) {
    return { filled: false, message: "Próximo da fila é o mesmo paciente." }
  }

  const availableSlots = await getAvailableSlots(freed.doctorId, freed.date, freed.type).catch((): string[] => [])
  if (!availableSlots.includes(freed.time)) {
    return { filled: false, message: "Horário liberado não está mais disponível." }
  }

  const notePrefix = `Encaixe automático (fila ${WAITLIST_COLOR_LABEL[candidate.priorityColor]}).`
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
      patientId: candidate.patientId,
      patientName: candidate.patientName,
      doctorId: freed.doctorId,
      doctorName: freed.doctorName,
      date: freed.date,
      time: freed.time,
      duration: freed.duration,
      type: freed.type,
      status: "scheduled",
      observations,
    })

    try {
      await updateWaitlistEntry({
        ...candidate,
        status: "scheduled",
        notes: [candidate.notes, observations].filter(Boolean).join("\n"),
      })
    } catch (err) {
      await deleteAppointment(appointment.id).catch(() => undefined)
      throw err
    }

    const notified = await notifyPromotedPatient(
      candidate.patientId,
      candidate.patientName,
      freed.doctorName,
      freed.date,
      freed.time,
      trigger,
    )

    return { filled: true, appointment, entry: candidate, notified }
  } catch (err) {
    return {
      filled: false,
      message: err instanceof Error ? err.message : "Falha ao agendar encaixe.",
    }
  }
}
