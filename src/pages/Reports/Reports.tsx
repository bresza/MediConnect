import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from "react"
import { getReports, createReport, updateReport, deleteReport } from "../../services/domain"
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
import { isAIConfigured, AIError } from "../../services/ai"
import { completeReportWithAI, complementReportContentWithAI, htmlToPlainText, type ReportAICompletion } from "../../services/reportAI"
import {
  appendSpokenToObservations,
  complementReportContentFromCid,
  extractObservationsText,
  findReportTemplateByCid,
} from "../../utils/reportContentSections"
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition"
import { formatCrm, formatDate, sortByName, toTitleCase } from "../../utils"
import { normalizeCid10, assertCid10Required, validateCid10 } from "../../utils/cid10"
import { fillReportTemplate } from "../../utils/reportPlaceholders"
import { canDo } from "../../utils/permissions"
import { ReportPreview, type ReportPreviewData } from "./ReportPreview"
import { Modal } from "../../components/ui/Modal/Modal"
import { printElement } from "../../utils/printReport"
import styles from "./Reports.module.css"

interface ReportsProps { currentUser: User; patients?: Patient[] }

const STATUS_PT: Record<ReportStatus, string> = {
  Draft: "Rascunho", Finalized: "Liberado", Sent: "Liberado",
}

