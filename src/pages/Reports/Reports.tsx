import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from "react"
import { getReports, createReport, updateReport } from "../../services/domain"
import { REPORT_TEMPLATES, TEMPLATE_SPECIALTIES } from "../../data/reportTemplates"
import type { ReportTemplate } from "../../data/reportTemplates"
import type { Report, ReportStatus, User, Patient } from "../../types"
import { Topbar }  from "../../components/layout/Topbar/Topbar"
import { Card }    from "../../components/ui/Card/Card"
import { Badge }   from "../../components/ui/Badge/Badge"
import { Button }  from "../../components/ui/Button/Button"
import { Avatar }  from "../../components/ui/Avatar/Avatar"
import { Select }  from "../../components/ui/Select/Select"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { RichTextEditor } from "../../components/ui/RichTextEditor/RichTextEditor"
import { chatComplete, isAIConfigured, AIError, type ChatMessage } from "../../services/ai"
import { formatCrm, formatDate, sortByName, toTitleCase } from "../../utils"
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

const EXAM_TYPES = Array.from(
  new Set(["Laudo Médico", ...REPORT_TEMPLATES.map((t) => t.exam)]),
).sort((a, b) => a.localeCompare(b, "pt-BR"))

// ─── IA — completa laudo via OpenAI (proxy/direto) ────────────────
//
// Pedimos o retorno em JSON estrito para conseguirmos preencher
// diagnostico, conclusao e o conteudo do laudo (em HTML) com o
// minimo de pos-processamento. O HTML usa tags simples (h2, p, ul,
// li, strong) que o BlockNote consegue importar via
// `tryParseHTMLToBlocks` sem perder estrutura.
//
// Quando o modelo retorna texto fora do JSON (lixo antes/depois),
// extraimos o primeiro bloco "{ ... }" e tentamos parsear.

interface AiCompletionResult {
  diagnosis:   string
  conclusion:  string
  contentHtml: string
}

function extractJsonBlock(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = trimmed.indexOf("{")
  const last  = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("\n")
}

// ─── Fallback offline (sem chamar OpenAI) ─────────────────────────
// Quando a IA externa nao esta disponivel (sem chave direta + proxy
// `ai-chat` bloqueando CORS), montamos um laudo coerente a partir do
// template ativo, dos dados ja preenchidos e do paciente. NAO e
// inteligencia generativa, mas garante que o medico nunca fique com
// o botao "Completar com IA" inutilizavel.
function aiCompleteReportLocal(
  form: ReportForm,
  patient: Patient | undefined,
  currentUser: User,
): AiCompletionResult {
  const today    = new Date().toLocaleDateString("pt-BR")
  const template = REPORT_TEMPLATES.find((t) => t.exam === form.type)
  const ageYears = patient?.dob
    ? new Date().getFullYear() - new Date(patient.dob).getFullYear()
    : null

  const patientLine = [
    patient?.name ?? form.patientName ?? "[NOME DO PACIENTE]",
    ageYears !== null ? `${ageYears} anos` : "",
    patient?.gender ? patient.gender : "",
    patient?.healthInsurance ? `Convênio ${patient.healthInsurance}` : "Particular",
  ].filter(Boolean).join(" · ")

  const diagnosis  = form.diagnosis.trim()  || template?.diagnosis  ||
    "Quadro clínico em avaliação, correlacionado aos achados apresentados na consulta."
  const conclusion = form.conclusion.trim() || template?.conclusion ||
    "Conclusão compatível com os dados clínicos informados; seguimento conforme critério médico."
  const cidLine = form.cid10 || template?.cid10 || ""
  const crmText = currentUser.crm ? formatCrm(currentUser.crm) || currentUser.crm : ""

  const conductLines = template?.content
    ? template.content
        .split(/\n/)
        .filter((line) => line.trim().startsWith("-"))
        .slice(0, 5)
        .map((line) => `<li>${escapeHtml(line.replace(/^[-•]\s*/, ""))}</li>`)
        .join("\n")
    : ""

  const conductBlock = conductLines || [
    "<li>Seguir o plano terapêutico discutido em consulta.</li>",
    "<li>Manter rotina de exames e retornos conforme orientação.</li>",
    "<li>Comunicar imediatamente sinais de alarme ou piora clínica.</li>",
  ].join("\n")

  const contentHtml = [
    "<h2>Identificação</h2>",
    `<p>${escapeHtml(patientLine)}</p>`,
    `<p><strong>Médico responsável:</strong> ${escapeHtml(currentUser.name)}${crmText ? ` — CRM ${escapeHtml(crmText)}` : ""}</p>`,
    `<p><strong>Data:</strong> ${escapeHtml(today)}</p>`,
    cidLine ? `<p><strong>CID-10:</strong> ${escapeHtml(cidLine)}</p>` : "",
    "<h2>Avaliação clínica</h2>",
    `<p>${escapeHtml(diagnosis)}</p>`,
    patient?.observations ? "<h2>Observações</h2>" : "",
    patient?.observations ? `<p>${escapeHtml(patient.observations)}</p>` : "",
    "<h2>Conduta sugerida</h2>",
    `<ul>${conductBlock}</ul>`,
    "<h2>Conclusão</h2>",
    `<p>${escapeHtml(conclusion)}</p>`,
    "<p><em>Decisão clínica final do(a) médico(a) responsável.</em></p>",
  ].filter(Boolean).join("\n")

  return { diagnosis, conclusion, contentHtml }
}

