import { useState, useEffect, useCallback } from "react"
import { getReports, createReport, updateReport } from "../../services/domain"
import type { Report, ReportStatus, User, Patient } from "../../types"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Modal } from "../../components/ui/Modal/Modal"
import { Select } from "../../components/ui/Select/Select"
import { formatDate } from "../../utils"
import styles from "./Reports.module.css"

interface ReportsProps { currentUser: User; patients?: Patient[] }

// ─── Status badge color ───────────────────────────────────────────
const STATUS_PT: Record<ReportStatus, string> = {
  Draft:     "Rascunho",
  Finalized: "Finalizado",
  Sent:      "Enviado",
}

// ─── Form ─────────────────────────────────────────────────────────
interface ReportForm {
  patientId:      string
  patientName:    string
  type:           string
  diagnosis:      string
  conclusion:     string
  cid10:          string
  contentHtml:    string
  hideDate:       boolean
  hideSignature:  boolean
  status:         ReportStatus
}

const EMPTY_FORM: ReportForm = {
  patientId: "", patientName: "", type: "Laudo Médico",
  diagnosis: "", conclusion: "", cid10: "",
  contentHtml: "", hideDate: false, hideSignature: false, status: "Draft",
}

const EXAM_TYPES = [
  "Laudo Médico", "Laudo de Exame", "Atestado Médico",
  "Declaração Médica", "Relatório Médico", "Solicitação de Exame",
]

