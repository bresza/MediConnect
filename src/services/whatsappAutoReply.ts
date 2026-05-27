import { formatAppointmentType, formatDate } from "../utils"
import type { Appointment, Patient } from "../types"

export type WhatsAppIntent =
  | "confirm"
  | "reschedule"
  | "cancel"
  | "schedule_info"
  | "help"
  | "thanks"
  | "unknown"

export interface AutoReplyContext {
  patient?: Patient | null
  nextAppointment?: Appointment | null
  clinicName?: string
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function detectWhatsAppIntent(text: string): WhatsAppIntent {
  const t = normalizeText(text)
  if (!t) return "unknown"

  if (/^(sim|ok|confirmo|confirmar|confirmado|vou|pode ser|ta bom|tá bom|beleza)$/.test(t) ||
    /\bconfirm(o|ar|ado|ada)\b/.test(t)) {
    return "confirm"
  }
  if (/\b(cancel|desmarc|nao vou|não vou|nao posso|não posso)\b/.test(t)) {
    return "cancel"
  }
  if (/\b(reagend|remarc|mudar horario|mudar data|outro horario|outra data)\b/.test(t)) {
    return "reschedule"
  }
  if (/\b(horario|hora|data|quando|dia|consulta)\b/.test(t)) {
    return "schedule_info"
  }
  if (/\b(obrigad|valeu|agradeço|agradeco)\b/.test(t)) {
    return "thanks"
  }
  if (/\b(ajuda|menu|opcoes|opções|oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(t)) {
    return "help"
  }
  return "unknown"
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function buildWhatsAppAutoReply(intent: WhatsAppIntent, ctx: AutoReplyContext): string {
  const clinic = ctx.clinicName?.trim() || "MediConnect"
  const name = firstName(ctx.patient?.socialName || ctx.patient?.name || "paciente")
  const appt = ctx.nextAppointment

  switch (intent) {
    case "confirm":
      if (appt) {
        return (
          `Perfeito, ${name}! Registramos sua confirmação da consulta de ${formatAppointmentType(appt.type)} ` +
          `com ${appt.doctorName} em ${formatDate(appt.date)} às ${appt.time}. Até lá! — ${clinic}`
        )
      }
      return `Obrigado, ${name}! Sua confirmação foi registrada. Se precisar de algo, responda AJUDA. — ${clinic}`

    case "reschedule":
      return (
        `${name}, para reagendar acesse o portal do paciente ou ligue para a recepção. ` +
        `Responda HORÁRIO para ver sua próxima consulta. — ${clinic}`
      )

    case "cancel":
      return (
        `${name}, para cancelar entre em contato com a recepção o quanto antes. ` +
        `Se preferir remarcar, responda REAGENDAR. — ${clinic}`
      )

    case "schedule_info":
      if (appt) {
        return (
          `${name}, sua próxima consulta: ${formatAppointmentType(appt.type)} com ${appt.doctorName}, ` +
          `${formatDate(appt.date)} às ${appt.time}. Responda CONFIRMAR para confirmar presença. — ${clinic}`
        )
      }
      return `${name}, não encontramos consulta futura no seu cadastro. Fale com a recepção para agendar. — ${clinic}`

    case "thanks":
      return `Por nada, ${name}! Estamos à disposição. — ${clinic}`

    case "help":
    case "unknown":
    default:
      return (
        `Olá ${name}! Sou o assistente ${clinic}. Você pode responder:\n` +
        "• CONFIRMAR — confirmar consulta\n" +
        "• HORÁRIO — ver próxima consulta\n" +
        "• REAGENDAR — instruções de remarcação\n" +
        "• CANCELAR — orientações de cancelamento"
      )
  }
}

export function findNextAppointmentForPatient(
  appointments: Appointment[],
  patient: Patient,
): Appointment | null {
  const phoneDigits = patient.phone?.replace(/\D/g, "") ?? ""
  const now = Date.now()

  const matches = appointments.filter((a) => {
    if (a.status === "cancelled" || a.status === "completed" || a.status === "absent") return false
    if (a.patientId === patient.id) return true
    if (phoneDigits && a.patientName && patient.name) {
      return a.patientName.toLowerCase().includes(patient.name.split(" ")[0]?.toLowerCase() ?? "")
    }
    return false
  })

  return matches
    .map((a) => ({ a, t: new Date(`${a.date}T${a.time}:00`).getTime() }))
    .filter(({ t }) => !Number.isNaN(t) && t > now)
    .sort((x, y) => x.t - y.t)[0]?.a ?? null
}