async function aiCompleteReport(
  form: ReportForm,
  patientInfo: string,
  currentUser: User,
): Promise<AiCompletionResult> {
  const template = REPORT_TEMPLATES.find((t) => t.exam === form.type)
  const baseContent = form.contentHtml.trim()

  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Voce e o assistente clinico do MediConnect que ajuda medicos a redigir laudos em portugues do Brasil.",
        "Gere SEMPRE um JSON valido (UTF-8) e nada mais, sem comentarios, sem texto fora do JSON e sem markdown.",
        "Estrutura obrigatoria: { \"diagnosis\": string, \"conclusion\": string, \"contentHtml\": string }.",
        "diagnosis: paragrafo objetivo (1-3 frases) descrevendo o quadro do paciente.",
        "conclusion: paragrafo (1-2 frases) com a conclusao do laudo e orientacao geral.",
        "contentHtml: HTML simples usando apenas <h2>, <p>, <ul>, <li>, <strong>. Sem <html>, <body>, <style>, scripts ou classes.",
        "Estruture contentHtml em secoes: Identificacao do paciente, Anamnese e achados, Avaliacao clinica, Conduta sugerida e Conclusao.",
        "Nao invente exames, valores numericos, doses ou nomes que nao tenham sido informados; use [VALOR] ou [A DEFINIR] quando faltarem dados.",
        "Nao inclua diagnostico definitivo, prescricao ou doses sem ressalva: deixe explicito que a decisao final e do(a) medico(a).",
      ].join(" "),
    },
  ]

  const userPrompt: ChatMessage = {
    role: "user",
    content: [
      `Medico responsavel: ${currentUser.name}${currentUser.crm ? ` (CRM ${formatCrm(currentUser.crm)})` : ""}.`,
      `Paciente: ${patientInfo}.`,
      `Tipo de laudo: ${form.type}.`,
      form.cid10 ? `CID-10 informado: ${form.cid10}.` : "Sem CID-10 informado.",
      form.diagnosis ? `Diagnostico em rascunho: ${form.diagnosis}.` : "Sem diagnostico em rascunho.",
      form.conclusion ? `Conclusao em rascunho: ${form.conclusion}.` : "Sem conclusao em rascunho.",
      template?.diagnosis ? `Diagnostico de referencia do template: ${template.diagnosis}.` : "",
      template?.conclusion ? `Conclusao de referencia do template: ${template.conclusion}.` : "",
      baseContent ? `Rascunho atual do laudo (HTML ou texto): ${baseContent}` : "Sem rascunho de conteudo.",
      "Refine os campos com base nesse contexto, mantendo o que ja faz sentido e completando o que falta.",
      "Responda APENAS com o JSON descrito.",
    ].filter(Boolean).join("\n"),
  }

  const raw = await chatComplete([...systemMessages, userPrompt], {
    temperature: 0.3,
    maxTokens:   900,
  })

  const jsonBlock = extractJsonBlock(raw)
  let parsed: Partial<AiCompletionResult> = {}
  if (jsonBlock) {
    try {
      parsed = JSON.parse(jsonBlock) as Partial<AiCompletionResult>
    } catch {
      parsed = {}
    }
  }

  const diagnosis  = (parsed.diagnosis  ?? form.diagnosis ?? "").trim()
  const conclusion = (parsed.conclusion ?? form.conclusion ?? "").trim()
  let contentHtml  = (parsed.contentHtml ?? "").trim()

  // Fallback resiliente: se o modelo nao devolveu JSON valido, usamos
  // a resposta como texto e montamos paragrafos.
  if (!contentHtml) {
    if (raw.trim().startsWith("<")) {
      contentHtml = raw.trim()
    } else {
      contentHtml = plainTextToHtml(raw.trim() || [
        diagnosis ? `Diagnostico: ${diagnosis}` : "",
        conclusion ? `Conclusao: ${conclusion}` : "",
      ].filter(Boolean).join("\n\n"))
    }
  }

  return {
    diagnosis:  diagnosis  || "Quadro clinico em avaliacao, correlacionado aos achados apresentados.",
    conclusion: conclusion || "Conclusao compativel com os dados informados; seguimento conforme criterio medico.",
    contentHtml,
  }
}

