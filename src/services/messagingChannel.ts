import type { CommunicationChannel } from "../types"

/** WhatsApp desligado por padrão; ative com VITE_WHATSAPP_ENABLED=true quando disponível. */
export function isWhatsAppOutboundEnabled(): boolean {
  return import.meta.env.VITE_WHATSAPP_ENABLED === "true"
}

export const DEFAULT_OUTBOUND_CHANNEL: CommunicationChannel = "SMS"

export function resolveOutboundChannel(
  preferred?: CommunicationChannel | string | null,
): CommunicationChannel {
  if (!isWhatsAppOutboundEnabled()) return "SMS"
  if (preferred === "SMS") return "SMS"
  if (preferred === "WhatsApp") return "WhatsApp"
  return DEFAULT_OUTBOUND_CHANNEL
}
