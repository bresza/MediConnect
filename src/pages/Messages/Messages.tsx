import { useState, useEffect, useCallback } from "react"
import { getMessages, sendMessage } from "../../services/domain"
import { isWhatsAppOutboundEnabled } from "../../services/messagingChannel"
import { runAppointmentReminders } from "../../services/appointmentReminders"
import { findNextAppointmentForPatient } from "../../services/whatsappAutoReply"
import type { Appointment, CommunicationChannel, Message, MessageTemplate, Patient } from "../../types"
import {
  fillMessageTemplate,
  hasUnresolvedMessagePlaceholders,
  messageTemplateNeedsAppointment,
} from "../../utils/messageTemplates"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import styles from "./Messages.module.css"

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 1, name: "Lembrete de consulta (48h)", channel: "SMS", content: "Olá {nome}, lembrete da sua consulta em {data} às {hora}." },
  { id: 2, name: "Confirmação de agendamento", channel: "SMS", content: "Olá {nome}, sua consulta foi confirmada para {data} às {hora}." },
  { id: 3, name: "Resultado de exame disponível", channel: "SMS", content: "Olá {nome}, seu resultado de exame está disponível." },
  { id: 4, name: "Cancelamento de consulta", channel: "SMS", content: "Olá {nome}, sua consulta de {data} foi cancelada." },
  { id: 5, name: "Boas-vindas ao paciente", channel: "SMS", content: "Olá {nome}, seja bem-vindo(a) à Clínica Mediconnect!" },
]

const CHANNEL_OPTIONS: CommunicationChannel[] = isWhatsAppOutboundEnabled()
  ? ["SMS", "WhatsApp"]
  : ["SMS"]

interface MessagesProps {
  appointments?: Appointment[]
  patients?: Patient[]
  clinicName?: string
}

