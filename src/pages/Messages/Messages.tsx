import { useState } from "react"
import { MESSAGES, MESSAGE_TEMPLATES, PATIENTS } from "../../data/mock"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import styles from "./Messages.module.css"

export function Messages() {
  const [showModal, setShowModal] = useState(false)

  const stats = [
    { label: "Entregues", value: MESSAGES.filter((m) => m.status === "Delivered").length, cls: styles.statGreen  },
    { label: "Pendentes", value: MESSAGES.filter((m) => m.status === "Pending").length,   cls: styles.statAmber  },
    { label: "Falhos",    value: MESSAGES.filter((m) => m.status === "Failed").length,    cls: styles.statRed    },
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
                {MESSAGES.map((m, i) => {
                  const isLast = i === MESSAGES.length - 1
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

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <Card className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Nova mensagem</h2>
            <div className={styles.modalFields}>
              <Select label="Paciente" options={PATIENTS.map((p) => p.name)} />
              <Select label="Canal" options={["WhatsApp", "Email", "SMS"]} />
              <Select label="Template" options={MESSAGE_TEMPLATES.map((t) => t.name)} placeholder="Selecionar template" />
              <textarea placeholder="Mensagem..." rows={4} className={styles.modalTextarea} />
            </div>
            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={() => setShowModal(false)}>Enviar mensagem</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
