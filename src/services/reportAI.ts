import { chatComplete, type ChatMessage } from "./ai"
import type { Patient, User } from "../types"
import { formatCrm } from "../utils"
import { complementReportContentFromCid } from "../utils/reportContentSections"

export interface ReportAICompletion {
  diagnosis: string
  conclusion: string
  contentHtml: string
}

const REPORT_JSON_SYSTEM = [
  "Voce e o assistente clinico do MediConnect que ajuda medicos a redigir laudos em portugues do Brasil.",
  "Gere SEMPRE um JSON valido (UTF-8) e nada mais, sem comentarios, sem texto fora do JSON e sem markdown.",
  'Estrutura obrigatoria: { "diagnosis": string, "conclusion": string, "contentHtml": string }.',
  "diagnosis: paragrafo objetivo (1-3 frases) descrevendo o quadro do paciente.",
  "conclusion: paragrafo (1-2 frases) com a conclusao do laudo e orientacao geral.",
  "contentHtml: HTML simples usando apenas <h2>, <p>, <ul>, <li>, <strong>. Sem <html>, <body>, <style>, scripts ou classes.",
  "Estruture contentHtml em secoes: Identificacao do paciente, Anamnese e achados, Avaliacao clinica, Conduta sugerida e Conclusao.",
  "Nao invente exames, valores numericos, doses ou nomes que nao tenham sido informados; use [VALOR] ou [A DEFINIR] quando faltarem dados.",
  "Nao inclua diagnostico definitivo, prescricao ou doses sem ressalva: deixe explicito que a decisao final e do(a) medico(a).",
].join(" ")

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

/** Extrai texto legível de HTML simples (editor de laudo). */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<\/li>\s*/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const COMPLEMENT_CONTENT_SYSTEM = [
  "Voce e o assistente clinico do MediConnect que redige laudos em portugues do Brasil.",
  "Monte o corpo do laudo conforme o CID-10 e o template de referencia da patologia informados.",
  "Responda SEMPRE JSON valido: { \"contentHtml\": string, \"diagnosis\": string, \"conclusion\": string }.",
  "contentHtml: HTML simples (<h2>, <p>, <ul>, <li>, <strong>). Siga as secoes tipicas do template para aquele CID.",
  "Inclua OBRIGATORIAMENTE a secao <h2>Observações</h2> com as anotacoes do medico em linguagem clinica adequada.",
  "Distribua achados das observacoes nas secoes corretas (queixa, achados, conduta) sem inventar dados.",
  "diagnosis: 1-2 frases objetivas coerentes com CID e observacoes.",
  "conclusion: 1-2 frases de encerramento coerentes com CID e observacoes.",
  "Nao invente exames, valores numericos ou achados nao mencionados; use [A DEFINIR] quando faltar dado.",
  "Nao inclua cabecalho com identificacao do paciente nem linha de CID no contentHtml (CID ja esta no formulario).",
].join(" ")

export interface ReportContentComplement {
  contentHtml: string
  diagnosis: string
  conclusion: string
}

/** @deprecated use complementReportContentFromCid */
export function formatReportContentLocal(rawContent: string): string {
  const paragraphs = rawContent
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return ""

  const formatted = paragraphs.map((line) => {
    const cap = line.charAt(0).toUpperCase() + line.slice(1)
    return /[.!?…]$/.test(cap) ? cap : `${cap}.`
  })

  return [
    `<h2>Observações</h2>`,
    ...formatted.map((p) => `<p>${escapeHtml(p)}</p>`),
  ].join("\n")
}

function parseComplementResponse(raw: string, fallback: ReportContentComplement): ReportContentComplement {
  const jsonBlock = extractJsonBlock(raw)
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock) as Partial<ReportContentComplement>
      const contentHtml = parsed.contentHtml?.trim() ?? ""
      if (contentHtml && !looksLikeJsonPayload(contentHtml)) {
        return {
          contentHtml,
          diagnosis: (parsed.diagnosis ?? fallback.diagnosis).trim(),
          conclusion: (parsed.conclusion ?? fallback.conclusion).trim(),
        }
      }
    } catch {
      const partialHtml = extractJsonStringField(jsonBlock, "contentHtml")
      if (partialHtml && !looksLikeJsonPayload(partialHtml)) {
        return {
          contentHtml: partialHtml,
          diagnosis: extractJsonStringField(jsonBlock, "diagnosis") || fallback.diagnosis,
          conclusion: extractJsonStringField(jsonBlock, "conclusion") || fallback.conclusion,
        }
      }
    }
  }
  if (raw.trim().startsWith("<") && !looksLikeJsonPayload(raw)) {
    return { ...fallback, contentHtml: raw.trim() }
  }
  return fallback
}

