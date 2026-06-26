import { REPORT_TEMPLATES, type ReportTemplate } from "../data/reportTemplates"
import { normalizeCid10 } from "./cid10"
import { fillReportTemplate, type ReportPlaceholderContext } from "./reportPlaceholders"

export const OBSERVATIONS_HEADING = "Observações"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function htmlToPlainText(html: string): string {
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

/** Busca template pelo CID (ex.: E11, E11.9 → template E11). */
export function findReportTemplateByCid(cid10: string): ReportTemplate | undefined {
  const code = normalizeCid10(cid10)
  if (!code) return undefined

  const exact = REPORT_TEMPLATES.find(
    (t) => t.cid10 && normalizeCid10(t.cid10) === code,
  )
  if (exact) return exact

  const base = code.split(".")[0]
  return REPORT_TEMPLATES.find((t) => {
    if (!t.cid10) return false
    return normalizeCid10(t.cid10).split(".")[0] === base
  })
}

const OBSERVATIONS_SECTION_RE = /<h2[^>]*>\s*Observa(?:ç|c)ões\s*<\/h2>/i

export function hasObservationsSection(html: string): boolean {
  return OBSERVATIONS_SECTION_RE.test(html)
}

/** Acrescenta dictado apenas na seção Observações. */
export function appendSpokenToObservations(existingHtml: string, spoken: string): string {
  const chunk = spoken.trim()
  if (!chunk) return existingHtml

  const paragraph = `<p>${escapeHtml(chunk)}</p>`
  const html = existingHtml.trim()

  const match = html.match(OBSERVATIONS_SECTION_RE)
  if (match?.index !== undefined) {
    const sectionStart = match.index + match[0].length
    const afterSection = html.slice(sectionStart)
    const nextH2 = afterSection.search(/<h2[^>]*>/i)
    const insertAt = nextH2 >= 0 ? sectionStart + nextH2 : html.length
    const before = html.slice(0, insertAt).trimEnd()
    const after = nextH2 >= 0 ? afterSection.slice(nextH2) : ""
    return after ? `${before}\n${paragraph}\n${after}` : `${before}\n${paragraph}`
  }

  if (!html) {
    return `<h2>${OBSERVATIONS_HEADING}</h2>\n${paragraph}`
  }

  return `${html}\n<h2>${OBSERVATIONS_HEADING}</h2>\n${paragraph}`
}

/** Extrai texto da seção Observações; se não houver seções, usa todo o conteúdo. */
export function extractObservationsText(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ""

  const match = trimmed.match(
    new RegExp(
      `${OBSERVATIONS_SECTION_RE.source}([\\s\\S]*?)(?=<h2[^>]*>|$)`,
      "i",
    ),
  )
  if (match?.[1]) return htmlToPlainText(match[1]).trim()

  if (/<h2[^>]*>/i.test(trimmed)) return ""
  return htmlToPlainText(trimmed).trim()
}

export interface TemplateSection {
  title: string
  body: string
}

export function parseTemplateSections(content: string): TemplateSection[] {
  const sections: TemplateSection[] = []
  let current: TemplateSection | null = null

  for (const line of content.split("\n")) {
    const numbered = line.match(/^\d+\.\s+(.+)/)
    if (numbered) {
      if (current) sections.push(current)
      current = { title: numbered[1].trim(), body: "" }
      continue
    }
    if (current && line.trim()) {
      current.body += (current.body ? "\n" : "") + line.trim()
    }
  }
  if (current) sections.push(current)
  return sections
}

function formatObservationParagraphs(observations: string): string {
  const lines = observations
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return "<p><em>Sem observações adicionais registradas.</em></p>"
  }
  return lines
    .map((line) => {
      const cap = line.charAt(0).toUpperCase() + line.slice(1)
      const text = /[.!?…]$/.test(cap) ? cap : `${cap}.`
      return `<p>${escapeHtml(text)}</p>`
    })
    .join("\n")
}

function plainSectionToHtml(title: string, body: string): string {
  const lines = body.split("\n").filter(Boolean)
  const listItems = lines.filter((l) => /^[-•]/.test(l.trim()))
  if (listItems.length > 0 && listItems.length === lines.length) {
    return [
      `<h2>${escapeHtml(title)}</h2>`,
      "<ul>",
      ...listItems.map((l) => `<li>${escapeHtml(l.replace(/^[-•]\s*/, ""))}</li>`),
      "</ul>",
    ].join("\n")
  }
  return `<h2>${escapeHtml(title)}</h2>\n<p>${escapeHtml(body.replace(/\n/g, " "))}</p>`
}

/** Monta corpo do laudo localmente a partir do template do CID + observações dictadas. */
export function complementReportContentFromCid(input: {
  cid10: string
  observations: string
  placeholderCtx?: ReportPlaceholderContext
}): { contentHtml: string; diagnosis: string; conclusion: string } {
  const template = findReportTemplateByCid(input.cid10)
  const observations = input.observations.trim()
  const obsHtml = formatObservationParagraphs(observations)

  if (!template) {
    const cid = normalizeCid10(input.cid10)
    return {
      contentHtml: [
        `<h2>Quadro clínico (CID ${escapeHtml(cid)})</h2>`,
        observations
          ? `<p>Com base nas observações registradas: ${escapeHtml(observations.replace(/\n/g, " "))}.</p>`
          : "<p>Quadro clínico a correlacionar com anamnese e exame físico.</p>",
        `<h2>${OBSERVATIONS_HEADING}</h2>`,
        obsHtml,
      ].join("\n"),
      diagnosis: observations
        ? observations.split("\n")[0].trim()
        : `Quadro clínico relacionado ao CID ${cid}.`,
      conclusion: "Conclusão compatível com os achados informados; seguimento conforme critério médico.",
    }
  }

  const filledContent = input.placeholderCtx
    ? fillReportTemplate(template.content, input.placeholderCtx)
    : template.content

  const sections = parseTemplateSections(filledContent)
  const contentParts: string[] = []

  for (const section of sections) {
    if (/conclus/i.test(section.title)) continue
    const title = section.title.replace(/^\d+\.\s*/, "").trim()
    contentParts.push(plainSectionToHtml(title, section.body))
  }

  contentParts.push(`<h2>${OBSERVATIONS_HEADING}</h2>\n${obsHtml}`)

  const diagnosis = input.placeholderCtx
    ? fillReportTemplate(template.diagnosis, input.placeholderCtx)
    : template.diagnosis
  const conclusion = input.placeholderCtx
    ? fillReportTemplate(template.conclusion, input.placeholderCtx)
    : template.conclusion

  return {
    contentHtml: contentParts.join("\n"),
    diagnosis,
    conclusion,
  }
}