// ─── Selector de templates (painel lateral do editor) ─────────────
interface TemplateSelectorProps {
  onSelect: (t: ReportTemplate) => void
}

function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [search,    setSearch]    = useState("")
  const [specialty, setSpecialty] = useState("")

  const filtered = REPORT_TEMPLATES.filter((t) => {
    const q = search.toLowerCase()
    const ok = !q ||
      t.name.toLowerCase().includes(q) ||
      t.exam.toLowerCase().includes(q) ||
      t.tags.some((g) => g.toLowerCase().includes(q)) ||
      t.cid10.toLowerCase().includes(q)
    return ok && (!specialty || t.specialty === specialty)
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar patologia, CID ou exame..."
        className={styles.panelInput}
      />
      <select
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
        className={styles.panelInput}
        style={{ cursor: "pointer" }}
      >
        <option value="">Todas as especialidades</option>
        {TEMPLATE_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>
        {filtered.length} template{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className={styles.templateList}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>
            Nenhum template encontrado
          </div>
        ) : filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className={styles.templateCard}
          >
            <p className={styles.templateCardTitle}>{t.name}</p>
            <div className={styles.templateCardMeta}>
              <span className={styles.templateCardBadge}>{t.specialty}</span>
              <span className={styles.templateCardBadge}>{t.exam}</span>
              {t.cid10 && <span className={styles.templateCardCid}>CID {t.cid10}</span>}
            </div>
            <p className={styles.templateCardPreview}>{t.diagnosis}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────
export function Reports({ currentUser, patients = [] }: ReportsProps) {
  const [reports,       setReports]       = useState<Report[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [editorOpen,       setEditorOpen]       = useState(false)
  const [editorContentKey, setEditorContentKey] = useState(0)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [form,        setForm]        = useState<ReportForm>(EMPTY_FORM)
  const [isSaving,    setIsSaving]    = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiNotice,    setAiNotice]    = useState<{ tone: "ai" | "local"; text: string } | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [listError,   setListError]   = useState<string | null>(null)
  const [updatingId,  setUpdatingId]  = useState<string | null>(null)
  const [search,      setSearch]      = useState("")
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "All">("All")
  // Marca a Edge Function `ai-chat` como inacessível depois da primeira
  // falha de CORS/rede; nas próximas tentativas, pulamos direto para o
  // fallback local sem tentar de novo o proxy.
  const aiProxyDownRef = useRef(false)
  const aiAvailable = useMemo(() => isAIConfigured(), [])

  const visibleReports = sortByName(
    reports
      .map((r) => ({ ...r, patientName: toTitleCase(r.patientName), doctorName: toTitleCase(r.doctorName) }))
      .filter((r) => {
        if (currentUser.role !== "doctor") return true
        // Alguns registros retornam sem doctorName no join; usa created_by como fallback.
        return r.doctorId === currentUser.id || r.doctorName === toTitleCase(currentUser.name)
      })
      .filter((r) => filterStatus === "All" || r.status === filterStatus)
      .filter((r) => !search ||
        r.patientName.toLowerCase().includes(search.toLowerCase()) ||
        r.type.toLowerCase().includes(search.toLowerCase())),
    (r) => r.patientName,
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    try { setReports(await getReports()) }
    catch { setReports([]) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  function setField<K extends keyof ReportForm>(k: K, v: ReportForm[K]) {
    setForm((p) => ({ ...p, [k]: v })); setError(null)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingReport(null)
    setError(null)
    setAiNotice(null)
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
      .replace(/\[CRM\]/g, formatCrm(currentUser.crm) || "[CRM]")
    setForm((prev) => ({
      ...prev,
      type:        t.exam,
      cid10:       t.cid10,
      diagnosis:   fill(t.diagnosis),
      conclusion:  fill(t.conclusion),
      contentHtml: fill(t.content),
      status:      "Draft",
    }))
    setEditorContentKey((k) => k + 1)
  }

  // ── Completar com IA ─────────────────────────────────────────────
  //
  // Estratégia em duas etapas:
  //  1. Se a IA externa estiver configurada (OPENAI direct ou Edge
  //     Function proxy disponível), chama `aiCompleteReport`. Em
  //     sucesso, aplica o resultado e marca como "IA real".
  //  2. Em falha (CORS, 404, sem chave, timeout) OU quando a IA não
  //     está configurada, monta o laudo via `aiCompleteReportLocal`
  //     (determinístico, sem chamada externa) e avisa o usuário.
  //
  // O laudo NUNCA fica sem ser preenchido — o botão sempre faz algo
  // útil para o médico, mesmo sem back-end.
  async function handleAiComplete() {
    if (!form.patientName && !form.patientId) {
      setError("Selecione um paciente antes de completar com IA.")
      return
    }
    if (!form.type) {
      setError("Informe o tipo de laudo antes de completar com IA.")
      return
    }

    setIsAiLoading(true); setError(null); setAiNotice(null)
    const patient = patients.find((p) => p.id === form.patientId)
    const ageYears = patient?.dob
      ? new Date().getFullYear() - new Date(patient.dob).getFullYear()
      : null
    const patientInfo = [
      `Nome: ${patient?.name ?? form.patientName}`,
      ageYears !== null ? `Idade: ${ageYears} anos` : "",
      patient?.gender ? `Sexo: ${patient.gender}` : "",
      patient?.healthInsurance ? `Convênio: ${patient.healthInsurance}` : "Convênio: Particular",
      patient?.observations ? `Observações: ${patient.observations}` : "",
    ].filter(Boolean).join(", ")

    const useExternal = aiAvailable && !aiProxyDownRef.current
    const applyResult = (
      result: AiCompletionResult,
      source: "ai" | "local",
      reason?: "fallback" | "unconfigured",
    ) => {
      setForm((prev) => ({
        ...prev,
        diagnosis:   result.diagnosis,
        conclusion:  result.conclusion,
        contentHtml: result.contentHtml,
      }))
      setEditorContentKey((k) => k + 1)
      const text = source === "ai"
        ? "Laudo gerado com IA. Revise antes de finalizar."
        : reason === "fallback"
          ? "Laudo gerado localmente porque a IA externa não respondeu agora. Você pode finalizar ou clicar novamente para tentar a IA."
          : "Laudo gerado localmente a partir do template e dos dados do paciente. Para ativar a IA generativa, defina VITE_OPENAI_API_KEY no .env."
      setAiNotice({ tone: source, text })
    }

    try {
      if (useExternal) {
        const result = await aiCompleteReport(form, patientInfo, currentUser)
        applyResult(result, "ai")
        return
      }
      const result = aiCompleteReportLocal(form, patient, currentUser)
      applyResult(result, "local", "unconfigured")
    } catch (err) {
      // Falha de proxy/CORS/rede → cai no fallback local automaticamente.
      const msg = err instanceof AIError ? err.message
        : err instanceof Error ? err.message
        : ""
      if (/CORS|rede|Edge Function|nao encontrada|404|fetch|network/i.test(msg)) {
        aiProxyDownRef.current = true
      }
      const result = aiCompleteReportLocal(form, patient, currentUser)
      applyResult(result, "local", "fallback")
    } finally {
      setIsAiLoading(false)
    }
  }

  // ── Abrir editor em tela cheia ───────────────────────────────────
  function openNew() {
    setEditingReport(null)
    setForm(EMPTY_FORM)
    setError(null)
    setAiNotice(null)
    setEditorContentKey((k) => k + 1)
    setEditorOpen(true)
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
    setError(null)
    setAiNotice(null)
    setEditorContentKey((k) => k + 1)
    setEditorOpen(true)
  }

  async function handleQuickStatusUpdate(r: Report, nextStatus: ReportStatus) {
    setListError(null)
    setUpdatingId(r.id)
    try {
      const updated = await updateReport({ ...r, status: nextStatus })
      setReports((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      await load()
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Erro ao atualizar status do laudo")
    } finally {
      setUpdatingId(null)
    }
  }

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
      closeEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar laudo")
    } finally { setIsSaving(false) }
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

  if (editorOpen) {
    return (
      <div className={styles.editorPage}>
        <Topbar
          title={editingReport ? "Editar laudo" : "Novo laudo"}
          subtitle={editingReport ? editingReport.patientName : "Preencha os dados ou escolha um template ao lado"}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="ghost" onClick={closeEditor}>Voltar</Button>
              <Button variant="outline" onClick={() => handleSave("Draft")} disabled={isSaving}>
                Salvar rascunho
              </Button>
              <Button onClick={() => handleSave("Finalized")} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Finalizar"}
              </Button>
            </div>
          }
        />

        <div className={styles.editorLayout}>
          <Card className={styles.editorMain}>
            <div className={styles.editorForm}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>
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
                      className={styles.metaInput}
                    >
                      <option value="">Selecionar paciente...</option>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input
                      value={form.patientName}
                      onChange={(e) => { setField("patientName", e.target.value); setField("patientId", e.target.value) }}
                      placeholder="Nome do paciente"
                      className={styles.metaInput}
                    />
                  )}
                </div>
                <Select label="Tipo de laudo" value={form.type}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setField("type", e.target.value)}
                  options={EXAM_TYPES} required />
                <div>
                  <label style={labelStyle}>CID-10</label>
                  <input value={form.cid10} onChange={(e) => setField("cid10", e.target.value)}
                    placeholder="Ex: I10, E11..."
                    className={styles.metaInput} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Diagnóstico</label>
                <textarea value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)}
                  rows={3} placeholder="Diagnóstico clínico..." style={textareaStyle} />
              </div>

              <div>
                <label style={labelStyle}>Conteúdo do laudo</label>
                <div className={styles.editorContentEditor}>
                  <RichTextEditor
                    key={`${editingReport?.id ?? "new"}-${editorContentKey}`}
                    value={form.contentHtml}
                    onChange={(html) => setField("contentHtml", html)}
                    placeholder="Escolha um template ao lado ou escreva o conteúdo completo do laudo..."
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Conclusão</label>
                <textarea value={form.conclusion} onChange={(e) => setField("conclusion", e.target.value)}
                  rows={3} placeholder="Conclusão do laudo..." style={textareaStyle} />
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
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

              {aiNotice && (
                <p className={`${styles.aiNotice} ${aiNotice.tone === "ai" ? styles.aiNoticeAi : styles.aiNoticeLocal}`}>
                  {aiNotice.text}
                </p>
              )}

              {error && (
                <p style={{ fontSize: 12, color: "var(--destructive)", padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid var(--destructive)", margin: 0 }}>
                  {error}
                </p>
              )}
            </div>
          </Card>

          <aside className={styles.sidePanel}>
            <Card className={styles.panelCard}>
              <div className={styles.panelTitle}>Templates prontos</div>
              <TemplateSelector onSelect={applyTemplate} />
            </Card>

            <Card className={styles.panelCard}>
              <div className={styles.panelTitle}>Assistente</div>
              <div className={styles.panelActions}>
                <Button
                  variant="outline"
                  onClick={handleAiComplete}
                  disabled={isAiLoading}
                  title={
                    !form.patientName && !form.patientId
                      ? "Selecione um paciente antes de gerar."
                      : !form.type
                        ? "Informe o tipo de laudo antes de gerar."
                        : aiAvailable && !aiProxyDownRef.current
                          ? "Gera diagnóstico, conclusão e conteúdo via IA."
                          : "Gera o laudo localmente a partir do template e dos dados do paciente."
                  }
                >
                  {isAiLoading ? "Gerando laudo..." : "Completar com IA"}
                </Button>
                <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.45 }}>
                  {aiAvailable && !aiProxyDownRef.current
                    ? "Preenche diagnóstico, conclusão e corpo do laudo com base nos dados informados."
                    : "Sem IA externa configurada: monta o laudo localmente a partir do template e do paciente."}
                </p>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar
        title="Laudos e Relatórios"
        subtitle={`${visibleReports.length} laudo${visibleReports.length !== 1 ? "s" : ""}`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <RefreshButton onRefresh={load} />
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
        {listError && (
          <div style={{ padding: "10px 14px", margin: "10px 10px 0", borderRadius: 8, fontSize: 12, color: "var(--destructive)", background: "var(--destructive-light, #fef2f2)", border: "1px solid var(--destructive)" }}>
            {listError}
          </div>
        )}
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
                            <Button size="sm" variant="ghost" disabled={updatingId === r.id} onClick={() => handleQuickStatusUpdate(r, "Finalized")}>
                              {updatingId === r.id ? "Finalizando..." : "Finalizar"}
                            </Button>
                          )}
                          {r.status === "Finalized" && (
                            <Button size="sm" variant="ghost" disabled={updatingId === r.id} onClick={() => handleQuickStatusUpdate(r, "Sent")}>
                              {updatingId === r.id ? "Enviando..." : "Enviar"}
                            </Button>
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
    </div>
  )
}