/** Complementa o laudo com base no CID, template de referencia e observações dictadas. */
export async function complementReportContentWithAI(input: {
  cid10: string
  examType: string
  patientInfo: string
  doctor: Pick<User, "name" | "crm">
  observations: string
  templateReference?: string
  templateDiagnosis?: string
  templateConclusion?: string
  signal?: AbortSignal
}): Promise<ReportContentComplement> {
  const doctorCrm = input.doctor.crm ? formatCrm(input.doctor.crm) || input.doctor.crm : undefined
  const fallback = complementReportContentFromCid({
    cid10: input.cid10,
    observations: input.observations,
  })

  const messages: ChatMessage[] = [
    { role: "system", content: COMPLEMENT_CONTENT_SYSTEM },
    {
      role: "user",
      content: [
        `Medico: ${input.doctor.name}${doctorCrm ? ` (CRM ${doctorCrm})` : ""}.`,
        `Paciente: ${input.patientInfo}.`,
        `Tipo de laudo: ${input.examType}.`,
        `CID-10: ${input.cid10}.`,
        input.templateReference
          ? `Template de referencia para este CID (estrutura e secoes esperadas):\n"""${input.templateReference}"""`
          : "",
        input.templateDiagnosis ? `Diagnostico de referencia: ${input.templateDiagnosis}.` : "",
        input.templateConclusion ? `Conclusao de referencia: ${input.templateConclusion}.` : "",
        "Observacoes dictadas pelo medico (preservar sentido; incluir na secao Observações):",
        `"""${input.observations || "Sem observações adicionais."}"""`,
        "Gere contentHtml estruturado conforme o CID, diagnosis e conclusion coerentes.",
        'Responda APENAS com { "contentHtml", "diagnosis", "conclusion" }.',
      ].filter(Boolean).join("\n"),
    },
  ]

  const raw = await chatComplete(messages, {
    signal: input.signal,
    temperature: 0.25,
    maxTokens: 2200,
  })

  return parseComplementResponse(raw, fallback)
}

/** @deprecated use complementReportContentWithAI */
export async function formatReportContentWithAI(input: {
  examType: string
  patientInfo: string
  doctor: Pick<User, "name" | "crm">
  rawContent: string
  signal?: AbortSignal
}): Promise<string> {
  const result = await complementReportContentWithAI({
    cid10: "",
    examType: input.examType,
    patientInfo: input.patientInfo,
    doctor: input.doctor,
    observations: input.rawContent,
    signal: input.signal,
  })
  return result.contentHtml
}

function unwrapJsonString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
}

export function extractJsonBlock(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  if (first >= 0) return trimmed.slice(first)
  return null
}

function extractJsonStringField(block: string, field: string): string {
  const complete = block.match(
    new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s"),
  )
  if (complete?.[1]) return unwrapJsonString(complete[1]).trim()

  const partial = block.match(new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*)$`))
  if (!partial?.[1]) return ""

  let value = partial[1]
  const nextField = value.search(/"\s*,\s*"(?:conclusion|contentHtml|diagnosis)"/)
  if (nextField >= 0) value = value.slice(0, nextField)
  value = value.replace(/"\s*}\s*$/, "").replace(/\\+$/, "")
  return unwrapJsonString(value).trim()
}

function looksLikeJsonPayload(raw: string): boolean {
  const trimmed = raw.trim()
  return trimmed.startsWith("{")
    || trimmed.startsWith("```")
    || /"diagnosis"\s*:/.test(trimmed)
    || /"contentHtml"\s*:/.test(trimmed)
}

