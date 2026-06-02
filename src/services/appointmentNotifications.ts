import { getPatientById } from "./patients"
import { sendOutboundMessage } from "./messaging"
import { resolveOutboundChannel } from "./messagingChannel"
import { formatAppointmentType, formatDate } from "../utils"
import type { Appointment, CommunicationChannel } from "../types"
import { sendMessage } from "./domain"
import { toE164BR } from "./messaging"

export type AppointmentNotificationKind =
  | "booked"
  | "waitlist_booked"
  | "cancelled"
  | "rescheduled"

const SMS_SKIP_STATUSES = new Set<Appointment["status"]>(["blocked", "cancelled"])

interface PatientContact {
  phone: string
  channel: CommunicationChannel
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function slotLabel(date: string, time: string): string {
  return `${formatDate(date)} às ${time.slice(0, 5)}`
}

function formatSlotLabel(date: string, time: string): string {
  const dt = new Date(`${date}T${time.slice(0, 5)}:00`)
  if (Number.isNaN(dt.getTime())) return slotLabel(date, time)
  const datePart = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  })
  return `${datePart} às ${time.slice(0, 5)}`
}

function isWaitlistBooking(appointment: Appointment): boolean {
  return /encaixe automático|fila prioritária/i.test(appointment.observations ?? "")
}

function buildMessage(
  kind: AppointmentNotificationKind,
  appointment: Appointment,
  extra?: { reason?: string; previousDate?: string; previousTime?: string },
): string {
  const name = firstName(appointment.patientName)
  const doctor = appointment.doctorName || "equipe médica"
  const type = formatAppointmentType(appointment.type)
  const slot = slotLabel(appointment.date, appointment.time)

  switch (kind) {
    case "waitlist_booked":
      return (
        `Olá ${name}, sua consulta (${type}) com ${doctor} foi agendada para ${slot} ` +
        "após liberação de horário na fila prioritária. Veja detalhes no portal MediConnect."
      )
    case "booked":
      return (
        `Olá ${name}, sua consulta (${type}) com ${doctor} foi confirmada para ${slot}. ` +
        "MediConnect — em caso de dúvidas, fale com a recepção."
      )
    case "cancelled": {
      const reason = extra?.reason?.trim()
      const reasonSuffix = reason ? ` Motivo: ${reason}.` : ""
      return (
        `Olá ${name}, sua consulta de ${slot} com ${doctor} foi cancelada.${reasonSuffix} ` +
        "Para remarcar, acesse o portal ou entre em contato com a clínica."
      )
    }
    case "rescheduled": {
      const previous = extra?.previousDate && extra?.previousTime
        ? slotLabel(extra.previousDate, extra.previousTime)
        : null
      const fromPart = previous ? ` (antes: ${previous})` : ""
      return (
        `Olá ${name}, sua consulta com ${doctor} foi remarcada para ${slot}${fromPart}. ` +
        "MediConnect — confira os detalhes no portal."
      )
    }
    default:
      return `Olá ${name}, atualização sobre sua consulta com ${doctor} em ${slot}.`
  }
}

async function resolvePatientContact(appointment: Appointment): Promise<PatientContact | null> {
  try {
    const patient = await getPatientById(appointment.patientId)
    if (!patient) return null
    if (patient.optIn === false) return null
    const phone = patient.phone?.trim()
    if (!phone) return null

    const channel = resolveOutboundChannel(
      appointment.preferredChannel ?? patient.preferredChannel,
    )
    return { phone, channel }
  } catch {
    return null
  }
}

async function dispatchNotification(
  appointment: Appointment,
  kind: AppointmentNotificationKind,
  extra?: { reason?: string; previousDate?: string; previousTime?: string },
): Promise<void> {
  const contact = await resolvePatientContact(appointment)
  if (!contact) return

  const message = buildMessage(kind, appointment, extra)
  await sendOutboundMessage(
    contact.channel,
    {
      phoneNumber: contact.phone,
      message,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
    },
    { fallbackSms: false },
  )
}

function schedule(
  kind: AppointmentNotificationKind,
  appointment: Appointment,
  extra?: Parameters<typeof dispatchNotification>[2],
): void {
  void dispatchNotification(appointment, kind, extra).catch((err) => {
    console.warn(`[appointmentNotifications] falha ao enviar (${kind}):`, err)
  })
}

export function buildAppointmentScheduledSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  type?: Appointment["type"],
): string {
  const name = firstName(patientName)
  const slot = formatSlotLabel(date, time)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${name}, sua ${typeLabel} com ${doctorName} foi agendada para ${slot}. ` +
    "Para remarcar ou cancelar, fale conosco."
  )
}

export async function sendPatientSmsNotification(params: {
  patientId: string
  patientName: string
  content: string
  sentBy: string
  phoneNumber?: string
}): Promise<boolean> {
  try {
    const phone = params.phoneNumber?.trim() || (await getPatientById(params.patientId))?.phone?.trim()
    if (!phone) {
      console.warn("[sms] Paciente sem celular cadastrado:", params.patientId)
      return false
    }
    if (!toE164BR(phone)) return false
    await sendMessage({
      patientId: params.patientId,
      patientName: params.patientName,
      content: params.content,
      status: "Pending",
      date: new Date().toISOString().slice(0, 10),
      channel: "SMS",
      sentBy: params.sentBy,
      phoneNumber: phone,
    })
    return true
  } catch (err) {
    console.warn("[sms] Falha ao enviar:", err instanceof Error ? err.message : err)
    return false
  }
}

export async function notifyAppointmentScheduled(
  appointment: Pick<Appointment, "patientId" | "patientName" | "doctorName" | "date" | "time" | "type" | "status">,
  sentBy = "Sistema — agendamento",
): Promise<boolean> {
  if (SMS_SKIP_STATUSES.has(appointment.status)) return false

  const content = buildAppointmentScheduledSms(
    appointment.patientName,
    appointment.doctorName,
    appointment.date,
    appointment.time,
    appointment.type,
  )

  return sendPatientSmsNotification({
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    content,
    sentBy,
  })
}

export function notifyAppointmentBooked(appointment: Appointment): void {
  const kind: AppointmentNotificationKind = isWaitlistBooking(appointment)
    ? "waitlist_booked"
    : "booked"
  schedule(kind, appointment)
}

export function notifyAppointmentCancelled(appointment: Appointment, reason?: string): void {
  schedule("cancelled", { ...appointment, status: "cancelled" }, { reason })
}

export function notifyAppointmentRescheduled(
  appointment: Appointment,
  previous?: Pick<Appointment, "date" | "time"> | null,
): void {
  if (appointment.status === "cancelled") return
  schedule("rescheduled", appointment, {
    previousDate: previous?.date,
    previousTime: previous?.time,
  })
}

export function handleAppointmentUpdateNotifications(
  previous: Appointment | null,
  current: Appointment,
): void {
  if (!previous) return

  const wasCancelled = previous.status !== "cancelled" && current.status === "cancelled"
  if (wasCancelled) {
    notifyAppointmentCancelled(current)
    return
  }

  const dateChanged = previous.date !== current.date || previous.time !== current.time
  if (dateChanged && current.status !== "cancelled" && current.status !== "completed") {
    notifyAppointmentRescheduled(current, previous)
  }
}