export function Reports({ currentUser, patients = [] }: ReportsProps) {
  const [reports,     setReports]     = useState<Report[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [form,        setForm]        = useState<ReportForm>(EMPTY_FORM)
  const [isSaving,    setIsSaving]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [search,      setSearch]      = useState("")
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "All">("All")

  const visibleReports = reports
    .filter((r) => currentUser.role === "doctor" ? r.doctorName === currentUser.name : true)
    .filter((r) => filterStatus === "All" || r.status === filterStatus)
    .filter((r) =>
      !search || r.patientName.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase())
    )

  const load = useCallback(async () => {
    setIsLoading(true)
    try { setReports(await getReports()) }
    catch { setReports([]) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditingReport(null)
    setForm({ ...EMPTY_FORM, patientId: "", patientName: "" })
    setError(null)
    setModalOpen(true)
  }

  function openEdit(r: Report) {
    setEditingReport(r)
    setForm({
      patientId:     r.patientId,
      patientName:   r.patientName,
      type:          r.type,
      diagnosis:     r.diagnosis ?? r.content ?? "",
      conclusion:    r.conclusion ?? "",
      cid10:         r.cid10 ?? "",
      contentHtml:   r.contentHtml ?? r.content ?? "",
      hideDate:      r.hideDate ?? false,
      hideSignature: r.hideSignature ?? false,
      status:        r.status,
    })
    setError(null)
    setModalOpen(true)
  }

  function setField<K extends keyof ReportForm>(k: K, v: ReportForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
    setError(null)
  }

  async function handleSave(finalStatus?: ReportStatus) {
    if (!form.patientId) { setError("Selecione o paciente."); return }
    if (!form.type)      { setError("Informe o tipo de laudo."); return }
    setIsSaving(true); setError(null)
    try {
      const payload = {
        patientId:     form.patientId,
        patientName:   form.patientName,
        type:          form.type,
        exam:          form.type,
        diagnosis:     form.diagnosis,
        conclusion:    form.conclusion,
        content:       form.contentHtml,
        contentHtml:   form.contentHtml,
        cid10:         form.cid10,
        hideDate:      form.hideDate,
        hideSignature: form.hideSignature,
        status:        finalStatus ?? form.status,
        doctorId:      currentUser.id,
        doctorName:    currentUser.name,
        date:          new Date().toISOString().slice(0, 10),
      }

      if (editingReport) {
        const updated = await updateReport({ ...editingReport, ...payload })
        setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r))
      } else {
        const created = await createReport(payload)
        setReports((prev) => [created, ...prev])
      }
      setModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar laudo")
    } finally { setIsSaving(false) }
  }

  async function handleFinalize() { await handleSave("Finalized") }
  async function handleSend()     { await handleSave("Sent") }

  const PlusIcon = () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )

  return (
    <div>
      <Topbar
        title="Laudos e Relatórios"
        subtitle={`${visibleReports.length} laudos`}
        action={<Button onClick={openNew} icon={<PlusIcon />}>Novo laudo</Button>}
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }}
            width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente ou tipo..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, fontSize: 13,
              border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        {(["All", "Draft", "Finalized", "Sent"] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: "1px solid var(--border)", transition: "all 0.15s",
              background: filterStatus === s ? "var(--primary)" : "var(--background)",
              color:      filterStatus === s ? "white"         : "var(--foreground)",
            }}>
            {s === "All" ? "Todos" : STATUS_PT[s]}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
            Carregando laudos...
          </div>
        ) : visibleReports.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" style={{ marginBottom: 12, opacity: 0.4 }}>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p style={{ fontSize: 14 }}>Nenhum laudo encontrado</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Clique em "Novo laudo" para começar</p>
          </div>
        ) : (
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
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{r.doctorName || currentUser.name}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatDate(r.date)}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <Badge>{STATUS_PT[r.status] ?? r.status}</Badge>
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.tdActions}>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Editar</Button>
                          {r.status === "Draft" && (
                            <Button size="sm" variant="ghost" onClick={async () => {
                              setEditingReport(r)
                              const updated = await updateReport({ ...r, status: "Finalized" })
                              setReports((prev) => prev.map((x) => x.id === updated.id ? updated : x))
                            }}>Finalizar</Button>
                          )}
                          {r.status === "Finalized" && (
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const updated = await updateReport({ ...r, status: "Sent" })
                              setReports((prev) => prev.map((x) => x.id === updated.id ? updated : x))
                            }}>Enviar</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de criação/edição */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingReport ? "Editar laudo" : "Novo laudo"}
        subtitle={editingReport ? `Editando: ${editingReport.patientName}` : "Preencha os dados do laudo"}
        size="md"
        footer={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleSave("Draft")} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar rascunho"}
            </Button>
            <Button onClick={handleFinalize} disabled={isSaving}>
              Finalizar laudo
            </Button>
            {editingReport?.status === "Finalized" && (
              <Button variant="outline" onClick={handleSend} disabled={isSaving}>Enviar</Button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Paciente */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", display: "block", marginBottom: 4 }}>
              Paciente <span style={{ color: "var(--destructive)" }}>*</span>
            </label>
            {patients.length > 0 ? (
              <select
                value={form.patientId}
                onChange={(e) => {
                  const p = patients.find((x) => x.id === e.target.value)
                  setField("patientId", e.target.value)
                  setField("patientName", p?.name ?? "")
                }}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", outline: "none",
                }}
              >
                <option value="">Selecionar paciente...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.patientName}
                onChange={(e) => { setField("patientName", e.target.value); setField("patientId", e.target.value) }}
                placeholder="Nome do paciente"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", outline: "none", boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Tipo e CID-10 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select label="Tipo de laudo" value={form.type}
              onChange={(e) => setField("type", e.target.value)}
              options={EXAM_TYPES} required />
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", display: "block", marginBottom: 4 }}>CID-10</label>
              <input value={form.cid10} onChange={(e) => setField("cid10", e.target.value)}
                placeholder="Ex: J00, K35..."
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Diagnóstico */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", display: "block", marginBottom: 4 }}>Diagnóstico</label>
            <textarea
              value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)}
              rows={3} placeholder="Descreva o diagnóstico..."
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Conteúdo / Laudo */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", display: "block", marginBottom: 4 }}>Conteúdo do laudo</label>
            <textarea
              value={form.contentHtml} onChange={(e) => setField("contentHtml", e.target.value)}
              rows={5} placeholder="Digite o conteúdo completo do laudo..."
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Conclusão */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", display: "block", marginBottom: 4 }}>Conclusão</label>
            <textarea
              value={form.conclusion} onChange={(e) => setField("conclusion", e.target.value)}
              rows={2} placeholder="Conclusão do laudo..."
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", outline: "none", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Opções */}
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { key: "hideDate" as const,      label: "Ocultar data no laudo" },
              { key: "hideSignature" as const,  label: "Ocultar assinatura" },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>
                <input type="checkbox" checked={form[key] as boolean} onChange={(e) => setField(key, e.target.checked)}
                  style={{ accentColor: "var(--primary)" }} />
                {label}
              </label>
            ))}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "var(--destructive)", padding: "8px 12px", borderRadius: 8, background: "var(--destructive-light, #fef2f2)", border: "1px solid var(--destructive)" }}>
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
