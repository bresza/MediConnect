import { chatComplete, type ChatMessage } from "./ai"
import type { Patient } from "../types"

export interface ReportAICompletion {
  diagnosis: string
  conclusion: string
  contentHtml: string
}

function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return null
}

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

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Você é um médico redator de laudos. Responda APENAS com JSON válido no formato: " +
        '{"diagnosis":"...","conclusion":"...","contentHtml":"<p>...</p>"}. ' +
        "contentHtml deve usar tags simples: p, h2, ul, li, strong. Português do Brasil.",
    },
    {
      role: "user",
      content:
        `Gere laudo do exame "${input.examType}".\n${patientBlock}\nMédico: ${input.doctorName}\n` +
        `Informações clínicas: ${input.clinicalNotes}`,
    },
  ]

  const raw = await chatComplete(messages, { signal: input.signal, maxTokens: 1200 })
  const jsonStr = extractJsonBlock(raw)
  if (!jsonStr) throw new Error("A IA não retornou JSON estruturado para o laudo.")

  const parsed = JSON.parse(jsonStr) as Partial<ReportAICompletion>
  return {
    diagnosis: String(parsed.diagnosis ?? "").trim(),
    conclusion: String(parsed.conclusion ?? "").trim(),
    contentHtml: String(parsed.contentHtml ?? "").trim() || `<p>${input.clinicalNotes}</p>`,
  }
}
