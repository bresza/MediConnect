import { apiRequest } from "./api"
import { isEdgeAutomationEnabled } from "./schemaSafe"
import { getPatientById } from "./patients"
import { sendOutboundMessage } from "./messaging"
import { resolveOutboundChannel } from "./messagingChannel"
import { formatAppointmentType, formatDate } from "../utils"
import type { Appointment, CommunicationFrequency, Patient } from "../types"

const STORAGE_KEY = "mediconnect:appointment-reminders:sent"

export const REMINDER_RULES = [
  { key: "d30", label: "30 dias", minHours: 29 * 24, maxHours: 31 * 24 },
  { key: "d15", label: "15 dias", minHours: 14 * 24, maxHours: 16 * 24 },
  { key: "d7",  label: "7 dias",  minHours: 6.5 * 24, maxHours: 7.5 * 24 },
  { key: "d3",  label: "3 dias",  minHours: 2.5 * 24, maxHours: 3.5 * 24 },
  { key: "h24", label: "24 horas", minHours: 22, maxHours: 26 },
] as const

export type ReminderRuleKey = (typeof REMINDER_RULES)[number]["key"]

export interface ReminderRunResult {
  checked: number
  sent: number
  skipped: number
  errors: string[]
}

function loadSentKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveSentKeys(keys: Set<string>): void {
  try {
    const trimmed = [...keys].slice(-5000)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage indisponivel.
  }
}

function reminderStorageKey(appointmentId: string, ruleKey: ReminderRuleKey): string {
  return `${appointmentId}:${ruleKey}`
}

function hoursUntilAppointment(date: string, time: string): number | null {
  const dt = new Date(`${date}T${time}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return (dt.getTime() - Date.now()) / (1000 * 60 * 60)
}

function rulesForFrequency(freq?: CommunicationFrequency): ReminderRuleKey[] {
  switch (freq) {
    case "EssentialOnly":
      return ["h24"]
    case "RemindersAndConfirmations":
      return ["d15", "d7", "d3", "h24"]
    case "All":
    default:
      return ["d30", "d15", "d7", "d3", "h24"]
  }
}

function buildReminderMessage(
  ruleKey: ReminderRuleKey,
  patientName: string,
  appointment: Appointment,
): string {
  const name = patientName.trim().split(/\s+/)[0] || patientName
  const doctor = appointment.doctorName || "equipe médica"
  const type = formatAppointmentType(appointment.type)
  const slot = `${formatDate(appointment.date)} às ${appointment.time}`
  const rule = REMINDER_RULES.find((r) => r.key === ruleKey)
  const when = rule?.label ?? "em breve"

  return (
    `Olá ${name}, lembrete MediConnect: sua ${type} com ${doctor} está agendada para ${slot} ` +
    `(${when}). Responda CONFIRMAR, REAGENDAR ou AJUDA. Para cancelar, fale com a recepção.`
  )
}

function isEligibleAppointment(appointment: Appointment): boolean {
  if (appointment.status === "cancelled" || appointment.status === "completed" || appointment.status === "absent") {
    return false
  }
  const hours = hoursUntilAppointment(appointment.date, appointment.time)
  return hours !== null && hours > 0
}

export async function runAppointmentReminders(
  appointments: Appointment[],
  patientsById?: Map<string, Patient>,
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { checked: 0, sent: 0, skipped: 0, errors: [] }
  const sentKeys = loadSentKeys()
  const eligible = appointments.filter(isEligibleAppointment)

  for (const appointment of eligible) {
    const hours = hoursUntilAppointment(appointment.date, appointment.time)
    if (hours === null) continue

    let patient = patientsById?.get(appointment.patientId)
    if (!patient) {
      try {
        patient = await getPatientById(appointment.patientId) ?? undefined
      } catch {
        patient = undefined
      }
    }

    if (!patient?.phone?.trim() || patient.optIn === false) {
      result.skipped += REMINDER_RULES.length
      continue
    }

    const allowedRules = rulesForFrequency(patient.communicationFrequency)
    const channel = resolveOutboundChannel(patient.preferredChannel)

    for (const rule of REMINDER_RULES) {
      result.checked += 1
      if (!allowedRules.includes(rule.key)) {
        result.skipped += 1
        continue
      }
      if (hours < rule.minHours || hours > rule.maxHours) {
        result.skipped += 1
        continue
      }

      const storageKey = reminderStorageKey(appointment.id, rule.key)
      if (sentKeys.has(storageKey)) {
        result.skipped += 1
        continue
      }

      try {
        const message = buildReminderMessage(rule.key, patient.socialName || patient.name, appointment)
        await sendOutboundMessage(
          channel,
          {
            phoneNumber: patient.phone,
            message,
            patientId: patient.id,
            appointmentId: appointment.id,
          },
          { fallbackSms: false },
        )
        sentKeys.add(storageKey)
        result.sent += 1
      } catch (err) {
        result.errors.push(
          err instanceof Error ? err.message : `Falha no lembrete ${rule.key} (${appointment.patientName})`,
        )
      }
    }
  }

  saveSentKeys(sentKeys)
  return result
}

/** Dispara lembrete no servidor (cron). Falha silenciosa se a funcao nao existir. */
export async function triggerServerAppointmentReminders(): Promise<ReminderRunResult | null> {
  if (!isEdgeAutomationEnabled()) return null
  try {
    return await apiRequest<ReminderRunResult>("/functions/v1/run-appointment-reminders", {
      method: "POST",
      body: { source: "frontend" },
      logErrors: false,
    })
  } catch {
    return null
  }
}