export function Messages({
  appointments = [],
  patients: patientsProp = [],
}: MessagesProps) {
  const [showModal,   setShowModal]   = useState(false)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [patients,    setPatients]    = useState<Patient[]>(patientsProp)
  const [patientId,   setPatientId]   = useState("")
  const [channel,     setChannel]     = useState<CommunicationChannel>("SMS")
  const [templateId,  setTemplateId]  = useState("")
  const [content,     setContent]     = useState("")
  const [error,       setError]       = useState<string | null>(null)
  const [sendNotice,  setSendNotice]  = useState<string | null>(null)
  const [isSending,   setIsSending]   = useState(false)
  const [automationStatus, setAutomationStatus] = useState<string | null>(null)
  const [isProcessingInbound, setIsProcessingInbound] = useState(false)

  const templates = MESSAGE_TEMPLATES.filter((t) => t.channel === channel)

  useEffect(() => {
    getMessages().then(setMessages)
  }, [])

  useEffect(() => {
    if (patientsProp.length > 0) setPatients(patientsProp)
  }, [patientsProp])

  const handleProcessReminders = useCallback(async () => {
    setIsProcessingInbound(true)
    setAutomationStatus(null)
    try {
      const reminders = await runAppointmentReminders(appointments, new Map(patients.map((p) => [p.id, p])))
      const parts: string[] = []
      if (reminders.sent > 0) parts.push(`${reminders.sent} lembrete(s) SMS enviado(s)`)
      if (reminders.errors.length > 0) parts.push(reminders.errors.join(" · "))
      setAutomationStatus(parts.length > 0 ? parts.join(" · ") : "Nenhum lembrete pendente no momento.")
    } catch (err) {
      setAutomationStatus(err instanceof Error ? err.message : "Falha ao processar lembretes.")
    } finally {
      setIsProcessingInbound(false)
    }
  }, [appointments, patients])

  function closeModal() {
    setShowModal(false)
    setPatientId("")
    setChannel("SMS")
    setTemplateId("")
    setContent("")
    setError(null)
    setSendNotice(null)
  }

  function applyTemplate(id: string, pid: string) {
    const template = MESSAGE_TEMPLATES.find((t) => String(t.id) === id)
    const patient = patients.find((p) => p.id === pid)
    if (!template) return

    setChannel("SMS")
    const appointment = patient ? findNextAppointmentForPatient(appointments, patient) : null
    if (messageTemplateNeedsAppointment(template.content) && !appointment) {
      setError("Este paciente não tem consulta futura agendada. Agende antes ou edite a mensagem manualmente.")
      setContent(fillMessageTemplate(template.content, patient, null))
      return
    }
    setError(null)
    setContent(fillMessageTemplate(template.content, patient, appointment))
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    if (id) applyTemplate(id, patientId)
    else setError(null)
  }

  async function handleSend() {
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) { setError("Selecione o paciente."); return }
    if (!patient.phone) { setError("Paciente sem celular cadastrado."); return }
    if (!content.trim()) { setError("Digite a mensagem."); return }

    const appointment = findNextAppointmentForPatient(appointments, patient)
    const resolvedContent = fillMessageTemplate(content.trim(), patient, appointment)
    if (hasUnresolvedMessagePlaceholders(resolvedContent)) {
      setError("A mensagem ainda contém {data} ou {hora}. Selecione um paciente com consulta agendada ou preencha manualmente.")
      return
    }

    setIsSending(true)
    setError(null)
    setSendNotice(null)
    try {
      const sent = await sendMessage({
        patientId: patient.id,
        patientName: patient.name,
        phoneNumber: patient.phone,
        channel: "SMS",
        content: resolvedContent,
        status: "Pending",
        date: new Date().toISOString().slice(0, 10),
      })
      setMessages((prev) => [sent, ...prev])
      const phoneHint = patient.phone.replace(/\D/g, "").slice(-4)
      const statusHint =
        sent.status === "Delivered"
          ? "aceito pela operadora"
          : sent.status === "Pending"
            ? "aguardando confirmação"
            : "falhou"
      setSendNotice(
        `SMS ${statusHint} para ***${phoneHint}. Se não chegar em alguns minutos, confira o celular no cadastro e peça ao time da API para revisar o Twilio.`,
      )
      setShowModal(false)
      setPatientId("")
      setTemplateId("")
      setContent("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar SMS.")
    } finally {
      setIsSending(false)
    }
  }

  const stats = [
    { label: "Entregues", value: messages.filter((m) => m.status === "Delivered").length, cls: styles.statGreen  },
    { label: "Pendentes", value: messages.filter((m) => m.status === "Pending").length,   cls: styles.statAmber  },
    { label: "Falhos",    value: messages.filter((m) => m.status === "Failed").length,    cls: styles.statRed    },
  ]

  return (
    <div>
      <Topbar
        title="Comunicação"
        subtitle="Envio de SMS (Twilio)"
        action={<Button onClick={() => setShowModal(true)}>Nova mensagem SMS</Button>}
      />

      <Card className={styles.automationCard}>
        <p className={styles.automationTitle}>Lembretes automáticos</p>
        <p className={styles.automationText}>
          Dispara lembretes por SMS: 30, 15 e 7 dias antes, 3 dias antes e 24h antes da consulta (pacientes com opt-in e celular válido).
        </p>
        <div className={styles.automationActions}>
          <Button variant="outline" onClick={handleProcessReminders} disabled={isProcessingInbound}>
            {isProcessingInbound ? "Processando..." : "Enviar lembretes agora"}
          </Button>
        </div>
        {automationStatus && <p className={styles.automationStatus}>{automationStatus}</p>}
      </Card>

      {sendNotice && (
        <p className={styles.automationStatus} style={{ marginBottom: 12 }}>{sendNotice}</p>
      )}

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
                      Nenhuma mensagem enviada ainda. O histórico fica salvo neste navegador até a API ter armazenamento central.
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
          <p className={styles.templatesTitle}>Templates SMS</p>
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
            <h2 className={styles.modalTitle}>Nova mensagem SMS</h2>
            <div className={styles.modalFields}>
              <Select
                label="Paciente"
                options={patients.map((p) => ({ value: p.id, label: p.name }))}
                value={patientId}
                onChange={(e) => {
                  const nextId = e.target.value
                  setPatientId(nextId)
                  if (templateId) applyTemplate(templateId, nextId)
                  else setError(null)
                }}
              />
              {CHANNEL_OPTIONS.length > 1 && (
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
              )}
              <Select
                label="Template"
                options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
                placeholder="Selecionar template"
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
              />
              <textarea
                placeholder="Mensagem SMS..."
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
                {isSending ? "Enviando SMS..." : "Enviar SMS"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