function buildReportHtmlFromFields(input: {
  diagnosis: string
  conclusion: string
  patientInfo?: string
  doctorName?: string
  doctorCrm?: string
  cid10?: string
}): string {
  const doctorLine = input.doctorName
    ? `<p><strong>Médico responsável:</strong> ${escapeHtml(input.doctorName)}${
      input.doctorCrm ? ` — CRM ${escapeHtml(input.doctorCrm)}` : ""
    }</p>`
    : ""

  return [
    input.patientInfo ? `<h2>Identificação</h2><p>${escapeHtml(input.patientInfo)}</p>` : "",
    doctorLine,
    input.cid10 ? `<p><strong>CID-10:</strong> ${escapeHtml(input.cid10)}</p>` : "",
    `<h2>Avaliação clínica</h2><p>${escapeHtml(input.diagnosis)}</p>`,
    `<h2>Conclusão</h2><p>${escapeHtml(input.conclusion)}</p>`,
    "<p><em>Decisão clínica final do(a) médico(a) responsável.</em></p>",
  ].filter(Boolean).join("\n")
}

export function parseAiReportResponse(
  raw: string,
  fallback: Partial<ReportAICompletion> & {
    patientInfo?: string
    doctorName?: string
    doctorCrm?: string
    cid10?: string
  } = {},
): ReportAICompletion {
  const jsonBlock = extractJsonBlock(raw)
  let parsed: Partial<ReportAICompletion> = {}

  if (jsonBlock) {
    try {
      parsed = JSON.parse(jsonBlock) as Partial<ReportAICompletion>
    } catch {
      parsed = {
        diagnosis: extractJsonStringField(jsonBlock, "diagnosis"),
        conclusion: extractJsonStringField(jsonBlock, "conclusion"),
        contentHtml: extractJsonStringField(jsonBlock, "contentHtml"),
      }
    }
  }

  const diagnosis = (parsed.diagnosis ?? fallback.diagnosis ?? "").trim()
  const conclusion = (parsed.conclusion ?? fallback.conclusion ?? "").trim()
  let contentHtml = (parsed.contentHtml ?? fallback.contentHtml ?? "").trim()

  if (!contentHtml || looksLikeJsonPayload(contentHtml)) {
    if (raw.trim().startsWith("<") && !looksLikeJsonPayload(raw)) {
      contentHtml = raw.trim()
    } else if (diagnosis || conclusion) {
      contentHtml = buildReportHtmlFromFields({
        diagnosis: diagnosis || "Quadro clínico em avaliação, correlacionado aos achados apresentados.",
        conclusion: conclusion || "Conclusão compatível com os dados informados; seguimento conforme critério médico.",
        patientInfo: fallback.patientInfo,
        doctorName: fallback.doctorName,
        doctorCrm: fallback.doctorCrm,
        cid10: fallback.cid10,
      })
    } else if (raw.trim() && !looksLikeJsonPayload(raw)) {
      contentHtml = plainTextToHtml(raw.trim())
    } else {
      contentHtml = buildReportHtmlFromFields({
        diagnosis: diagnosis || "Quadro clínico em avaliação, correlacionado aos achados apresentados.",
        conclusion: conclusion || "Conclusão compatível com os dados informados; seguimento conforme critério médico.",
        patientInfo: fallback.patientInfo,
        doctorName: fallback.doctorName,
        doctorCrm: fallback.doctorCrm,
        cid10: fallback.cid10,
      })
    }
  }

  return {
    diagnosis: diagnosis || "Quadro clínico em avaliação, correlacionado aos achados apresentados.",
    conclusion: conclusion || "Conclusão compatível com os dados informados; seguimento conforme critério médico.",
    contentHtml,
  }
}

