import type { Appointment, WaitlistEntry } from "../types"
import { chatComplete, isAIConfigured } from "./ai"
import { inferPriority, sortWaitlist, WAITLIST_COLOR_LABEL } from "./waitlist"

export interface FreedSlotContext {
  id:          string
  doctorId:    string
  doctorName:  string
  date:        string
  time:        string
  duration:    number
  type:        Appointment["type"]
  patientId?:  string
  patientName?: string
}

export interface GapSuggestion {
  entry:      WaitlistEntry
  rank:       number
  rationale:  string
  ruleScore:  number
  aiScore?:   number
  usedAi:     boolean
}

const COLOR_SCORE: Record<WaitlistEntry["priorityColor"], number> = {
  red:    100,
  yellow: 75,
  green:  50,
  blue:   25,
}


function filterCandidates(entries: WaitlistEntry[], freed: FreedSlotContext): WaitlistEntry[] {
  return sortWaitlist(entries).filter((e) => {
    if (freed.patientId && e.patientId === freed.patientId) return false
    if (freed.doctorId && e.doctorId && e.doctorId !== freed.doctorId) return false
    return true
  })
}

function ruleScoreFor(entry: WaitlistEntry, index: number): number {
  const overdueDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(entry.dueBy).getTime()) / 86_400_000),
  )
  return COLOR_SCORE[entry.priorityColor] + Math.min(overdueDays, 30) - index * 0.1
}

function buildRuleRationale(entry: WaitlistEntry): string {
  const colorLabel = WAITLIST_COLOR_LABEL[entry.priorityColor]
  const reasons = inferPriority({
    cid10: entry.cid10,
    notes: entry.clinicalNotes,
    flags: entry.flags,
  }).reasons
  const base = `Prioridade ${colorLabel} na fila SUS`
  if (reasons.length === 0) return `${base}, aguardando desde ${entry.enteredAt.slice(0, 10)}.`
  return `${base}: ${reasons.slice(0, 2).join("; ")}.`
}

export function buildRuleBasedSuggestions(
  freed: FreedSlotContext,
  entries: WaitlistEntry[],
  topN = 3,
): GapSuggestion[] {
  const candidates = filterCandidates(entries, freed).slice(0, topN)
  return candidates.map((entry, index) => ({
    entry,
    rank: index + 1,
    rationale: buildRuleRationale(entry),
    ruleScore: ruleScoreFor(entry, index),
    usedAi: false,
  }))
}

interface AiRankItem {
  waitlistEntryId: string
  rank:            number
  rationale:       string
  score?:          number
}

interface AiRankResponse {
  ranked: AiRankItem[]
}

export function parseAiRankResponse(raw: string, candidateIds: Set<string>): AiRankItem[] {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as AiRankResponse
    if (!Array.isArray(parsed.ranked)) return []
    return parsed.ranked.filter((item) => candidateIds.has(item.waitlistEntryId))
  } catch {
    return []
  }
}

function buildAiPrompt(freed: FreedSlotContext, candidates: WaitlistEntry[]): string {
  const slotLabel = `${freed.date} ${freed.time}`
  const candidateLines = candidates.map((c, i) => {
    const flags = Object.entries(c.flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ")
    return [
      `${i + 1}. id=${c.id}`,
      `   paciente=${c.patientName}`,
      `   cor=${WAITLIST_COLOR_LABEL[c.priorityColor]}`,
      `   prazo=${c.dueBy}`,
      `   fila_desde=${c.enteredAt.slice(0, 10)}`,
      c.cid10 ? `   cid10=${c.cid10}` : null,
      flags ? `   flags=${flags}` : null,
      c.clinicalNotes ? `   queixa=${c.clinicalNotes.slice(0, 120)}` : null,
    ].filter(Boolean).join("\n")
  }).join("\n\n")

  return [
    "Você é um assistente de regulação ambulatorial SUS. Ranqueie pacientes da fila para uma vaga liberada.",
    "Use APENAS os dados fornecidos. Não invente diagnósticos ou sintomas.",
    "",
    `Vaga: ${slotLabel} com ${freed.doctorName}, tipo ${freed.type}, ${freed.duration} min.`,
    "",
    "Candidatos:",
    candidateLines,
    "",
    "Responda SOMENTE com JSON válido:",
    '{"ranked":[{"waitlistEntryId":"...","rank":1,"rationale":"...","score":95}]}',
    "Inclua até 3 candidatos. rationale em português, 1-2 frases.",
  ].join("\n")
}

function mergeAiRanking(
  baseline: GapSuggestion[],
  aiItems: AiRankItem[],
): GapSuggestion[] {
  if (aiItems.length === 0) return baseline

  const byId = new Map(baseline.map((s) => [s.entry.id, s]))
  const merged: GapSuggestion[] = []

  for (const item of [...aiItems].sort((a, b) => a.rank - b.rank)) {
    const base = byId.get(item.waitlistEntryId)
    if (!base) continue
    merged.push({
      ...base,
      rank: merged.length + 1,
      rationale: item.rationale.trim() || base.rationale,
      aiScore: item.score,
      usedAi: true,
    })
    byId.delete(item.waitlistEntryId)
  }

  for (const rest of baseline) {
    if (!byId.has(rest.entry.id)) continue
    merged.push({ ...rest, rank: merged.length + 1 })
    byId.delete(rest.entry.id)
  }

  return merged.slice(0, baseline.length)
}

export async function rankWaitlistForGap(
  freed: FreedSlotContext,
  entries: WaitlistEntry[],
  topN = 3,
): Promise<GapSuggestion[]> {
  const baseline = buildRuleBasedSuggestions(freed, entries, topN)
  if (baseline.length === 0) return []

  const pool = filterCandidates(entries, freed).slice(0, 10)
  if (!isAIConfigured() || pool.length <= 1) return baseline

  try {
    const content = await chatComplete(
      [{ role: "user", content: buildAiPrompt(freed, pool) }],
      { temperature: 0.2, maxTokens: 500 },
    )
    const aiItems = parseAiRankResponse(content, new Set(pool.map((e) => e.id)))
    if (aiItems.length === 0) return baseline
    return mergeAiRanking(baseline, aiItems)
  } catch (err) {
    console.warn("[waitlist-ai] fallback para regras SUS:", err instanceof Error ? err.message : err)
    return baseline
  }
}
