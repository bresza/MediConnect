import { formatAppointmentType } from "../utils"
import type { Appointment } from "../types"
import { sendMessage } from "./domain"
import { getPatientById } from "./patients"

const SMS_SKIP_STATUSES = new Set<Appointment["status"]>(["blocked", "cancelled"])

function formatSlotLabel(date: string, time: string): string {
  const dt = new Date(`${date}T${time.slice(0, 5)}:00`)
  if (Number.isNaN(dt.getTime())) return `${date} às ${time.slice(0, 5)}`
  const datePart = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  })
  return `${datePart} às ${time.slice(0, 5)}`
}

function firstName(patientName: string): string {
  return patientName.trim().split(/\s+/)[0] || patientName
}

export function buildAppointmentScheduledSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  type?: Appointment["type"],
): string {
  const slot = formatSlotLabel(date, time)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${firstName(patientName)}, sua ${typeLabel} com ${doctorName} foi agendada para ${slot}. ` +
    "Para remarcar ou cancelar, fale conosco."
  )
}

export function buildAppointmentCancelledSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  type?: Appointment["type"],
): string {
  const slot = formatSlotLabel(date, time)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${firstName(patientName)}, sua ${typeLabel} com ${doctorName} em ${slot} foi cancelada. ` +
    "Para remarcar, entre em contato conosco."
  )
}

export function buildAppointmentRescheduledSms(
  patientName: string,
  doctorName: string,
  prevDate: string,
  prevTime: string,
  nextDate: string,
  nextTime: string,
  type?: Appointment["type"],
): string {
  const fromSlot = formatSlotLabel(prevDate, prevTime)
  const toSlot = formatSlotLabel(nextDate, nextTime)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${firstName(patientName)}, sua ${typeLabel} com ${doctorName} foi remarcada de ${fromSlot} para ${toSlot}. ` +
    "Para alterar novamente, fale conosco."
  )
}

export function buildAppointmentAbsentSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  type?: Appointment["type"],
): string {
  const slot = formatSlotLabel(date, time)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${firstName(patientName)}, registramos ausência na sua ${typeLabel} com ${doctorName} em ${slot}. ` +
    "Entre em contato para remarcar."
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

export async function notifyAppointmentCancelled(
  appointment: Pick<Appointment, "patientId" | "patientName" | "doctorName" | "date" | "time" | "type">,
  sentBy = "Sistema — cancelamento",
): Promise<boolean> {
  const content = buildAppointmentCancelledSms(
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

export async function notifyAppointmentRescheduled(
  previous: Pick<Appointment, "patientId" | "patientName" | "doctorName" | "date" | "time" | "type">,
  next: Pick<Appointment, "date" | "time">,
  sentBy = "Sistema — remarcação",
): Promise<boolean> {
  const content = buildAppointmentRescheduledSms(
    previous.patientName,
    previous.doctorName,
    previous.date,
    previous.time,
    next.date,
    next.time,
    previous.type,
  )
  return sendPatientSmsNotification({
    patientId: previous.patientId,
    patientName: previous.patientName,
    content,
    sentBy,
  })
}

export async function notifyAppointmentAbsent(
  appointment: Pick<Appointment, "patientId" | "patientName" | "doctorName" | "date" | "time" | "type">,
  sentBy = "Sistema — ausência",
): Promise<boolean> {
  const content = buildAppointmentAbsentSms(
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
