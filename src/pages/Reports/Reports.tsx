import { useState } from "react"
import { REPORTS } from "../../data/mock"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { formatDate } from "../../utils"
import type { Report, User } from "../../types"
import styles from "./Reports.module.css"

const TOOLS = ["N", "I", "U", "—", "≡", "≣", "◀", "▶", "A+", "A-"]
const INITIAL_CONTENT = "O paciente refere queixa de...\n\nExame físico:\n\nConduta:\n\nCID-10:"

interface ReportsProps { currentUser: User }

export function Reports({ currentUser }: ReportsProps) {
  const visibleReports = currentUser.role === "doctor"
    ? REPORTS.filter(r => r.doctorName === currentUser.name)
    : REPORTS
  const [editing, setEditing] = useState<Report | null>(null)
  const [content, setContent] = useState(INITIAL_CONTENT)

  if (editing) {
    return (
      <div>
        <Topbar
          title="Editor de Laudo"
          subtitle={`${editing.patientName} · ${editing.type}`}
          action={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Fechar</Button>
              <Button variant="ghost">Pré-visualizar</Button>
              <Button>Finalizar laudo</Button>
            </>
          }
        />
        <div className={styles.editorLayout}>
          <Card>
            <div className={styles.toolbar}>
              {TOOLS.map((t) => <button key={t} className={styles.toolBtn}>{t}</button>)}
            </div>
            <div className={styles.editorMeta}>
              <input className={styles.metaInput} placeholder="Paciente" defaultValue={editing.patientName} />
              <input className={styles.metaInput} placeholder="Médico" defaultValue={editing.doctorName} />
              <input className={styles.metaInput} type="date" defaultValue={editing.date} />
            </div>
            <textarea
              className={styles.editorBody}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Card>
          <div className={styles.sidePanel}>
            <Card className={styles.panelCard}>
              <p className={styles.panelTitle}>Configurações</p>
              {["Ocultar data no laudo", "Ocultar assinatura"].map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer mb-2" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 8, color: "var(--foreground)" }}>
                  <input type="checkbox" style={{ accentColor: "var(--primary)" }} />
                  {opt}
                </label>
              ))}
            </Card>
            <Card className={styles.panelCard}>
              <p className={styles.panelTitle}>CID-10</p>
              <input className={styles.panelInput} placeholder="Buscar CID..." />
            </Card>
            <Card className={styles.panelCard}>
              <p className={styles.panelTitle}>Exportar</p>
              <div className={styles.panelActions}>
                {["PDF", "Word", "Imprimir"].map((fmt) => (
                  <Button key={fmt} variant="ghost" size="sm">{fmt}</Button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Laudos" subtitle={`${visibleReports.length} laudos registrados`}
        action={<Button>Novo laudo</Button>} />
      <Card>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {["Paciente", "Tipo", "Médico", "Data", "Status", "Ações"].map((h) => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((r, i) => {
                const isLast = i === visibleReports.length - 1
                return (
                  <tr key={r.id}>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <div className={styles.patientCell}>
                        <Avatar name={r.patientName} size="sm" />
                        <span className={styles.patientName}>{r.patientName}</span>
                      </div>
                    </td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{r.type}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{r.doctorName}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatDate(r.date)}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{r.status}</Badge></td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <div className={styles.tdActions}>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Editar</Button>
                        <Button size="sm" variant="ghost">Enviar</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
