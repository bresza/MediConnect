import { useState, useEffect } from "react"
import { getMessages, sendMessage } from "../../services/domain"
import type { Message, MessageTemplate, Patient } from "../../types"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import styles from "./Messages.module.css"

// Presets de UI (não são dados da API — são atalhos de redação para a
// secretaria preencher rapidamente a caixa de SMS). Como o canal real
// disponível na Edge Function `send-sms` é apenas SMS, todos os presets
// usam esse canal.
const SMS_TEMPLATES: MessageTemplate[] = [
  { id: 1, name: "Lembrete de consulta (48h)", channel: "SMS", content: "Olá {nome}, lembrete da sua consulta em {data} às {hora}." },
  { id: 2, name: "Confirmação de agendamento", channel: "SMS", content: "Olá {nome}, sua consulta foi confirmada para {data} às {hora}." },
  { id: 3, name: "Resultado de exame disponível", channel: "SMS", content: "Olá {nome}, seu resultado de exame está disponível." },
  { id: 4, name: "Cancelamento de consulta", channel: "SMS", content: "Olá {nome}, sua consulta de {data} foi cancelada." },
  { id: 5, name: "Boas-vindas ao paciente", channel: "SMS", content: "Olá {nome}, seja bem-vindo(a) à Clínica Mediconnect!" },
]

interface MessagesProps {
  /** Pacientes já escopados pelo AppRouter (médico = só vinculados). */
  patients: Patient[]
}

export function Messages({ patients }: MessagesProps) {
  const [showModal,   setShowModal]   = useState(false)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [patientId,   setPatientId]   = useState("")
  const [templateId,  setTemplateId]  = useState("")
  const [content,     setContent]     = useState("")
  const [error,       setError]       = useState<string | null>(null)
  const [isSending,   setIsSending]   = useState(false)

  const templates = SMS_TEMPLATES

  useEffect(() => {
    getMessages().then(setMessages)
  }, [])

  // Se o paciente selecionado sair do escopo (ex.: troca de lista do médico),
  // limpa a seleção para não permitir SMS fora do painel.
  useEffect(() => {
    if (patientId && !patients.some((p) => p.id === patientId)) {
      setPatientId("")
    }
  }, [patients, patientId])

  function closeModal() {
    setShowModal(false)
    setPatientId("")
    setTemplateId("")
    setContent("")
    setError(null)
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    const template = templates.find((t) => String(t.id) === id)
    const patient = patients.find((p) => p.id === patientId)
    if (template) setContent(template.content.replace(/\{nome\}/g, patient?.name ?? ""))
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
      // sendMessage recebe phoneNumber + content e monta o body da Edge
      // Function exatamente como `{ message, phone_number, patient_id? }`.
      const sent = await sendMessage({
        patientId: patient.id,
        patientName: patient.name,
        phoneNumber: patient.phone,
        channel: "SMS",
        content: content.trim(),
        status: "Pending",
        date: new Date().toISOString().slice(0, 10),
      })
      setMessages((prev) => [sent, ...prev])
      closeModal()
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
        subtitle="Mensagens enviadas aos pacientes"
        action={<Button onClick={() => setShowModal(true)}>Nova mensagem</Button>}
      />

      {/* Stats */}
      <div className={styles.statsGrid}>
        {stats.map((s) => (
          <Card key={s.label} className={styles.statCard}>
            <p className={styles.statLabel}>{s.label}</p>
            <p className={`${styles.statValue} ${s.cls}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <div className={styles.layout}>
        {/* Table */}
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

        {/* Templates */}
        <Card className={styles.templatesCard}>
          <p className={styles.templatesTitle}>Templates</p>
          <div className={styles.templateList}>
            {templates.map((tpl) => (
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

      {/* Modal */}
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
              <Select label="Canal" options={["SMS"]} value="SMS" disabled />
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
                {isSending ? "Enviando..." : "Enviar SMS"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
