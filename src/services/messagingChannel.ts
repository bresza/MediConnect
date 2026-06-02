import type { CommunicationChannel } from "../types"

/**
 * WhatsApp desligado por padrão. Ative com `VITE_WHATSAPP_ENABLED=true` no `.env`
 * quando a Evolution API voltar a operar.
 */
export function isWhatsAppOutboundEnabled(): boolean {
  return import.meta.env.VITE_WHATSAPP_ENABLED === "true"
}

export const DEFAULT_OUTBOUND_CHANNEL: CommunicationChannel = "SMS"

/** Canal efetivo para envio (SMS quando WhatsApp está inativo). */
export function resolveOutboundChannel(
  preferred?: CommunicationChannel | string | null,
): CommunicationChannel {
  if (!isWhatsAppOutboundEnabled()) return "SMS"
  if (preferred === "SMS") return "SMS"
  if (preferred === "WhatsApp") return "WhatsApp"
  return DEFAULT_OUTBOUND_CHANNEL
}
