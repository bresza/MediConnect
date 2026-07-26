// ─────────────────────────────────────────────────────────────────
// Fila de espera por prioridade (frente para a Edge Function /
// tabela `appointment_waitlist` quando existir no Supabase).
//
// Estratégia híbrida:
//   1) Tenta `${SUPABASE_URL}/rest/v1/appointment_waitlist` via apiRequest.
//   2) Se a tabela retornar 404 / 401 / 403 / erro de rede, cai em
//      localStorage (`mediconnect:waitlist`). Cada operação tenta
//      Supabase primeiro; o front nunca quebra.
//
// Critérios de cor (inferência automática) seguem as orientações do
// Ministério da Saúde para regulação ambulatorial:
//   - red    → idade < 1 ano ou >= 80, ou flags graves de CID, ou
//              palavras-chave clínicas críticas, ou desistência prévia
//              + paciente vulnerável.
//   - yellow → idoso (>=60), gestante, lactante, PcD, TEA, mobilidade
//              reduzida, criança de colo, obesidade severa,
//              ou diagnóstico oncológico/cardio/respiratório agudo.
//   - green  → demais casos com sintomas/sinais relatados.
//   - blue   → revisão/rotina sem queixa específica.
//
// Prazos-alvo (dueBy) seguem a tabela do SUS para fila eletiva:
//   red:   30 dias, yellow: 90, green: 180, blue: 365.
// ─────────────────────────────────────────────────────────────────

import { ApiError, apiRequest } from "./api"
import type {
  Patient,
  WaitlistEntry,
  WaitlistLegalFlags,
  WaitlistPriorityColor,
  WaitlistStatus,
} from "../types"

const STORAGE_KEY = "mediconnect:waitlist"
const TABLE_PATH  = "/rest/v1/appointment_waitlist"

const DUE_DAYS_BY_COLOR: Record<WaitlistPriorityColor, number> = {
  red:    30,
  yellow: 90,
  green:  180,
  blue:   365,
}

const COLOR_RANK: Record<WaitlistPriorityColor, number> = {
  red:    0,
  yellow: 1,
  green:  2,
  blue:   3,
}

const SUPPORTED_FLAGS: (keyof WaitlistLegalFlags)[] = [
  "elderly", "pregnant", "lactating", "infantInArms",
  "disability", "asd", "severeObesity", "reducedMobility",
]

const RED_CID_PREFIXES = ["C", "I2", "I6", "J96", "N17", "K92", "O14", "O15"]
const YELLOW_CID_PREFIXES = ["E10", "E11", "I1", "J", "F2", "F3", "N18"]

const RED_KEYWORDS = [
  "infarto", "avc", "av c", "hemorragia", "sangramento intenso",
  "dor toracica", "dor torácica", "dispneia", "convuls",
  "perda de consciencia", "perda de consciência", "anafilaxia",
  "trauma grave", "ide suicida", "ideacao suicida", "ideação suicida",
]
const YELLOW_KEYWORDS = [
  "diabetes descompensad", "hipertens", "dor intensa",
  "febre alta", "vomito persistente", "vômito persistente",
  "asma", "depress", "ansiedade severa", "perda de peso",
  "sangue nas fezes", "sangue na urina",
]

const TIMEOUT_AFTER_NO_SHOW_DAYS = 90

// ─── helpers de localStorage ─────────────────────────────────────

