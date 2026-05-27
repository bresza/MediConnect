import { useState, useEffect, useCallback } from "react"
import { getMessages, sendMessage } from "../../services/domain"
import { processInboundWhatsAppReplies } from "../../services/whatsappInbound"
import { runAppointmentReminders } from "../../services/appointmentReminders"
import type { Appointment, CommunicationChannel, Message, MessageTemplate, Patient } from "../../types"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import styles from "./Messages.module.css"

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 1, name: "Lembrete de consulta (48h)", channel: "WhatsApp", content: "Olá {nome}, lembrete da sua consulta em {data} às {hora}." },
  { id: 2, name: "Confirmação de agendamento", channel: "WhatsApp", content: "Olá {nome}, sua consulta foi confirmada para {data} às {hora}." },
  { id: 3, name: "Resultado de exame disponível", channel: "WhatsApp", content: "Olá {nome}, seu resultado de exame está disponível." },
  { id: 4, name: "Cancelamento de consulta", channel: "SMS", content: "Olá {nome}, sua consulta de {data} foi cancelada." },
  { id: 5, name: "Boas-vindas ao paciente", channel: "WhatsApp", content: "Olá {nome}, seja bem-vindo(a) à Clínica Mediconnect!" },
]

const CHANNEL_OPTIONS: CommunicationChannel[] = ["WhatsApp", "SMS"]

interface MessagesProps {
  appointments?: Appointment[]
  patients?: Patient[]
  clinicName?: string
}

