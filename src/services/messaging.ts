import { ApiError, apiRequest, getApiToken } from "./api"
import { getMessages } from "./domain"
import { isWhatsAppOutboundEnabled, resolveOutboundChannel } from "./messagingChannel"
import type { CommunicationChannel } from "../types"

/** Telefone em E.164 (+55DDDNUMERO). */
export function toE164BR(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("55")) return `+${digits}`
  return `+55${digits}`
}

export interface OutboundMessageInput {
  phoneNumber: string
  message: string
  patientId?: string
  appointmentId?: string
}

export type SendSmsInput = OutboundMessageInput

export interface SendWhatsAppInput extends OutboundMessageInput {
  /** Se true, envia SMS via Twilio quando o WhatsApp falhar. */
  fallbackSms?: boolean
}

export interface SendResult {
  channel: "sms" | "whatsapp"
  status: "sent" | "pending" | "failed"
  messageId?: string
}

interface SendSmsApiResponse {
  success?: boolean
  message_sid?: string
  sid?: string
  id?: string | number
  error?: string
  message?: string
}

interface SendWhatsAppApiResponse {
  success?: boolean
  channel?: "whatsapp" | "sms"
  message_id?: string
  error?: string
  message?: string
  detail?: string
  title?: string
}

export interface GetMessagesOptions {
  limit?: number
  offset?: number
}

/** Paginated message fetch (delegates to domain until dedicated table exists). */
export async function getMessagesPaginated(options: GetMessagesOptions = {}) {
  const { limit = 100, offset = 0 } = options
  const all = await getMessages()
  return all.slice(offset, offset + limit)
}

function assertAuthenticated(): void {
  const token = getApiToken()
  if (!token || token.startsWith("local-")) {
    throw new Error("Faça login para enviar mensagens.")
  }
}

function validateOutbound(input: OutboundMessageInput): { message: string; phone_number: string } {
  const message = input.message.trim()
  const phone_number = toE164BR(input.phoneNumber)
  if (!message) throw new Error("Mensagem não pode ser vazia.")
  if (!phone_number) throw new Error("Telefone inválido. Informe DDD + número.")
  return { message, phone_number }
}

function buildOptionalIds(input: OutboundMessageInput): Record<string, string> {
  const out: Record<string, string> = {}
  const patientId = input.patientId == null ? "" : String(input.patientId).trim()
  const appointmentId = input.appointmentId == null ? "" : String(input.appointmentId).trim()
  if (patientId) out.patient_id = patientId
  if (appointmentId) out.appointment_id = appointmentId
  return out
}

function buildOptionalPatientId(input: OutboundMessageInput): Record<string, string> {
  const patientId = input.patientId == null ? "" : String(input.patientId).trim()
  return patientId ? { patient_id: patientId } : {}
}

async function callEdgeFunction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  assertAuthenticated()
  try {
    return await apiRequest<T>(path, { method: "POST", body, logErrors: false })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const shortPath = path.replace("/functions/v1", "")
      return apiRequest<T>(shortPath, { method: "POST", body })
    }
    throw err
  }
}

function mapDeliveryStatus(raw?: string): SendResult["status"] {
  const s = (raw ?? "").toLowerCase()
  if (s.includes("fail") || s.includes("error")) return "failed"
  if (s.includes("sent") || s.includes("deliver") || s.includes("queue")) return "sent"
  return "pending"
}

export async function sendSms(input: SendSmsInput): Promise<SendResult> {
  const { message, phone_number } = validateOutbound(input)
  let res: SendSmsApiResponse
  try {
    res = await callEdgeFunction<SendSmsApiResponse>("/functions/v1/send-sms", {
      message,
      phone_number,
      ...buildOptionalPatientId(input),
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) {
      throw new Error("Serviço de SMS temporariamente desabilitado. Tente novamente mais tarde.")
    }
    throw err
  }
  if (res.error || res.success === false) {
    throw new Error(res.error ?? res.message ?? "Falha ao enviar SMS.")
  }
  const messageId = res.message_sid ?? res.sid ?? (res.id != null ? String(res.id) : "")
  const accepted = res.success === true || Boolean(messageId)
  if (!accepted) {
    throw new Error(res.message ?? "A API não confirmou o envio do SMS.")
  }
  return {
    channel: "sms",
    status: messageId ? "sent" : "pending",
    messageId,
  }
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendResult> {
  if (!isWhatsAppOutboundEnabled()) {
    return sendSms(input)
  }
  const { message, phone_number } = validateOutbound(input)
  const res = await callEdgeFunction<SendWhatsAppApiResponse>("/functions/v1/send-whatsapp", {
    message,
    phone_number,
    fallback_sms: input.fallbackSms ?? false,
    ...buildOptionalIds(input),
  })
  if (res.error || res.title) {
    throw new Error(res.error ?? res.detail ?? res.message ?? "Falha ao enviar WhatsApp.")
  }
  const channel = res.channel === "sms" ? "sms" : "whatsapp"
  return {
    channel,
    status: mapDeliveryStatus(res.success === false ? "failed" : "sent"),
    messageId: res.message_id,
  }
}

export async function sendOutboundMessage(
  channel: CommunicationChannel | "SMS" | "WhatsApp",
  input: OutboundMessageInput,
  options?: { fallbackSms?: boolean },
): Promise<SendResult> {
  const effective = resolveOutboundChannel(channel)
  if (effective === "WhatsApp") {
    return sendWhatsApp({ ...input, fallbackSms: options?.fallbackSms })
  }
  return sendSms(input)
}
