// Edge Function: run-appointment-reminders
// Cron diário (ou trigger do frontend) para lembretes 30d, 15d, 7d, 3d, 24h.
//
// Deploy:
//   supabase functions deploy run-appointment-reminders
//   supabase secrets set CRON_SECRET=...
// Cron Supabase: POST com header x-cron-secret

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? ""

const REMINDER_RULES = [
  { key: "d30", minHours: 29 * 24, maxHours: 31 * 24 },
  { key: "d15", minHours: 14 * 24, maxHours: 16 * 24 },
  { key: "d7",  minHours: 6.5 * 24, maxHours: 7.5 * 24 },
  { key: "d3",  minHours: 2.5 * 24, maxHours: 3.5 * 24 },
  { key: "h24", minHours: 22, maxHours: 26 },
] as const

type RuleKey = (typeof REMINDER_RULES)[number]["key"]

interface AppointmentRow {
  id: string
  patient_id: string
  patient_name?: string
  doctor_name?: string
  date: string
  time: string
  type?: string
  status?: string
}

interface PatientRow {
  id: string
  name: string
  social_name?: string
  phone?: string
  opt_in?: boolean
  preferred_channel?: string
  communication_frequency?: string
}

interface SentRow {
  appointment_id: string
  rule_key: string
}

function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

function hoursUntil(date: string, time: string): number | null {
  const dt = new Date(`${date}T${time}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return (dt.getTime() - Date.now()) / (1000 * 60 * 60)
}

function rulesForFrequency(freq?: string): RuleKey[] {
  switch (freq) {
    case "EssentialOnly":
      return ["h24"]
    case "RemindersAndConfirmations":
      return ["d15", "d7", "d3", "h24"]
    default:
      return ["d30", "d15", "d7", "d3", "h24"]
  }
}

function labelForRule(key: RuleKey): string {
  const map: Record<RuleKey, string> = {
    d30: "30 dias",
    d15: "15 dias",
    d7: "7 dias",
    d3: "3 dias",
    h24: "24 horas",
  }
  return map[key]
}

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) return null
  if (res.status === 204) return null
  return (await res.json()) as T
}

async function alreadySent(appointmentId: string, ruleKey: string): Promise<boolean> {
  const rows = await rest<SentRow[]>(
    `/rest/v1/appointment_reminder_sent?appointment_id=eq.${appointmentId}&rule_key=eq.${ruleKey}&select=appointment_id&limit=1`,
  )
  return Array.isArray(rows) && rows.length > 0
}

async function markSent(appointmentId: string, ruleKey: string): Promise<void> {
  await rest("/rest/v1/appointment_reminder_sent", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ appointment_id: appointmentId, rule_key: ruleKey, sent_at: new Date().toISOString() }),
  })
}

async function sendMessage(phone: string, message: string, patientId: string, appointmentId: string, channel: string): Promise<boolean> {
  const path = channel === "SMS" ? "/functions/v1/send-sms" : "/functions/v1/send-whatsapp"
  const digits = phone.replace(/\D/g, "")
  const phone_number = digits.startsWith("55") ? `+${digits}` : `+55${digits}`
  const payload = channel === "SMS"
    ? {
        phone_number,
        message,
        patient_id: patientId,
      }
    : {
        phone_number,
        message,
        patient_id: patientId,
        appointment_id: appointmentId,
        fallback_sms: true,
      }
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  return res.ok
}

function isAuthorized(req: Request): boolean {
  const cronHeader = req.headers.get("x-cron-secret")
  if (CRON_SECRET && cronHeader === CRON_SECRET) return true
  return Boolean(req.headers.get("Authorization")?.startsWith("Bearer "))
}

Deno.serve(async (req) => {
  const headers = cors(req)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers)
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401, headers)

  const appointments = (await rest<AppointmentRow[]>(
    "/rest/v1/appointments?select=id,patient_id,patient_name,doctor_name,date,time,type,status&status=neq.cancelled&status=neq.completed&limit=1000",
  )) ?? []

  const patients = (await rest<PatientRow[]>(
    "/rest/v1/patients?select=id,name,social_name,phone,opt_in,preferred_channel,communication_frequency&limit=2000",
  )) ?? []

  const patientById = new Map(patients.map((p) => [p.id, p]))
  let checked = 0
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const appt of appointments) {
    const hours = hoursUntil(appt.date, appt.time)
    if (hours === null || hours <= 0) continue

    const patient = patientById.get(appt.patient_id)
    if (!patient?.phone?.trim() || patient.opt_in === false) {
      skipped += REMINDER_RULES.length
      continue
    }

    const allowed = rulesForFrequency(patient.communication_frequency)
    const channel = patient.preferred_channel === "SMS" ? "SMS" : "WhatsApp"
    const name = (patient.social_name ?? patient.name).trim().split(/\s+/)[0] || patient.name

    for (const rule of REMINDER_RULES) {
      checked += 1
      if (!allowed.includes(rule.key)) {
        skipped += 1
        continue
      }
      if (hours < rule.minHours || hours > rule.maxHours) {
        skipped += 1
        continue
      }
      if (await alreadySent(appt.id, rule.key)) {
        skipped += 1
        continue
      }

      const when = labelForRule(rule.key)
      const message =
        `Olá ${name}, lembrete MediConnect: consulta com ${appt.doctor_name ?? "a equipe"} em ${appt.date} às ${appt.time} ` +
        `(${when}). Responda CONFIRMAR, REAGENDAR ou AJUDA.`

      try {
        const ok = await sendMessage(patient.phone!, message, patient.id, appt.id, channel)
        if (ok) {
          await markSent(appt.id, rule.key).catch(() => undefined)
          sent += 1
        } else {
          errors.push(`Falha ao enviar ${rule.key} (${appt.id})`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `Erro ${rule.key}`)
      }
    }
  }

  return json({ checked, sent, skipped, errors }, 200, headers)
})
