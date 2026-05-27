// Edge Function: process-whatsapp-inbound
// Webhook Evolution API + processamento de fila REST (whatsapp_messages).
//
// Deploy:
//   supabase functions deploy process-whatsapp-inbound
// Configure webhook Evolution → POST .../process-whatsapp-inbound

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? ""

type WhatsAppIntent = "confirm" | "reschedule" | "cancel" | "schedule_info" | "help" | "thanks" | "unknown"

interface InboundRow {
  id: string
  phone_number: string
  message: string
  patient_id?: string
  processed?: boolean
}

interface PatientRow {
  id: string
  name: string
  social_name?: string
  phone?: string
  opt_in?: boolean
}

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

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "*"
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Vary": "Origin",
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function detectIntent(text: string): WhatsAppIntent {
  const t = normalizeText(text)
  if (!t) return "unknown"
  if (/^(sim|ok|confirmo|confirmar|confirmado|vou|pode ser|ta bom|tá bom|beleza)$/.test(t) || /\bconfirm/.test(t)) return "confirm"
  if (/\b(cancel|desmarc|nao vou|não vou)\b/.test(t)) return "cancel"
  if (/\b(reagend|remarc|mudar horario|mudar data)\b/.test(t)) return "reschedule"
  if (/\b(horario|hora|data|quando|dia|consulta)\b/.test(t)) return "schedule_info"
  if (/\b(obrigad|valeu|agradeço|agradeco)\b/.test(t)) return "thanks"
  if (/\b(ajuda|menu|opcoes|opções|oi|ola|olá)\b/.test(t)) return "help"
  return "unknown"
}

function buildReply(intent: WhatsAppIntent, name: string, appt?: AppointmentRow | null): string {
  const clinic = "MediConnect"
  const slot = appt ? `${appt.date} às ${appt.time}` : null
  switch (intent) {
    case "confirm":
      return appt
        ? `Perfeito, ${name}! Confirmamos sua consulta com ${appt.doctor_name ?? "a equipe"} em ${slot}. — ${clinic}`
        : `Obrigado, ${name}! Confirmação registrada. Responda AJUDA se precisar. — ${clinic}`
    case "reschedule":
      return `${name}, para reagendar acesse o portal ou fale com a recepção. Responda HORÁRIO para ver a próxima consulta. — ${clinic}`
    case "cancel":
      return `${name}, para cancelar entre em contato com a recepção. Para remarcar, responda REAGENDAR. — ${clinic}`
    case "schedule_info":
      return appt
        ? `${name}, sua próxima consulta: ${slot} com ${appt.doctor_name ?? "a equipe"}. Responda CONFIRMAR. — ${clinic}`
        : `${name}, não encontramos consulta futura. Fale com a recepção. — ${clinic}`
    case "thanks":
      return `Por nada, ${name}! — ${clinic}`
    default:
      return (
        `Olá ${name}! Responda:\n• CONFIRMAR\n• HORÁRIO\n• REAGENDAR\n• CANCELAR\n— ${clinic}`
      )
  }
}

function extractPhoneFromWebhook(body: Record<string, unknown>): string {
  const direct = body.phone_number ?? body.phone
  if (typeof direct === "string" && direct.trim()) return direct.replace(/\D/g, "")

  const data = body.data as Record<string, unknown> | undefined
  const key = data?.key as Record<string, unknown> | undefined
  const jid = key?.remoteJid
  if (typeof jid === "string") return jid.split("@")[0]?.replace(/\D/g, "") ?? ""

  const message = data?.message as Record<string, unknown> | undefined
  const from = message?.from
  if (typeof from === "string") return from.replace(/\D/g, "")

  return ""
}