function isReportLocked(status: ReportStatus): boolean {
  return status === "Finalized" || status === "Sent"
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

// ─── Fallback offline (sem chamar OpenAI) ─────────────────────────
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Quando a IA externa nao esta disponivel (sem chave direta + proxy
// `ai-chat` bloqueando CORS), montamos um laudo coerente a partir do
// template ativo, dos dados ja preenchidos e do paciente. NAO e
// inteligencia generativa, mas garante que o medico nunca fique com
// o botao "Completar com IA" inutilizavel.
function aiCompleteReportLocal(
  form: ReportForm,
  patient: Patient | undefined,
  currentUser: User,
): ReportAICompletion {
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
    "<h2>Conduta sugerida</h2>",
    `<ul>${conductBlock}</ul>`,
    "<h2>Conclusão</h2>",
    `<p>${escapeHtml(conclusion)}</p>`,
    "<p><em>Decisão clínica final do(a) médico(a) responsável.</em></p>",
  ].filter(Boolean).join("\n")

  return { diagnosis, conclusion, contentHtml }
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
  const [isFormattingContent, setIsFormattingContent] = useState(false)
  const [voicePreview, setVoicePreview] = useState("")
  const [aiNotice,    setAiNotice]    = useState<{ tone: "ai" | "local"; text: string } | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [cidFieldError, setCidFieldError] = useState<string | null>(null)
  const [listError,   setListError]   = useState<string | null>(null)
  const [listNotice,  setListNotice]  = useState<string | null>(null)
  const [updatingId,  setUpdatingId]  = useState<string | null>(null)
  const [search,      setSearch]      = useState("")
  const [filterStatus, setFilterStatus] = useState<ReportStatus | "All">("All")
  const [filterDoctor, setFilterDoctor] = useState<string>("All")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null)
  const [annulTarget, setAnnulTarget] = useState<Report | null>(null)
  const [annulReason, setAnnulReason] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Marca a Edge Function `ai-chat` como inacessível depois da primeira
  // falha de CORS/rede; nas próximas tentativas, pulamos direto para o
  // fallback local sem tentar de novo o proxy.
  const aiProxyDownRef = useRef(false)
  const pendingPdfTitleRef = useRef<string | null>(null)
  const aiAvailable = useMemo(() => isAIConfigured(), [])
  const cidTemplate = useMemo(
    () => (normalizeCid10(form.cid10) ? findReportTemplateByCid(form.cid10) : undefined),
    [form.cid10],
  )
  const appendDictationRef = useRef<(chunk: string) => void>(() => {})

  const {
    supported: voiceSupported,
    listening: isDictatingContent,
    toggle: toggleContentDictation,
    abort: abortContentDictation,
  } = useSpeechRecognition({
    continuous: true,
    autoSendOnEnd: false,
    onFinalChunk: (chunk) => appendDictationRef.current(chunk),
    onInterimTranscript: setVoicePreview,
    onError: (message) => setError(message),
  })

  appendDictationRef.current = (chunk: string) => {
    setForm((prev) => ({
      ...prev,
      contentHtml: appendSpokenToObservations(prev.contentHtml, chunk),
    }))
    setVoicePreview("")
  }
  const canDeleteReports = currentUser.role === "manager" || currentUser.role === "admin"
  const canCreateReports = canDo(currentUser.role, "create_reports")
  const canUpdateReports = canDo(currentUser.role, "update_reports")
  const readOnlyReports = !canCreateReports && canDo(currentUser.role, "view_reports")

  const doctorFilterOptions = useMemo(() => {
    const names = new Set(
      reports.map((r) => r.doctorName?.trim()).filter(Boolean) as string[],
    )
    return sortByName([...names], (name) => name)
  }, [reports])

  const visibleReports = sortByName(
    reports
      .map((r) => ({ ...r, patientName: toTitleCase(r.patientName), doctorName: toTitleCase(r.doctorName) }))
      .filter((r) => {
        if (currentUser.role !== "doctor") return true
        // Alguns registros retornam sem doctorName no join; usa created_by como fallback.
        return r.doctorId === currentUser.id || r.doctorName === toTitleCase(currentUser.name)
      })
      .filter((r) => filterStatus === "All" || r.status === filterStatus)
      .filter((r) => filterDoctor === "All" || r.doctorName === filterDoctor)
      .filter((r) => {
        if (!filterDateFrom && !filterDateTo) return true
        if (filterDateFrom && r.date < filterDateFrom) return false
        if (filterDateTo && r.date > filterDateTo) return false
        return true
      })
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

  useEffect(() => {
    if (!previewData || !pendingPdfTitleRef.current) return
    const title = pendingPdfTitleRef.current
    pendingPdfTitleRef.current = null
    const timer = window.setTimeout(() => {
      printElement("report-print-area", title)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [previewData])

  function setField<K extends keyof ReportForm>(k: K, v: ReportForm[K]) {
    setForm((p) => ({ ...p, [k]: v })); setError(null)
  }

  function handleCid10Change(raw: string) {
    const normalized = normalizeCid10(raw).slice(0, 8)
    setField("cid10", normalized)
    if (!normalized) {
      setCidFieldError(null)
      return
    }
    setCidFieldError(validateCid10(normalized))
  }

  function closeEditor() {
    abortContentDictation()
    setVoicePreview("")
    setEditorOpen(false)
    setEditingReport(null)
    setError(null)
    setCidFieldError(null)
    setAiNotice(null)
    setPreviewData(null)
  }

  function buildPreviewFromForm(): ReportPreviewData {
    return {
      patientName: form.patientName,
      reportType: form.type,
      cid10: form.cid10,
      diagnosis: form.diagnosis,
      conclusion: form.conclusion,
      contentHtml: form.contentHtml,
      date: editingReport?.date ?? new Date().toISOString().slice(0, 10),
      hideDate: form.hideDate,
      hideSignature: form.hideSignature,
      doctorName: currentUser.name,
      doctorCrm: currentUser.crm,
      doctorSpecialty: currentUser.specialty,
      orderNumber: editingReport?.orderNumber,
    }
  }

  function buildPreviewFromReport(r: Report): ReportPreviewData {
    return {
      patientName: r.patientName,
      reportType: r.type,
      cid10: r.cid10 ?? "",
      diagnosis: r.diagnosis ?? "",
      conclusion: r.conclusion ?? "",
      contentHtml: r.contentHtml ?? r.content ?? "",
      date: r.date,
      hideDate: r.hideDate ?? false,
      hideSignature: r.hideSignature ?? false,
      doctorName: r.doctorName || currentUser.name,
      doctorCrm: currentUser.crm,
      doctorSpecialty: currentUser.specialty,
      orderNumber: r.orderNumber,
    }
  }

  function openPreviewFromForm() {
    if (!form.patientName && !form.patientId) {
      setError("Selecione o paciente antes de pré-visualizar.")
      return
    }
    const cidError = assertCid10Required(form.cid10)
    if (cidError) { setCidFieldError(cidError); setError(cidError); return }
    setPreviewData(buildPreviewFromForm())
  }

  function openPreviewFromReport(r: Report) {
    pendingPdfTitleRef.current = null
    setPreviewData(buildPreviewFromReport(r))
  }

  function openPdfForReport(r: Report) {
    pendingPdfTitleRef.current = r.type?.trim() || r.exam?.trim() || "Laudo Médico"
    setPreviewData(buildPreviewFromReport(r))
  }

  async function handleDeleteReport(id: string, justification?: string) {
    setListError(null)
    setDeletingId(id)
    try {
      if (justification?.trim()) {
        const target = reports.find((r) => r.id === id)
        if (target) {
          await updateReport({
            ...target,
            conclusion: `${target.conclusion ?? ""}\n\n[ANULAÇÃO] ${justification.trim()}`.trim(),
          })
        }
      }
      await deleteReport(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      setAnnulTarget(null)
      setAnnulReason("")
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Não foi possível anular o laudo.")
    } finally {
      setDeletingId(null)
    }
  }

  // ── Aplicar template ─────────────────────────────────────────────
  function applyTemplate(t: ReportTemplate) {
    const patient    = patients.find((p) => p.id === form.patientId)
    const pName      = (patient?.name ?? form.patientName) || "(nome do paciente)"
    const dName      = currentUser.name ?? "(nome do médico)"
    const today      = new Date().toLocaleDateString("pt-BR")
    const ctx = {
      patientName: pName,
      doctorName: dName,
      date: today,
      crm: formatCrm(currentUser.crm) || "(CRM)",
      cpf: patient?.cpf,
    }
    const fill = (s: string) => fillReportTemplate(s, ctx)
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
    ].filter(Boolean).join(", ")

    const useExternal = aiAvailable && !aiProxyDownRef.current
    const template = REPORT_TEMPLATES.find((t) => t.exam === form.type)
    const applyResult = (result: ReportAICompletion, source: "ai" | "local") => {
      setForm((prev) => ({
        ...prev,
        diagnosis:   result.diagnosis,
        conclusion:  result.conclusion,
        contentHtml: result.contentHtml,
      }))
      setEditorContentKey((k) => k + 1)
      setAiNotice({
        tone: source === "local" ? "local" : "ai",
        text: "Revise antes de finalizar",
      })
    }

    try {
      if (useExternal) {
        const result = await completeReportWithAI({
          examType: form.type,
          patientInfo,
          doctor: currentUser,
          cid10: form.cid10,
          diagnosis: form.diagnosis,
          conclusion: form.conclusion,
          contentHtml: form.contentHtml,
          templateDiagnosis: template?.diagnosis,
          templateConclusion: template?.conclusion,
        })
        applyResult(result, "ai")
        return
      }
      const result = aiCompleteReportLocal(form, patient, currentUser)
      applyResult(result, "local")
    } catch (err) {
      // Falha de proxy/CORS/rede → cai no fallback local automaticamente.
      const msg = err instanceof AIError ? err.message
        : err instanceof Error ? err.message
        : ""
      if (/CORS|rede|Edge Function|nao encontrada|404|fetch|network/i.test(msg)) {
        aiProxyDownRef.current = true
      }
      const result = aiCompleteReportLocal(form, patient, currentUser)
      applyResult(result, "local")
    } finally {
      setIsAiLoading(false)
    }
  }

  async function handleComplementContent() {
    const cidError = assertCid10Required(form.cid10)
    if (cidError) {
      setCidFieldError(cidError)
      setError("Informe o CID-10 antes de complementar o laudo.")
      return
    }

    const observations = extractObservationsText(form.contentHtml)
      || htmlToPlainText(form.contentHtml).trim()
    if (!observations) {
      setError("Dicte ou escreva observações antes de complementar com IA.")
      return
    }
    if (isDictatingContent) {
      abortContentDictation()
      setVoicePreview("")
    }

    setIsFormattingContent(true)
    setError(null)
    setAiNotice(null)

    const patient = patients.find((p) => p.id === form.patientId)
    const ageYears = patient?.dob
      ? new Date().getFullYear() - new Date(patient.dob).getFullYear()
      : null
    const patientInfo = [
      `Nome: ${patient?.name ?? (form.patientName || "Não informado")}`,
      ageYears !== null ? `Idade: ${ageYears} anos` : "",
      patient?.gender ? `Sexo: ${patient.gender}` : "",
    ].filter(Boolean).join(", ")

    const normalizedCid = normalizeCid10(form.cid10)
    const template = findReportTemplateByCid(normalizedCid)
    const today = new Date().toLocaleDateString("pt-BR")
    const placeholderCtx = {
      patientName: (patient?.name ?? form.patientName) || "(nome do paciente)",
      doctorName: currentUser.name ?? "(nome do médico)",
      date: today,
      crm: formatCrm(currentUser.crm) || "(CRM)",
      cpf: patient?.cpf,
    }

    const useExternal = aiAvailable && !aiProxyDownRef.current

    const applyComplement = (result: { contentHtml: string; diagnosis: string; conclusion: string }) => {
      setForm((prev) => ({
        ...prev,
        contentHtml: result.contentHtml,
        diagnosis: prev.diagnosis.trim() || result.diagnosis,
        conclusion: prev.conclusion.trim() || result.conclusion,
        type: template?.exam && prev.type === "Laudo Médico" ? template.exam : prev.type,
      }))
      setEditorContentKey((k) => k + 1)
    }

    try {
      const result = useExternal
        ? await complementReportContentWithAI({
            cid10: normalizedCid,
            examType: form.type || template?.exam || "Laudo Médico",
            patientInfo,
            doctor: currentUser,
            observations,
            templateReference: template?.content,
            templateDiagnosis: template?.diagnosis,
            templateConclusion: template?.conclusion,
          })
        : complementReportContentFromCid({
            cid10: normalizedCid,
            observations,
            placeholderCtx,
          })

      applyComplement(result)
      setAiNotice({
        tone: useExternal ? "ai" : "local",
        text: "Revise antes de finalizar",
      })
    } catch (err) {
      const msg = err instanceof AIError ? err.message
        : err instanceof Error ? err.message
        : ""
      if (/CORS|rede|Edge Function|nao encontrada|404|fetch|network/i.test(msg)) {
        aiProxyDownRef.current = true
      }
      applyComplement(complementReportContentFromCid({
        cid10: normalizedCid,
        observations,
        placeholderCtx,
      }))
      setAiNotice({
        tone: "local",
        text: "Revise antes de finalizar",
      })
    } finally {
      setIsFormattingContent(false)
    }
  }

  // ── Abrir editor em tela cheia ───────────────────────────────────
  function openNew() {
    setEditingReport(null)
    setForm(EMPTY_FORM)
    setError(null)
    setCidFieldError(null)
    setAiNotice(null)
    setEditorContentKey((k) => k + 1)
    setEditorOpen(true)
  }

  // ── Editar laudo ─────────────────────────────────────────────────
  function openEdit(r: Report) {
    if (isReportLocked(r.status)) {
      setListError("Laudos finalizados não podem ser editados. Anule e crie um novo laudo, se necessário.")
      return
    }
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
    setCidFieldError(null)
    setAiNotice(null)
    setEditorContentKey((k) => k + 1)
    setEditorOpen(true)
  }

  async function handleQuickStatusUpdate(r: Report, nextStatus: ReportStatus) {
    setListError(null)
    setListNotice(null)
    setUpdatingId(r.id)
    try {
      const updated = await updateReport({ ...r, status: nextStatus })
      setReports((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      if (nextStatus === "Sent") {
        setListNotice(`Laudo enviado. ${r.patientName} já pode visualizá-lo no portal, em Laudos.`)
      } else if (nextStatus === "Finalized") {
        setListNotice("Laudo finalizado. Use «PDF» ou «Visualizar» para gerar o documento.")
      }
      await load()
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Erro ao atualizar status do laudo")
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleSave(finalStatus?: ReportStatus) {
    if (editingReport && isReportLocked(editingReport.status)) {
      setError("Laudos finalizados não podem ser alterados.")
      return
    }
    if (!form.patientId && !form.patientName) { setError("Selecione o paciente."); return }
    if (!form.type)                           { setError("Informe o tipo de laudo."); return }
    const cidError = assertCid10Required(form.cid10)
    if (cidError) { setCidFieldError(cidError); setError(cidError); return }
    setIsSaving(true); setError(null); setCidFieldError(null)
    try {
      const normalizedCid = normalizeCid10(form.cid10)
      const payload = {
        patientId:     form.patientId || form.patientName,
        patientName:   form.patientName,
        type:          form.type,
        exam:          form.type,
        diagnosis:     form.diagnosis,
        conclusion:    form.conclusion,
        content:       form.contentHtml,
        contentHtml:   form.contentHtml,
        cid10:         normalizedCid,
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

  if (previewData) {
    return (
      <ReportPreview
        {...previewData}
        onBack={() => setPreviewData(null)}
        backLabel={editorOpen ? "← Voltar para edição" : "← Voltar para laudos"}
        primaryAction={
          editorOpen && !isReportLocked(form.status)
            ? { label: "Liberar laudo", onClick: () => void handleSave("Finalized") }
            : undefined
        }
      />
    )
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
              <Button variant="outline" onClick={openPreviewFromForm}>Pré-visualizar</Button>
              <Button variant="outline" onClick={() => handleSave("Draft")} disabled={isSaving}>
                Salvar rascunho
              </Button>
              <Button onClick={() => handleSave("Finalized")} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Liberar laudo"}
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
                  <label style={labelStyle}>CID-10 *</label>
                  <input
                    value={form.cid10}
                    onChange={(e) => handleCid10Change(e.target.value)}
                    onBlur={() => setCidFieldError(assertCid10Required(form.cid10))}
                    placeholder="Ex: I10, E11.9..."
                    className={styles.metaInput}
                    maxLength={8}
                    style={cidFieldError ? { borderColor: "var(--destructive, #ef4444)" } : undefined}
                    required
                  />
                  {cidFieldError && (
                    <p style={{ fontSize: 11, color: "var(--destructive, #ef4444)", marginTop: 4, marginBottom: 0 }}>
                      {cidFieldError}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Diagnóstico</label>
                <textarea value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)}
                  rows={3} placeholder="Diagnóstico clínico..." style={textareaStyle} />
              </div>

              <div>
                <div className={styles.contentLabelRow}>
                  <label style={labelStyle}>Conteúdo do laudo</label>
                  <div className={styles.contentActions}>
                    {voiceSupported && (
                      <button
                        type="button"
                        className={`${styles.dictateBtn} ${isDictatingContent ? styles.dictateBtnActive : ""}`}
                        onClick={toggleContentDictation}
                        disabled={isFormattingContent}
                        title={isDictatingContent ? "Parar transcrição" : "Dictar observações do laudo"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {isDictatingContent ? "Parar" : "Dictar"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.formatBtn}
                      onClick={() => void handleComplementContent()}
                      disabled={
                        isFormattingContent
                        || !normalizeCid10(form.cid10)
                        || (!extractObservationsText(form.contentHtml) && !htmlToPlainText(form.contentHtml).trim())
                      }
                      title="Monta o laudo conforme o CID-10, usando suas observações dictadas"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 19h14" strokeLinecap="round" />
                      </svg>
                      {isFormattingContent ? "Complementando..." : "Complementar com IA"}
                    </button>
                  </div>
                </div>
                {isDictatingContent && voicePreview && (
                  <p className={styles.dictationPreview}>
                    Transcrevendo (Observações): {voicePreview}
                  </p>
                )}
                {isDictatingContent && !voicePreview && (
                  <p className={styles.dictationPreview}>Ouvindo… fale suas observações clínicas.</p>
                )}
                {!isDictatingContent && normalizeCid10(form.cid10) && (
                  <p className={styles.dictationPreview}>
                    {cidTemplate
                      ? `CID ${normalizeCid10(form.cid10)} — template: ${cidTemplate.name}. Dictado vai para Observações; use Complementar com IA para montar o laudo.`
                      : `Dictado vai para Observações. Informe um CID com template (ex.: E11, I10) e clique em Complementar com IA.`}
                  </p>
                )}
                <div className={styles.editorContentEditor}>
                  <RichTextEditor
                    key={`${editingReport?.id ?? "new"}-${editorContentKey}`}
                    value={form.contentHtml}
                    onChange={(html) => setField("contentHtml", html)}
                    placeholder="Dictado e anotações vão para a seção Observações. Informe o CID e use Complementar com IA."
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
              <p className={styles.signatureHint}>
                A assinatura digital não está disponível nesta versão. O laudo exibirá o nome e CRM do profissional.
              </p>

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
                {!voiceSupported && (
                  <p className={styles.voiceHint}>
                    Dictado por voz no conteúdo requer Chrome ou Edge com microfone liberado.
                  </p>
                )}
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
            {canCreateReports && <Button onClick={openNew}>+ Novo laudo</Button>}
          </div>
        }
      />

      {listError && (
        <p style={{ fontSize: 12, color: "var(--destructive)", marginBottom: 12 }}>{listError}</p>
      )}
      {listNotice && (
        <p style={{ fontSize: 12, color: "var(--primary)", marginBottom: 12 }}>{listNotice}</p>
      )}

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
        {doctorFilterOptions.length > 0 && (
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            aria-label="Filtrar por médico"
            style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", minWidth: 180 }}
          >
            <option value="All">Todos os médicos</option>
            {doctorFilterOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          aria-label="Data inicial"
          style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          aria-label="Data final"
          style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
        {(filterDateFrom || filterDateTo || filterDoctor !== "All") && (
          <button
            type="button"
            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterDoctor("All") }}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            Limpar filtros
          </button>
        )}
        {(["All", "Draft", "Finalized"] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", transition: "all 0.15s", background: filterStatus === s ? "var(--primary)" : "var(--background)", color: filterStatus === s ? "white" : "var(--foreground)" }}>
            {s === "All" ? "Todos" : STATUS_PT[s]}
          </button>
        ))}
      </div>

      {readOnlyReports && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
          Modo consulta: você pode visualizar laudos, mas não criar ou alterar documentos.
        </p>
      )}

      {/* Tabela */}
      <Card>
        {listError && (
          <div style={{ padding: "10px 14px", margin: "10px 10px 0", borderRadius: 8, fontSize: 12, color: "var(--destructive)", background: "var(--destructive-light, #fef2f2)", border: "1px solid var(--destructive)" }}>
            {listError}
          </div>
        )}
        {listNotice && (
          <div style={{ padding: "10px 14px", margin: "10px 10px 0", borderRadius: 8, fontSize: 12, color: "var(--primary)", background: "var(--primary-light, #eff6ff)", border: "1px solid var(--primary)" }}>
            {listNotice}
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
                          {canUpdateReports && !isReportLocked(r.status) && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Editar</Button>
                          )}
                          {(isReportLocked(r.status) || r.status === "Draft" || readOnlyReports) && (
                            <Button size="sm" variant="ghost" onClick={() => openPreviewFromReport(r)}>
                              Visualizar
                            </Button>
                          )}
                          {isReportLocked(r.status) && (
                            <Button size="sm" variant="ghost" onClick={() => openPdfForReport(r)}>
                              PDF
                            </Button>
                          )}
                          {canUpdateReports && r.status === "Draft" && (
                            <Button size="sm" variant="ghost" disabled={updatingId === r.id} onClick={() => handleQuickStatusUpdate(r, "Finalized")}>
                              {updatingId === r.id ? "Liberando..." : "Liberar laudo"}
                            </Button>
                          )}
                          {canUpdateReports && r.status === "Finalized" && (
                            <Button size="sm" variant="ghost" disabled={updatingId === r.id} onClick={() => handleQuickStatusUpdate(r, "Sent")}>
                              {updatingId === r.id ? "Enviando..." : "Enviar"}
                            </Button>
                          )}
                          {canDeleteReports && isReportLocked(r.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setAnnulTarget(r)
                                setAnnulReason("")
                              }}
                            >
                              Anular
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

      <Modal
        isOpen={Boolean(annulTarget)}
        onClose={() => { setAnnulTarget(null); setAnnulReason("") }}
        title="Anular laudo liberado"
      >
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
          Laudos liberados exigem justificativa para anulação. Informe o motivo abaixo.
        </p>
        <textarea
          value={annulReason}
          onChange={(e) => setAnnulReason(e.target.value)}
          placeholder="Descreva o motivo da anulação..."
          rows={4}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", outline: "none", resize: "vertical",
            boxSizing: "border-box", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Button variant="ghost" onClick={() => { setAnnulTarget(null); setAnnulReason("") }}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={annulReason.trim().length < 10 || deletingId === annulTarget?.id}
            onClick={() => annulTarget && void handleDeleteReport(annulTarget.id, annulReason)}
          >
            {deletingId === annulTarget?.id ? "Anulando..." : "Confirmar anulação"}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
