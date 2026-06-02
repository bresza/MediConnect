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

export function buildAppointmentScheduledSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  type?: Appointment["type"],
): string {
  const firstName = patientName.trim().split(/\s+/)[0] || patientName
  const slot = formatSlotLabel(date, time)
  const typeLabel = type ? formatAppointmentType(type).toLowerCase() : "consulta"
  return (
    `Olá ${firstName}, sua ${typeLabel} com ${doctorName} foi agendada para ${slot}. ` +
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