function buildReportUserPrompt(input: {
  patientInfo: string
  examType: string
  doctorName: string
  doctorCrm?: string
  cid10?: string
  diagnosisDraft?: string
  conclusionDraft?: string
  contentDraft?: string
  templateDiagnosis?: string
  templateConclusion?: string
  dictation?: string
  extraInstruction?: string
}): string {
  return [
    `Medico responsavel: ${input.doctorName}${input.doctorCrm ? ` (CRM ${input.doctorCrm})` : ""}.`,
    `Paciente: ${input.patientInfo}.`,
    `Tipo de laudo: ${input.examType}.`,
    input.cid10 ? `CID-10 informado: ${input.cid10}.` : "Sem CID-10 informado.",
    input.diagnosisDraft ? `Diagnostico em rascunho: ${input.diagnosisDraft}.` : "Sem diagnostico em rascunho.",
    input.conclusionDraft ? `Conclusao em rascunho: ${input.conclusionDraft}.` : "Sem conclusao em rascunho.",
    input.templateDiagnosis ? `Diagnostico de referencia do template: ${input.templateDiagnosis}.` : "",
    input.templateConclusion ? `Conclusao de referencia do template: ${input.templateConclusion}.` : "",
    input.contentDraft ? `Rascunho atual do laudo (HTML ou texto): ${input.contentDraft}` : "Sem rascunho de conteudo.",
    input.dictation
      ? `Transcricao da dictacao do medico (use como base principal, corrija termos medicos e organize em laudo formal):\n"""${input.dictation}"""`
      : "",
    input.extraInstruction ?? "Refine os campos com base nesse contexto, mantendo o que ja faz sentido e completando o que falta.",
    "Responda APENAS com o JSON descrito.",
  ].filter(Boolean).join("\n")
}

export async function completeReportWithAI(input: {
  examType: string
  patientInfo: string
  doctor: Pick<User, "name" | "crm">
  cid10?: string
  diagnosis?: string
  conclusion?: string
  contentHtml?: string
  templateDiagnosis?: string
  templateConclusion?: string
  dictation?: string
  extraInstruction?: string
  signal?: AbortSignal
}): Promise<ReportAICompletion> {
  const doctorCrm = input.doctor.crm ? formatCrm(input.doctor.crm) || input.doctor.crm : undefined
  const messages: ChatMessage[] = [
    { role: "system", content: REPORT_JSON_SYSTEM },
    {
      role: "user",
      content: buildReportUserPrompt({
        patientInfo: input.patientInfo,
        examType: input.examType,
        doctorName: input.doctor.name,
        doctorCrm,
        cid10: input.cid10,
        diagnosisDraft: input.diagnosis,
        conclusionDraft: input.conclusion,
        contentDraft: input.contentHtml,
        templateDiagnosis: input.templateDiagnosis,
        templateConclusion: input.templateConclusion,
        dictation: input.dictation,
        extraInstruction: input.extraInstruction,
      }),
    },
  ]

  const raw = await chatComplete(messages, {
    signal: input.signal,
    temperature: 0.3,
    maxTokens: 2500,
  })

  return parseAiReportResponse(raw, {
    diagnosis: input.diagnosis,
    conclusion: input.conclusion,
    contentHtml: input.contentHtml,
    patientInfo: input.patientInfo,
    doctorName: input.doctor.name,
    doctorCrm,
    cid10: input.cid10,
  })
}

/** @deprecated use completeReportWithAI */
export async function generateReportContentWithAI(input: {
  examType: string
  clinicalNotes: string
  patient?: Patient
  doctorName: string
  signal?: AbortSignal
}): Promise<ReportAICompletion> {
  const patientBlock = input.patient
    ? `Paciente: ${input.patient.name}, ${input.patient.dob ? `nasc. ${input.patient.dob}` : ""}`
    : "Paciente não informado"

  return completeReportWithAI({
    examType: input.examType,
    patientInfo: patientBlock,
    doctor: { name: input.doctorName },
    contentHtml: input.clinicalNotes,
    dictation: input.clinicalNotes,
    signal: input.signal,
  })
}

export async function generateReportFromVoiceTranscript(input: {
  examType: string
  transcript: string
  patientInfo: string
  doctor: Pick<User, "name" | "crm">
  cid10?: string
  diagnosis?: string
  conclusion?: string
  contentHtml?: string
  signal?: AbortSignal
}): Promise<ReportAICompletion> {
  return completeReportWithAI({
    examType: input.examType,
    patientInfo: input.patientInfo,
    doctor: input.doctor,
    cid10: input.cid10,
    diagnosis: input.diagnosis,
    conclusion: input.conclusion,
    contentHtml: input.contentHtml,
    dictation: input.transcript.trim(),
    extraInstruction:
      "Transforme a dictacao em laudo medico completo, formal e bem formatado em HTML.",
    signal: input.signal,
  })
}