export function Messages({
  appointments = [],
  patients: patientsProp = [],
  clinicName,
}: MessagesProps) {
  const [showModal,   setShowModal]   = useState(false)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [patients,    setPatients]    = useState<Patient[]>(patientsProp)
  const [patientId,   setPatientId]   = useState("")
  const [channel,     setChannel]     = useState<CommunicationChannel>("WhatsApp")
  const [fallbackSms, setFallbackSms] = useState(true)
  const [templateId,  setTemplateId]  = useState("")
  const [content,     setContent]     = useState("")
  const [error,       setError]       = useState<string | null>(null)
  const [isSending,   setIsSending]   = useState(false)
  const [automationStatus, setAutomationStatus] = useState<string | null>(null)
  const [isProcessingInbound, setIsProcessingInbound] = useState(false)

  const templates = MESSAGE_TEMPLATES.filter(
    (t) => t.channel === channel || t.channel === "SMS" || t.channel === "WhatsApp",
  )

  useEffect(() => {
    getMessages().then(setMessages)
  }, [])

  useEffect(() => {
    if (patientsProp.length > 0) setPatients(patientsProp)
  }, [patientsProp])

  const handleProcessInbound = useCallback(async () => {
    setIsProcessingInbound(true)
    setAutomationStatus(null)
    try {
      const inbound = await processInboundWhatsAppReplies(appointments, patients, clinicName)
      const reminders = await runAppointmentReminders(appointments, new Map(patients.map((p) => [p.id, p])))
      const parts: string[] = []
      if (inbound.replied > 0) parts.push(`${inbound.replied} resposta(s) automática(s)`)
      if (reminders.sent > 0) parts.push(`${reminders.sent} lembrete(s) enviado(s)`)
      if (inbound.errors.length > 0 || reminders.errors.length > 0) {
        parts.push([...inbound.errors, ...reminders.errors].join(" · "))
      }
      setAutomationStatus(parts.length > 0 ? parts.join(" · ") : "Nenhuma mensagem pendente no momento.")
    } catch (err) {
      setAutomationStatus(err instanceof Error ? err.message : "Falha ao processar automações.")
    } finally {
      setIsProcessingInbound(false)
    }
  }, [appointments, patients, clinicName])

  function closeModal() {
    setShowModal(false)
    setPatientId("")
    setChannel("WhatsApp")
    setFallbackSms(true)
    setTemplateId("")
    setContent("")
    setError(null)
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    const template = MESSAGE_TEMPLATES.find((t) => String(t.id) === id)
    const patient = patients.find((p) => p.id === patientId)
    if (template) {
      setChannel(template.channel === "SMS" ? "SMS" : "WhatsApp")
      setContent(template.content.replace(/\{nome\}/g, patient?.name ?? ""))
    }
    setError(null)
  }

  async function handleSend() {
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) { setError("Selecione o paciente."); return }
    if (!patient.phone) { setError("Paciente sem celular cadastrado."); return }
    if (!content.trim()) { setError("Digite a mensagem."); return }

    setIsSending(true)
    setError(null)
    try {
      const sent = await sendMessage({
        patientId: patient.id,
        patientName: patient.name,
        phoneNumber: patient.phone,
        channel,
        content: content.trim(),
        status: "Pending",
        date: new Date().toISOString().slice(0, 10),
        fallbackSms: channel === "WhatsApp" ? fallbackSms : undefined,
      })
      setMessages((prev) => [sent, ...prev])
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem.")
    } finally {
      setIsSending(false)
    }
  }

  const stats = [
    { label: "Entregues", value: messages.filter((m) => m.status === "Delivered").length, cls: styles.statGreen  },
    { label: "Pendentes", value: messages.filter((m) => m.status === "Pending").length,   cls: styles.statAmber  },
    { label: "Falhos",    value: messages.filter((m) => m.status === "Failed").length,    cls: styles.statRed    },
  ]

  const sendLabel = channel === "WhatsApp"
    ? (fallbackSms ? "Enviar WhatsApp (com SMS de reserva)" : "Enviar WhatsApp")
    : "Enviar SMS"

  return (
    <div>
      <Topbar
        title="Comunicação"
        subtitle="SMS, WhatsApp e respostas automáticas"
        action={<Button onClick={() => setShowModal(true)}>Nova mensagem</Button>}
      />

      <Card className={styles.automationCard}>
        <p className={styles.automationTitle}>Automação ativa</p>
        <p className={styles.automationText}>
          Lembretes automáticos: 30, 15 e 7 dias antes, 3 dias antes e 24h antes da consulta.
          Quando o paciente responder no WhatsApp (CONFIRMAR, HORÁRIO, REAGENDAR, AJUDA), o sistema envia a resposta adequada.
        </p>
        <div className={styles.automationActions}>
          <Button variant="outline" onClick={handleProcessInbound} disabled={isProcessingInbound}>
            {isProcessingInbound ? "Processando..." : "Processar respostas agora"}
          </Button>
        </div>
        {automationStatus && <p className={styles.automationStatus}>{automationStatus}</p>}
      </Card>

      <div className={styles.statsGrid}>
        {stats.map((s) => (
          <Card key={s.label} className={styles.statCard}>
            <p className={styles.statLabel}>{s.label}</p>
            <p className={`${styles.statValue} ${s.cls}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <div className={styles.layout}>
        <Card>
          <div className={styles.cardHeader}>
            <p className={styles.cardHeaderTitle}>Histórico de mensagens</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  {["Paciente", "Canal", "Mensagem", "Status", "Data"].map((h) => (
                    <th key={h} className={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className={`${styles.td} ${styles.tdLast}`}
                      style={{ textAlign: "center", color: "var(--muted-foreground)" }}
                    >
                      Nenhuma mensagem enviada nesta sessão.
                    </td>
                  </tr>
                )}
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1
                  return (
                    <tr key={m.id}>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.patientCell}>
                          <Avatar name={m.patientName} size="sm" />
                          <span className={styles.patientName}>{m.patientName}</span>
                        </div>
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{m.channel}</Badge></td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""} ${styles.truncate}`}>{m.content}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{m.status}</Badge></td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{m.date}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className={styles.templatesCard}>
          <p className={styles.templatesTitle}>Templates</p>
          <div className={styles.templateList}>
            {MESSAGE_TEMPLATES.map((tpl) => (
              <div key={tpl.id} className={styles.templateItem}>
                <div className={styles.templateItemHeader}>
                  <p className={styles.templateName}>{tpl.name}</p>
                  <Badge>{tpl.channel}</Badge>
                </div>
                <p className={styles.templateContent}>{tpl.content}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <Card className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Nova mensagem</h2>
            <div className={styles.modalFields}>
              <Select
                label="Paciente"
                options={patients.map((p) => ({ value: p.id, label: p.name }))}
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value)
                  setError(null)
                }}
              />
              <Select
                label="Canal"
                options={CHANNEL_OPTIONS}
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as CommunicationChannel)
                  setTemplateId("")
                  setError(null)
                }}
              />
              {channel === "WhatsApp" && (
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={fallbackSms}
                    onChange={(e) => setFallbackSms(e.target.checked)}
                  />
                  <span>Se WhatsApp falhar, enviar SMS (Twilio)</span>
                </label>
              )}
              <Select
                label="Template"
                options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
                placeholder="Selecionar template"
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
              />
              <textarea
                placeholder="Mensagem..."
                rows={4}
                className={styles.modalTextarea}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {error && <p style={{ marginTop: 10, fontSize: 12, color: "var(--destructive)" }}>{error}</p>}
            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button onClick={handleSend} disabled={isSending}>
                {isSending ? "Enviando..." : sendLabel}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