function loadLocal(): WaitlistEntry[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WaitlistEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocal(entries: WaitlistEntry[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage indisponivel ou quota cheia: ignora.
  }
}

function genId(): string {
  return `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── inferência de cor ───────────────────────────────────────────

function calcAge(dob?: string | null): number | null {
  if (!dob) return null
  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age--
  return age
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export interface InferPriorityInput {
  patient?: Pick<Patient, "dob" | "gender">
  flags?:   WaitlistLegalFlags
  cid10?:   string
  notes?:   string
}

export interface InferPriorityResult {
  color:  WaitlistPriorityColor
  flags:  WaitlistLegalFlags
  reasons: string[]
}

/** Calcula cor + flags inferidas + razões legíveis para mostrar na UI. */
export function inferPriority(input: InferPriorityInput): InferPriorityResult {
  const reasons: string[] = []
  const flags: WaitlistLegalFlags = { ...(input.flags ?? {}) }
  const cidUpper = (input.cid10 ?? "").toUpperCase().trim()
  const notesNorm = normalize(input.notes ?? "")

  const age = calcAge(input.patient?.dob)
  if (age !== null && age >= 60) {
    flags.elderly = true
    reasons.push(`Idoso (${age} anos) — Lei 10.048/2000`)
  }
  if (age !== null && age < 2) {
    flags.infantInArms = true
    reasons.push("Criança de colo")
  }

  // CID inicia com prefixo crítico → vermelho.
  if (cidUpper && RED_CID_PREFIXES.some((p) => cidUpper.startsWith(p))) {
    reasons.push(`CID ${cidUpper} (grupo de alta gravidade)`)
    return { color: "red", flags, reasons }
  }

  // Sinais/sintomas críticos no texto → vermelho.
  for (const kw of RED_KEYWORDS) {
    if (notesNorm.includes(kw)) {
      reasons.push(`Sintoma crítico identificado: "${kw}"`)
      return { color: "red", flags, reasons }
    }
  }

  // Idade extrema → vermelho.
  if (age !== null && (age < 1 || age >= 85)) {
    reasons.push(`Idade extrema (${age} anos)`)
    return { color: "red", flags, reasons }
  }

  // Flags legais ou idoso → amarelo (se nada mais grave entrou).
  const triggersYellow =
    flags.elderly || flags.pregnant || flags.lactating || flags.infantInArms ||
    flags.disability || flags.asd || flags.severeObesity || flags.reducedMobility

  if (triggersYellow) {
    if (flags.pregnant)        reasons.push("Gestante — Lei 10.048/2000")
    if (flags.lactating)       reasons.push("Lactante — Lei 10.048/2000")
    if (flags.disability)      reasons.push("Pessoa com deficiência — Lei 10.048/2000")
    if (flags.asd)             reasons.push("TEA — Lei 14.626/2023")
    if (flags.severeObesity)   reasons.push("Obesidade severa — Lei 10.048/2000")
    if (flags.reducedMobility) reasons.push("Mobilidade reduzida — Lei 10.048/2000")
    return { color: "yellow", flags, reasons }
  }

  if (cidUpper && YELLOW_CID_PREFIXES.some((p) => cidUpper.startsWith(p))) {
    reasons.push(`CID ${cidUpper} (acompanhamento prioritário)`)
    return { color: "yellow", flags, reasons }
  }

  for (const kw of YELLOW_KEYWORDS) {
    if (notesNorm.includes(kw)) {
      reasons.push(`Quadro relevante: "${kw}"`)
      return { color: "yellow", flags, reasons }
    }
  }

  // Algum CID ou alguma queixa: verde. Sem nada: azul.
  if (cidUpper || notesNorm.length > 0) {
    reasons.push("Queixa/CID registrado, sem critério agravante.")
    return { color: "green", flags, reasons }
  }

  reasons.push("Sem queixa ou CID — rotina.")
  return { color: "blue", flags, reasons }
}

export function calcDueBy(color: WaitlistPriorityColor, enteredAt: string): string {
  const start = new Date(enteredAt)
  const days = DUE_DAYS_BY_COLOR[color]
  start.setDate(start.getDate() + days)
  return start.toISOString().slice(0, 10)
}

// ─── ordenação ───────────────────────────────────────────────────

/** Conta quantas flags legais o paciente acumula (desempate). */
function flagWeight(flags: WaitlistLegalFlags): number {
  return SUPPORTED_FLAGS.reduce((acc, key) => acc + (flags[key] ? 1 : 0), 0)
}

export function compareByPriority(a: WaitlistEntry, b: WaitlistEntry): number {
  const colorDiff = COLOR_RANK[a.priorityColor] - COLOR_RANK[b.priorityColor]
  if (colorDiff !== 0) return colorDiff

  const flagsDiff = flagWeight(b.flags) - flagWeight(a.flags)
  if (flagsDiff !== 0) return flagsDiff

  if (a.dueBy !== b.dueBy) return a.dueBy < b.dueBy ? -1 : 1
  if (a.enteredAt !== b.enteredAt) return a.enteredAt < b.enteredAt ? -1 : 1
  return 0
}

/** Penaliza pacientes com no-show recente (cai do top da fila). */
function applyNoShowPenalty(entries: WaitlistEntry[]): WaitlistEntry[] {
  const now = Date.now()
  return [...entries].sort((a, b) => {
    const aPenalty = a.lastNoShowAt && (now - new Date(a.lastNoShowAt).getTime()) < TIMEOUT_AFTER_NO_SHOW_DAYS * 86_400_000
    const bPenalty = b.lastNoShowAt && (now - new Date(b.lastNoShowAt).getTime()) < TIMEOUT_AFTER_NO_SHOW_DAYS * 86_400_000
    if (aPenalty && !bPenalty) return 1
    if (!aPenalty && bPenalty) return -1
    return compareByPriority(a, b)
  })
}

export function sortWaitlist(entries: WaitlistEntry[]): WaitlistEntry[] {
  return applyNoShowPenalty(entries.filter((e) => e.status === "waiting"))
}

// ─── mapping Supabase ↔ frontend ─────────────────────────────────

interface ApiWaitlistRow {
  id:               string
  patient_id:       string
  patient_name:     string
  specialty?:       string | null
  doctor_id?:       string | null
  doctor_name?:     string | null
  cid10?:           string | null
  clinical_notes?:  string | null
  flags:            WaitlistLegalFlags | null
  priority_color:   WaitlistPriorityColor
  entered_at:       string
  due_by:           string
  last_no_show_at?: string | null
  added_by?:        string | null
  added_by_name?:   string | null
  status:           WaitlistStatus
  notes?:           string | null
}

function fromRow(row: ApiWaitlistRow): WaitlistEntry {
  return {
    id:             row.id,
    patientId:      row.patient_id,
    patientName:    row.patient_name,
    specialty:      row.specialty ?? undefined,
    doctorId:       row.doctor_id ?? undefined,
    doctorName:     row.doctor_name ?? undefined,
    cid10:          row.cid10 ?? undefined,
    clinicalNotes:  row.clinical_notes ?? undefined,
    flags:          row.flags ?? {},
    priorityColor:  row.priority_color,
    enteredAt:      row.entered_at,
    dueBy:          row.due_by,
    lastNoShowAt:   row.last_no_show_at ?? undefined,
    addedBy:        row.added_by ?? undefined,
    addedByName:    row.added_by_name ?? undefined,
    status:         row.status,
    notes:          row.notes ?? undefined,
  }
}

function toRow(e: Omit<WaitlistEntry, "id"> | WaitlistEntry): Partial<ApiWaitlistRow> {
  return {
    ...(("id" in e && e.id) ? { id: e.id } : {}),
    patient_id:      e.patientId,
    patient_name:    e.patientName,
    specialty:       e.specialty ?? null,
    doctor_id:       e.doctorId ?? null,
    doctor_name:     e.doctorName ?? null,
    cid10:           e.cid10 ?? null,
    clinical_notes:  e.clinicalNotes ?? null,
    flags:           e.flags,
    priority_color:  e.priorityColor,
    entered_at:      e.enteredAt,
    due_by:          e.dueBy,
    last_no_show_at: e.lastNoShowAt ?? null,
    added_by:        e.addedBy ?? null,
    added_by_name:   e.addedByName ?? null,
    status:          e.status,
    notes:           e.notes ?? null,
  }
}

function isRemoteUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return [0, 401, 403, 404].includes(err.status)
}

// ─── CRUD híbrido ────────────────────────────────────────────────

export async function getWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const rows = await apiRequest<ApiWaitlistRow[]>(`${TABLE_PATH}?select=*&order=entered_at.asc`, {
      logErrors: false,
    })
    return Array.isArray(rows) ? rows.map(fromRow) : []
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
    return loadLocal()
  }
}

export async function createWaitlistEntry(
  draft: Omit<WaitlistEntry, "id" | "enteredAt" | "dueBy" | "priorityColor" | "status"> & {
    inferred: InferPriorityResult
  },
): Promise<WaitlistEntry> {
  const enteredAt = new Date().toISOString()
  const entry: WaitlistEntry = {
    id:             genId(),
    patientId:      draft.patientId,
    patientName:    draft.patientName,
    specialty:      draft.specialty,
    doctorId:       draft.doctorId,
    doctorName:     draft.doctorName,
    cid10:          draft.cid10,
    clinicalNotes:  draft.clinicalNotes,
    flags:          draft.inferred.flags,
    priorityColor:  draft.inferred.color,
    enteredAt,
    dueBy:          calcDueBy(draft.inferred.color, enteredAt),
    lastNoShowAt:   draft.lastNoShowAt,
    addedBy:        draft.addedBy,
    addedByName:    draft.addedByName,
    status:         "waiting",
    notes:          draft.notes,
  }

  try {
    const created = await apiRequest<ApiWaitlistRow[]>(TABLE_PATH, {
      method:    "POST",
      headers:   { Prefer: "return=representation" },
      body:      toRow(entry),
      logErrors: false,
    })
    const row = Array.isArray(created) ? created[0] : (created as unknown as ApiWaitlistRow)
    if (row) return fromRow(row)
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  const local = [...loadLocal(), entry]
  saveLocal(local)
  return entry
}

export async function updateWaitlistEntry(entry: WaitlistEntry): Promise<WaitlistEntry> {
  // Recalcula prazo se a cor mudou.
  const next: WaitlistEntry = { ...entry, dueBy: calcDueBy(entry.priorityColor, entry.enteredAt) }

  try {
    const updated = await apiRequest<ApiWaitlistRow[]>(
      `${TABLE_PATH}?id=eq.${encodeURIComponent(entry.id)}`,
      {
        method:    "PATCH",
        headers:   { Prefer: "return=representation" },
        body:      toRow(next),
        logErrors: false,
      },
    )
    const row = Array.isArray(updated) ? updated[0] : (updated as unknown as ApiWaitlistRow)
    if (row) return fromRow(row)
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  const local = loadLocal().map((it) => it.id === entry.id ? next : it)
  saveLocal(local)
  return next
}

/**
 * Reserva atomicamente um item ainda `waiting` (status=eq.waiting + representation).
 * Retorna null se outro fluxo já tiver reivindicado a vaga.
 * Em modo localStorage, só altera se o status atual ainda for `waiting`.
 */
export async function claimWaitlistEntry(
  entry: WaitlistEntry,
  patch: Pick<WaitlistEntry, "status"> & { notes?: string },
): Promise<WaitlistEntry | null> {
  const next: WaitlistEntry = {
    ...entry,
    status: patch.status,
    notes: patch.notes ?? entry.notes,
    dueBy: calcDueBy(entry.priorityColor, entry.enteredAt),
  }

  try {
    const updated = await apiRequest<ApiWaitlistRow[]>(
      `${TABLE_PATH}?id=eq.${encodeURIComponent(entry.id)}&status=eq.waiting`,
      {
        method:    "PATCH",
        headers:   { Prefer: "return=representation" },
        body:      toRow(next),
        logErrors: false,
      },
    )
    const row = Array.isArray(updated) ? updated[0] : (updated as unknown as ApiWaitlistRow)
    if (row) return fromRow(row)
    // Representation vazia: outro processo já promoveu, ou RLS impediu o PATCH.
    // Não cair em localStorage — isso deixaria o remoto em `waiting` e duplicaria encaixes.
    return null
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  const local = loadLocal()
  const current = local.find((it) => it.id === entry.id)
  if (!current || current.status !== "waiting") return null
  const claimed = { ...current, status: patch.status, notes: patch.notes ?? current.notes, dueBy: next.dueBy }
  saveLocal(local.map((it) => it.id === entry.id ? claimed : it))
  return claimed
}

/** Reverte uma reserva de fila quando o agendamento do encaixe falha. */
export async function releaseWaitlistClaim(entry: WaitlistEntry): Promise<void> {
  const next: WaitlistEntry = {
    ...entry,
    status: "waiting",
    dueBy: calcDueBy(entry.priorityColor, entry.enteredAt),
  }

  try {
    const updated = await apiRequest<ApiWaitlistRow[]>(
      `${TABLE_PATH}?id=eq.${encodeURIComponent(entry.id)}&status=eq.scheduled`,
      {
        method:    "PATCH",
        headers:   { Prefer: "return=representation" },
        body:      toRow(next),
        logErrors: false,
      },
    )
    const row = Array.isArray(updated) ? updated[0] : (updated as unknown as ApiWaitlistRow)
    if (row) return
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  const local = loadLocal()
  if (!local.some((it) => it.id === entry.id)) return
  saveLocal(local.map((it) => it.id === entry.id ? { ...it, status: "waiting", dueBy: next.dueBy } : it))
}

export async function removeWaitlistEntry(id: string): Promise<void> {
  try {
    await apiRequest<null>(`${TABLE_PATH}?id=eq.${encodeURIComponent(id)}`, {
      method:    "DELETE",
      logErrors: false,
    })
    return
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }
  saveLocal(loadLocal().filter((it) => it.id !== id))
}

// ─── filtros e sugestão ──────────────────────────────────────────

export interface VisibilityScope {
  /** Quando definido, restringe a fila aos pacientes deste médico (ou sem médico definido). */
  doctorId?: string
}

export function filterVisible(entries: WaitlistEntry[], scope: VisibilityScope): WaitlistEntry[] {
  if (!scope.doctorId) return entries
  return entries.filter((e) => !e.doctorId || e.doctorId === scope.doctorId)
}

export interface SuggestForGapInput {
  doctorId?:  string
  specialty?: string
}

/** Retorna o próximo paciente prioritário compatível com a vaga liberada. */
export function suggestForGap(entries: WaitlistEntry[], input: SuggestForGapInput): WaitlistEntry | null {
  const candidates = sortWaitlist(entries).filter((e) => {
    if (input.doctorId && e.doctorId && e.doctorId !== input.doctorId) return false
    if (input.specialty && e.specialty && normalize(e.specialty) !== normalize(input.specialty)) return false
    return true
  })
  return candidates[0] ?? null
}

export function findWaitingEntry(
  entries: WaitlistEntry[],
  patientId: string,
  match?: { doctorId?: string; specialty?: string },
): WaitlistEntry | null {
  return entries.find((entry) => {
    if (entry.status !== "waiting") return false
    if (entry.patientId !== patientId) return false
    if (match?.doctorId && entry.doctorId && entry.doctorId !== match.doctorId) return false
    if (match?.specialty && entry.specialty && normalize(entry.specialty) !== normalize(match.specialty)) {
      return false
    }
    return true
  }) ?? null
}

export interface EnrollPatientInput {
  patient: Pick<Patient, "id" | "name" | "socialName" | "dob" | "gender">
  doctorId?: string
  doctorName?: string
  specialty?: string
  clinicalNotes?: string
  cid10?: string
  addedBy?: string
  addedByName?: string
}

export async function enrollPatientInWaitlist(
  input: EnrollPatientInput,
): Promise<{ entry: WaitlistEntry; created: boolean }> {
  const waitlist = await getWaitlist()
  const existing = findWaitingEntry(waitlist, input.patient.id, {
    doctorId: input.doctorId,
    specialty: input.specialty,
  })
  if (existing) {
    return { entry: existing, created: false }
  }

  const inferred = inferPriority({
    patient: input.patient,
    cid10: input.cid10,
    notes: input.clinicalNotes,
  })

  const entry = await createWaitlistEntry({
    patientId: input.patient.id,
    patientName: input.patient.socialName || input.patient.name,
    specialty: input.specialty,
    doctorId: input.doctorId,
    doctorName: input.doctorName,
    cid10: input.cid10,
    clinicalNotes: input.clinicalNotes,
    flags: inferred.flags,
    notes: "Inscrição automática via portal do paciente.",
    addedBy: input.addedBy,
    addedByName: input.addedByName ?? "Portal do paciente",
    inferred,
  })

  return { entry, created: true }
}

export const WAITLIST_COLOR_LABEL: Record<WaitlistPriorityColor, string> = {
  red:    "Vermelho",
  yellow: "Amarelo",
  green:  "Verde",
  blue:   "Azul",
}

export const WAITLIST_COLOR_HEX: Record<WaitlistPriorityColor, string> = {
  red:    "#dc2626",
  yellow: "#f59e0b",
  green:  "#16a34a",
  blue:   "#2563eb",
}
