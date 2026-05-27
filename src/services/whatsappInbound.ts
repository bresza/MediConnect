import { ApiError, apiRequest } from "./api"
import { isEdgeAutomationEnabled } from "./schemaSafe"
import { getPatients } from "./patients"
import { sendWhatsApp, toE164BR } from "./messaging"
import {
  buildWhatsAppAutoReply,
  detectWhatsAppIntent,
  findNextAppointmentForPatient,
  type WhatsAppIntent,
} from "./whatsappAutoReply"
import type { Appointment, Patient } from "../types"

export interface InboundWhatsAppMessage {
  id: string
  phone_number: string
  message: string
  patient_id?: string
  appointment_id?: string
  created_at?: string
  processed?: boolean
}

export interface ProcessInboundResult {
  processed: number
  replied: number
  skipped: number
  errors: string[]
  replies: Array<{ inboundId: string; intent: WhatsAppIntent; reply: string }>
}

interface ProcessInboundApiResponse {
  processed?: number
  replied?: number
  messages?: InboundWhatsAppMessage[]
  errors?: string[]
}

const PROCESSED_LOCAL_KEY = "mediconnect:whatsapp-inbound:processed"

function loadLocalProcessed(): Set<string> {
  try {
    const raw = localStorage.getItem(PROCESSED_LOCAL_KEY)
    const parsed = raw ? JSON.parse(raw) as string[] : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveLocalProcessed(ids: Set<string>): void {
  try {
    localStorage.setItem(PROCESSED_LOCAL_KEY, JSON.stringify([...ids].slice(-2000)))
  } catch {
    // ignore
  }
}

async function fetchPendingInbound(): Promise<InboundWhatsAppMessage[]> {
  const paths = [
    "/rest/v1/whatsapp_messages?direction=eq.inbound&processed=eq.false&order=created_at.asc&limit=50",
    "/rest/v1/patient_messages?direction=eq.inbound&processed=eq.false&order=created_at.asc&limit=50",
  ]

  for (const path of paths) {
    try {
      const rows = await apiRequest<InboundWhatsAppMessage[]>(path, { logErrors: false })
      if (Array.isArray(rows) && rows.length > 0) return rows
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) continue
    }
  }
  return []
}

async function markInboundProcessed(id: string): Promise<void> {
  const bodies = [{ processed: true }, { status: "processed" }]
  const paths = [
    `/rest/v1/whatsapp_messages?id=eq.${encodeURIComponent(id)}`,
    `/rest/v1/patient_messages?id=eq.${encodeURIComponent(id)}`,
  ]

  for (const path of paths) {
    for (const body of bodies) {
      try {
        await apiRequest(path, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body,
          logErrors: false,
        })
        return
      } catch {
        // tenta proxima combinacao
      }
    }
  }
}

function matchPatientByPhone(patients: Patient[], phoneNumber: string): Patient | undefined {
  const digits = phoneNumber.replace(/\D/g, "")
  if (!digits) return undefined
  return patients.find((p) => {
    const pDigits = p.phone?.replace(/\D/g, "") ?? ""
    if (!pDigits) return false
    return pDigits === digits || pDigits.endsWith(digits.slice(-11)) || digits.endsWith(pDigits.slice(-11))
  })
}

/** Processa respostas pendentes no servidor (webhook + fila). */
export async function processInboundViaServer(): Promise<ProcessInboundResult | null> {
  if (!isEdgeAutomationEnabled()) return null
  try {
    const res = await apiRequest<ProcessInboundApiResponse>("/functions/v1/process-whatsapp-inbound", {
      method: "POST",
      body: { mode: "poll" },
      logErrors: false,
    })
    return {
      processed: res.processed ?? 0,
      replied: res.replied ?? 0,
      skipped: 0,
      errors: res.errors ?? [],
      replies: [],
    }
  } catch {
    return null
  }
}

/** Processa inbound localmente (quando a API expõe fila REST). */
export async function processInboundWhatsAppReplies(
  appointments: Appointment[],
  patients?: Patient[],
  clinicName?: string,
): Promise<ProcessInboundResult> {
  const serverResult = await processInboundViaServer()
  if (serverResult && serverResult.replied > 0) return serverResult

  const result: ProcessInboundResult = {
    processed: 0,
    replied: 0,
    skipped: 0,
    errors: [],
    replies: [],
  }

  const allPatients = patients ?? await getPatients().catch(() => [])
  const pending = await fetchPendingInbound()
  const processedLocal = loadLocalProcessed()

  for (const inbound of pending) {
    if (processedLocal.has(inbound.id)) {
      result.skipped += 1
      continue
    }

    result.processed += 1
    const phone = toE164BR(inbound.phone_number)
    if (!phone || !inbound.message?.trim()) {
      result.skipped += 1
      processedLocal.add(inbound.id)
      continue
    }

    const patient =
      (inbound.patient_id ? allPatients.find((p) => p.id === inbound.patient_id) : undefined) ??
      matchPatientByPhone(allPatients, phone)

    if (!patient || patient.optIn === false) {
      result.skipped += 1
      await markInboundProcessed(inbound.id).catch(() => undefined)
      processedLocal.add(inbound.id)
      continue
    }

    const intent = detectWhatsAppIntent(inbound.message)
    const nextAppointment = findNextAppointmentForPatient(appointments, patient)
    const reply = buildWhatsAppAutoReply(intent, {
      patient,
      nextAppointment,
      clinicName,
    })

    try {
      await sendWhatsApp({
        phoneNumber: patient.phone,
        message: reply,
        patientId: patient.id,
        appointmentId: nextAppointment?.id ?? inbound.appointment_id,
        fallbackSms: true,
      })
      await markInboundProcessed(inbound.id).catch(() => undefined)
      processedLocal.add(inbound.id)
      result.replied += 1
      result.replies.push({ inboundId: inbound.id, intent, reply })
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Falha ao responder WhatsApp")
    }
  }

  saveLocalProcessed(processedLocal)
  return result
}