function extractTextFromWebhook(body: Record<string, unknown>): string {
  const direct = body.message ?? body.text
  if (typeof direct === "string") return direct

  const data = body.data as Record<string, unknown> | undefined
  const message = data?.message as Record<string, unknown> | undefined
  const conversation = message?.conversation
  if (typeof conversation === "string") return conversation

  const extended = message?.extendedTextMessage as Record<string, unknown> | undefined
  const extText = extended?.text
  if (typeof extText === "string") return extText

  return ""
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

async function fetchPendingInbound(): Promise<InboundRow[]> {
  const rows = await rest<InboundRow[]>(
    "/rest/v1/whatsapp_messages?direction=eq.inbound&processed=eq.false&order=created_at.asc&limit=50",
  )
  return Array.isArray(rows) ? rows : []
}

async function markProcessed(id: string): Promise<void> {
  await rest(`/rest/v1/whatsapp_messages?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ processed: true }),
  })
}

async function fetchPatients(): Promise<PatientRow[]> {
  const rows = await rest<PatientRow[]>("/rest/v1/patients?select=id,name,social_name,phone,opt_in&limit=500")
  return Array.isArray(rows) ? rows : []
}

async function fetchAppointments(): Promise<AppointmentRow[]> {
  const rows = await rest<AppointmentRow[]>(
    "/rest/v1/appointments?select=id,patient_id,patient_name,doctor_name,date,time,type,status&status=neq.cancelled&limit=500",
  )
  return Array.isArray(rows) ? rows : []
}

function matchPatient(patients: PatientRow[], phoneDigits: string): PatientRow | undefined {
  return patients.find((p) => {
    const d = (p.phone ?? "").replace(/\D/g, "")
    if (!d) return false
    return d === phoneDigits || d.endsWith(phoneDigits.slice(-11)) || phoneDigits.endsWith(d.slice(-11))
  })
}

function nextAppointment(appts: AppointmentRow[], patientId: string): AppointmentRow | undefined {
  const now = Date.now()
  return appts
    .filter((a) => a.patient_id === patientId && a.status !== "completed" && a.status !== "cancelled")
    .map((a) => ({ a, t: new Date(`${a.date}T${a.time}:00`).getTime() }))
    .filter(({ t }) => !Number.isNaN(t) && t > now)
    .sort((x, y) => x.t - y.t)[0]?.a
}

async function sendWhatsApp(phone: string, message: string, patientId?: string, appointmentId?: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) return false
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: phone.startsWith("+") ? phone : `+55${phone.replace(/\D/g, "")}`,
      message,
      patient_id: patientId,
      appointment_id: appointmentId,
      fallback_sms: true,
    }),
  })
  return res.ok
}

async function processOne(
  phoneDigits: string,
  text: string,
  patients: PatientRow[],
  appointments: AppointmentRow[],
  patientIdHint?: string,
): Promise<boolean> {
  const patient =
    (patientIdHint ? patients.find((p) => p.id === patientIdHint) : undefined) ??
    matchPatient(patients, phoneDigits)

  if (!patient || patient.opt_in === false) return false

  const name = (patient.social_name ?? patient.name).trim().split(/\s+/)[0] || patient.name
  const intent = detectIntent(text)
  const appt = nextAppointment(appointments, patient.id)
  const reply = buildReply(intent, name, appt)
  const phone = patient.phone ?? phoneDigits
  return sendWhatsApp(phone, reply, patient.id, appt?.id)
}

function isAuthorized(req: Request): boolean {
  const cronHeader = req.headers.get("x-cron-secret")
  if (CRON_SECRET && cronHeader === CRON_SECRET) return true
  const auth = req.headers.get("Authorization")
  return Boolean(auth?.startsWith("Bearer "))
}

Deno.serve(async (req) => {
  const headers = cors(req)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers)
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401, headers)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: "Invalid JSON" }, 400, headers)
  }

  const patients = await fetchPatients()
  const appointments = await fetchAppointments()
  const errors: string[] = []
  let processed = 0
  let replied = 0

  const mode = typeof body.mode === "string" ? body.mode : "webhook"

  if (mode === "poll") {
    const pending = await fetchPendingInbound()
    for (const row of pending) {
      processed += 1
      const digits = row.phone_number.replace(/\D/g, "")
      try {
        const ok = await processOne(digits, row.message, patients, appointments, row.patient_id)
        if (ok) {
          replied += 1
          await markProcessed(row.id)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "process error")
      }
    }
    return json({ processed, replied, errors }, 200, headers)
  }

  const phoneDigits = extractPhoneFromWebhook(body)
  const text = extractTextFromWebhook(body)
  if (!phoneDigits || !text.trim()) {
    return json({ error: "phone_number and message required" }, 400, headers)
  }

  processed = 1
  try {
    const ok = await processOne(phoneDigits, text, patients, appointments)
    if (ok) replied = 1
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "webhook error")
  }

  return json({ processed, replied, errors }, 200, headers)
})
