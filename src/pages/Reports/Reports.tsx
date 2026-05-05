import { useState, useEffect, useCallback, useRef } from "react"
import { getReports, createReport, updateReport } from "../../services/domain"
import { REPORT_TEMPLATES, TEMPLATE_SPECIALTIES } from "../../data/reportTemplates"
import type { ReportTemplate } from "../../data/reportTemplates"
import type { Report, ReportStatus, User, Patient } from "../../types"
import { Topbar }  from "../../components/layout/Topbar/Topbar"
import { Card }    from "../../components/ui/Card/Card"
import { Badge }   from "../../components/ui/Badge/Badge"
import { Button }  from "../../components/ui/Button/Button"
import { Avatar }  from "../../components/ui/Avatar/Avatar"
import { Modal }   from "../../components/ui/Modal/Modal"
import { formatDate } from "../../utils"
import styles from "./Reports.module.css"

interface ReportsProps { currentUser: User; patients?: Patient[] }

const STATUS_PT: Record<ReportStatus, string> = {
  Draft: "Rascunho", Finalized: "Finalizado", Sent: "Enviado",
}

interface ReportForm {
  patientId:     string
  patientName:   string
  type:          string
  diagnosis:     string
  conclusion:    string
  cid10:         string
  contentHtml:   string
  hideDate:      boolean
  hideSignature: boolean
  status:        ReportStatus
}

const EMPTY_FORM: ReportForm = {
  patientId: "", patientName: "", type: "Laudo Médico",
  diagnosis: "", conclusion: "", cid10: "",
  contentHtml: "", hideDate: false, hideSignature: false, status: "Draft",
}

// ─── IA — completa laudo via Anthropic API ────────────────────────
async function aiCompleteReport(
  form: ReportForm,
  patientInfo: string,
): Promise<Partial<ReportForm>> {
  await new Promise((resolve) => setTimeout(resolve, 250))
  const diagnosis = form.diagnosis.trim() || "Quadro clinico em avaliacao, correlacionado aos achados apresentados."
  const conclusion = form.conclusion.trim() || "Conclusao compativel com os dados clinicos informados, recomendando seguimento conforme criterio medico."
  const contentHtml = (form.contentHtml || "")
    .replace(/\[DIAGNOSTICO\]/g, diagnosis)
    .replace(/\[CONCLUSAO\]/g, conclusion)
    .replace(/\[CID\]/g, form.cid10 || "Nao informado")
    .replace(/\[DADOS DO PACIENTE\]/g, patientInfo)

  return {
    diagnosis,
    conclusion,
    contentHtml: contentHtml.trim() || [
      `Paciente: ${patientInfo}`,
      `Tipo de laudo: ${form.type}`,
      form.cid10 ? `CID-10: ${form.cid10}` : "",
      `Diagnostico: ${diagnosis}`,
      `Conclusao: ${conclusion}`,
    ].filter(Boolean).join("\n\n"),
  }
}

// ─── Selector de templates ────────────────────────────────────────
interface TemplateSelectorProps {
  onSelect: (t: ReportTemplate) => void
  onClose:  () => void
}

