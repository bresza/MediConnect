import { useEffect, useRef } from "react"
import { runAppointmentReminders } from "../services/appointmentReminders"
import { processInboundWhatsAppReplies } from "../services/whatsappInbound"
import { isWhatsAppOutboundEnabled } from "../services/messagingChannel"
import { isEdgeAutomationEnabled, isInboundRestEnabled } from "../services/schemaSafe"
import type { Appointment, Patient } from "../types"

const REMINDER_INTERVAL_MS = 15 * 60 * 1000
const INBOUND_INTERVAL_MS = 45 * 1000

interface Options {
  enabled: boolean
  appointments: Appointment[]
  patients: Patient[]
  clinicName?: string
  onActivity?: (summary: string) => void
}

/**
 * Enquanto o painel estiver aberto (secretaria/gestão), dispara:
 * - lembretes de consulta (30d, 15d, 7d, 3d, 24h)
 * - respostas automáticas a mensagens WhatsApp recebidas
 */
export function useMessagingAutomation({
  enabled,
  appointments,
  patients,
  clinicName,
  onActivity,
}: Options): void {
  const runningRef = useRef(false)
  const patientsMapRef = useRef(new Map<string, Patient>())

  useEffect(() => {
    patientsMapRef.current = new Map(patients.map((p) => [p.id, p]))
  }, [patients])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function tick() {
      if (runningRef.current || cancelled) return
      runningRef.current = true
      try {
        const patientMap = patientsMapRef.current

        const localReminders = await runAppointmentReminders(appointments, patientMap)

        const parts: string[] = []
        if (localReminders.sent > 0) parts.push(`${localReminders.sent} lembrete(s)`)

        if (isWhatsAppOutboundEnabled() && (isEdgeAutomationEnabled() || isInboundRestEnabled())) {
          const inbound = await processInboundWhatsAppReplies(appointments, patients, clinicName)
          if (inbound.replied > 0) parts.push(`${inbound.replied} resposta(s) WhatsApp`)
        }

        if (parts.length > 0) onActivity?.(parts.join(" · "))
      } catch (err) {
        console.warn("[messagingAutomation]", err)
      } finally {
        runningRef.current = false
      }
    }

    void tick()
    const reminderTimer = window.setInterval(() => void tick(), REMINDER_INTERVAL_MS)

    let inboundTimer: number | undefined
    if (isWhatsAppOutboundEnabled() && (isEdgeAutomationEnabled() || isInboundRestEnabled())) {
      inboundTimer = window.setInterval(() => {
        if (cancelled) return
        void processInboundWhatsAppReplies(appointments, patients, clinicName).then((inbound) => {
          if (inbound.replied > 0) {
            onActivity?.(`${inbound.replied} resposta(s) automática(s) no WhatsApp`)
          }
        })
      }, INBOUND_INTERVAL_MS)
    }

    return () => {
      cancelled = true
      window.clearInterval(reminderTimer)
      if (inboundTimer !== undefined) window.clearInterval(inboundTimer)
    }
  }, [enabled, appointments, patients, clinicName, onActivity])
}