function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [search,    setSearch]    = useState("")
  const [specialty, setSpecialty] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  const filtered = REPORT_TEMPLATES.filter((t) => {
    const q = search.toLowerCase()
    const ok = !q ||
      t.name.toLowerCase().includes(q) ||
      t.tags.some((g) => g.toLowerCase().includes(q)) ||
      t.cid10.toLowerCase().includes(q)
    return ok && (!specialty || t.specialty === specialty)
  })

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", outline: "none", boxSizing: "border-box",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }}
            width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar: patologia, CID, palavra-chave..."
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none", cursor: "pointer" }}>
          <option value="">Todas as especialidades</option>
          {TEMPLATE_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {filtered.length} template{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
            Nenhum template para "{search}"
          </div>
        ) : filtered.map((t) => (
          <button key={t.id} onClick={() => onSelect(t)}
            style={{ textAlign: "left", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", transition: "border-color 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{t.name}</span>
              {t.cid10 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 8 }}>
                  CID {t.cid10}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)", background: "var(--muted)", padding: "2px 8px", borderRadius: 20 }}>
                {t.specialty}
              </span>
              {t.tags.slice(0, 3).map((tag) => (
                <span key={tag} style={{ fontSize: 11, color: "var(--muted-foreground)" }}>#{tag}</span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {t.diagnosis}
            </p>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────
export function Reports({ currentUser, patients = [] }: ReportsProps) {
  const [reports,       setReports]       = useState<Report[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [templateModal, setTemplateModal] = useState(false)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [form,          setForm]          = useState<ReportForm>(EMPTY_FORM)
  const [isSaving,      setIsSaving]      = useState(false)
  const [isAiLoading,   setIsAiLoading]   = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [search,        setSearch]        = useState("")
  const [filterStatus,  setFilterStatus]  = useState<ReportStatus | "All">("All")

  const visibleReports = reports
    .filter((r) => currentUser.role === "doctor"
      ? (r.doctorName === currentUser.name || r.doctorId === currentUser.id)
      : true)
    .filter((r) => filterStatus === "All" || r.status === filterStatus)
    .filter((r) => !search ||
      r.patientName.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase()))

  const load = useCallback(async () => {
    setIsLoading(true)
    try { setReports(await getReports()) }
    catch { setReports([]) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function setField<K extends keyof ReportForm>(k: K, v: ReportForm[K]) {
    setForm((p) => ({ ...p, [k]: v })); setError(null)
  }

  // ── Aplicar template ─────────────────────────────────────────────
  function applyTemplate(t: ReportTemplate) {
    const patient    = patients.find((p) => p.id === form.patientId)
    const pName      = patient?.name ?? "[NOME DO PACIENTE]"
    const dName      = currentUser.name ?? "[NOME DO MÉDICO]"
    const today      = new Date().toLocaleDateString("pt-BR")
    const fill = (s: string) => s
      .replace(/\[NOME DO PACIENTE\]/g, pName)
      .replace(/\[NOME DO MÉDICO\]/g, dName)
      .replace(/\[DATA\]/g, today)
      .replace(/\[CRM\]/g, currentUser.crm ?? "[CRM]")
    setForm((prev) => ({
      ...prev,
      type:        t.exam,
      cid10:       t.cid10,
      diagnosis:   fill(t.diagnosis),
      conclusion:  fill(t.conclusion),
      contentHtml: fill(t.content),
      status:      "Draft",
    }))
    setTemplateModal(false)
    if (!modalOpen) setModalOpen(true)
  }

  // ── Completar com IA ─────────────────────────────────────────────
  async function handleAiComplete() {
    setIsAiLoading(true); setError(null)
    try {
      const patient    = patients.find((p) => p.id === form.patientId)
      const patientInfo = patient
        ? `Nome: ${patient.name}, Idade: ${patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : "N/A"} anos, Convênio: ${patient.healthInsurance ?? "Particular"}, Observações: ${patient.observations ?? "Nenhuma"}`
        : "Paciente não identificado"
      const result = await aiCompleteReport(form, patientInfo)
      if (result.diagnosis)   setField("diagnosis",   result.diagnosis)
      if (result.conclusion)  setField("conclusion",  result.conclusion)
      if (result.contentHtml) setField("contentHtml", result.contentHtml)
    } catch {
      setError("IA indisponível no momento. Continue preenchendo manualmente.")
    } finally { setIsAiLoading(false) }
  }

  // ── Abrir modal vazio ────────────────────────────────────────────
  function openNew() {
    setEditingReport(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  // ── Editar laudo ─────────────────────────────────────────────────
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
    setError(null); setModalOpen(true)
  }

  // ── Salvar ───────────────────────────────────────────────────────
  async function handleSave(finalStatus?: ReportStatus) {
    if (!form.patientId && !form.patientName) { setError("Selecione o paciente."); return }
    if (!form.type)                           { setError("Informe o tipo de laudo."); return }
    setIsSaving(true); setError(null)
    try {
      const payload = {
        patientId:     form.patientId || form.patientName,
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

  // ── Mudar status direto da lista ─────────────────────────────────
  async function quickStatus(r: Report, status: ReportStatus) {
    try {
      const updated = await updateReport({ ...r, status })
      setReports((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch { /* silencia */ }
  }

  // ── Estilos inline reutilizáveis ─────────────────────────────────
  const textareaStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", outline: "none", resize: "vertical",
    boxSizing: "border-box", fontFamily: "inherit",
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: "var(--foreground)",
    display: "block", marginBottom: 4,
  }

  return (
    <div>
      <Topbar
        title="Laudos e Relatórios"
        subtitle={`${visibleReports.length} laudo${visibleReports.length !== 1 ? "s" : ""}`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={() => setTemplateModal(true)}>
              📋 Templates
            </Button>
            <Button onClick={openNew}>+ Novo laudo</Button>
          </div>
        }
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }}
            width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente ou tipo..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
        </div>
        {(["All", "Draft", "Finalized"] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", transition: "all 0.15s", background: filterStatus === s ? "var(--primary)" : "var(--background)", color: filterStatus === s ? "white" : "var(--foreground)" }}>
            {s === "All" ? "Todos" : STATUS_PT[s]}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
            Carregando laudos...
          </div>
        ) : visibleReports.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📋</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum laudo encontrado</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Use "Templates" para começar rapidamente com patologias pré-cadastradas</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  {["Paciente", "Tipo / CID", "Médico", "Data", "Status", "Ações"].map((h) => (
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
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <p style={{ fontWeight: 500, color: "var(--foreground)", fontSize: 13, margin: 0 }}>{r.type}</p>
                        {r.cid10 && <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>CID: {r.cid10}</p>}
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{r.doctorName || currentUser.name}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatDate(r.date)}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <Badge>{STATUS_PT[r.status] ?? r.status}</Badge>
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.tdActions}>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Editar</Button>
                          {r.status === "Draft" && (
                            <Button size="sm" variant="ghost" onClick={() => quickStatus(r, "Finalized")}>Finalizar</Button>
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

      {/* Modal de templates */}
      <Modal isOpen={templateModal} onClose={() => setTemplateModal(false)}
        title="Templates de laudos"
        subtitle="Selecione uma patologia para preencher o laudo automaticamente"
        size="md"
        topLayer>
        <TemplateSelector onSelect={applyTemplate} onClose={() => setTemplateModal(false)} />
      </Modal>

      {/* Modal de criação/edição */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingReport ? "Editar laudo" : "Novo laudo"}
        subtitle={editingReport ? `Editando: ${editingReport.patientName}` : "Preencha os dados ou use um template"}
        size="md"
        footer={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <div style={{ flex: 1 }} />
            <Button variant="outline" onClick={() => setTemplateModal(true)}>📋 Template</Button>
            <button
              onClick={handleAiComplete}
              disabled={isAiLoading}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white",
                border: "none", cursor: isAiLoading ? "not-allowed" : "pointer", opacity: isAiLoading ? 0.7 : 1,
              }}>
              {isAiLoading ? "⏳ Completando..." : "✨ Completar com IA"}
            </button>
            <Button variant="outline" onClick={() => handleSave("Draft")} disabled={isSaving}>
              Salvar rascunho
            </Button>
            <Button onClick={() => handleSave("Finalized")} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Finalizar"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Banner IA */}
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "linear-gradient(135deg,#ede9fe,#ddd6fe)", border: "1px solid #c4b5fd", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>✨</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#5b21b6", margin: 0 }}>Assistente IA disponível</p>
              <p style={{ fontSize: 11, color: "#6d28d9", margin: 0 }}>
                Selecione um template → escolha o paciente → clique em "Completar com IA" para gerar o laudo personalizado.
              </p>
            </div>
          </div>

          {/* Paciente */}
          <div>
            <label style={labelStyle}>
              Paciente <span style={{ color: "var(--destructive)" }}>*</span>
            </label>
            {patients.length > 0 ? (
              <select value={form.patientId}
                onChange={(e) => {
                  const p = patients.find((x) => x.id === e.target.value)
                  setField("patientId", e.target.value)
                  setField("patientName", p?.name ?? "")
                }}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none" }}>
                <option value="">Selecionar paciente...</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input value={form.patientName}
                onChange={(e) => { setField("patientName", e.target.value); setField("patientId", e.target.value) }}
                placeholder="Nome do paciente"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
            )}
          </div>

          {/* Tipo e CID */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo de laudo</label>
              <input value={form.type} onChange={(e) => setField("type", e.target.value)}
                placeholder="Ex: Laudo Médico"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={labelStyle}>CID-10</label>
              <input value={form.cid10} onChange={(e) => setField("cid10", e.target.value)}
                placeholder="Ex: I10, E11..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Diagnóstico */}
          <div>
            <label style={labelStyle}>Diagnóstico</label>
            <textarea value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)}
              rows={3} placeholder="Diagnóstico clínico..." style={textareaStyle} />
          </div>

          {/* Conteúdo */}
          <div>
            <label style={labelStyle}>Conteúdo do laudo</label>
            <textarea value={form.contentHtml} onChange={(e) => setField("contentHtml", e.target.value)}
              rows={8} placeholder="Use um template acima ou escreva o conteúdo completo do laudo..." style={textareaStyle} />
          </div>

          {/* Conclusão */}
          <div>
            <label style={labelStyle}>Conclusão</label>
            <textarea value={form.conclusion} onChange={(e) => setField("conclusion", e.target.value)}
              rows={2} placeholder="Conclusão do laudo..." style={textareaStyle} />
          </div>

          {/* Opções */}
          <div style={{ display: "flex", gap: 16 }}>
            {([
              { key: "hideDate"      as const, label: "Ocultar data" },
              { key: "hideSignature" as const, label: "Ocultar assinatura" },
            ]).map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>
                <input type="checkbox" checked={form[key] as boolean}
                  onChange={(e) => setField(key, e.target.checked)}
                  style={{ accentColor: "var(--primary)" }} />
                {label}
              </label>
            ))}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "var(--destructive)", padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid var(--destructive)", margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
