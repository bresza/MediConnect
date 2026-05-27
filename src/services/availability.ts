import { apiRequest, getApiUserId } from "./api"
import { formatSpecialtyLabel } from "../utils"

export interface DoctorAvailability {
  id: string
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType: "presencial" | "telemedicina"
  active: boolean
}

export interface AvailabilityDoctor {
  id: string
  name: string
  email?: string
  crm?: string
  specialty?: string
}

interface ApiDoctorAvailability {
  id: string
  doctor_id: string
  weekday: number | string
  start_time: string
  end_time: string
  slot_minutes?: number
  appointment_type?: "presencial" | "telemedicina"
  active?: boolean
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

interface ApiDoctor {
  id: string
  full_name: string
  crm?: string
  crm_uf?: string
  specialty?: string
}

export interface CreateDoctorAvailabilityInput {
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType: "presencial" | "telemedicina"
}

export type DoctorExceptionKind = "bloqueio" | "disponibilidade_extra"

export interface DoctorException {
  id: string
  doctorId: string
  date: string
  kind: DoctorExceptionKind
  startTime: string | null
  endTime: string | null
  reason: string | null
  createdAt?: string
  createdBy?: string
}

export interface ListDoctorExceptionsFilters {
  doctorId?: string
  date?: string
  kind?: DoctorExceptionKind
}

export interface CreateDoctorExceptionInput {
  doctorId: string
  date: string
  kind: DoctorExceptionKind
  startTime?: string | null
  endTime?: string | null
  reason?: string | null
  createdBy?: string
}

interface ApiDoctorException {
  id: string
  doctor_id: string
  date: string
  kind: string
  start_time?: string | null
  end_time?: string | null
  reason?: string | null
  created_at?: string
  created_by?: string
}

/** Campos permitidos no PATCH /rest/v1/doctor_availability?id=eq.<uuid> */
export interface UpdateDoctorAvailabilityPatch {
  startTime?: string
  endTime?: string
  slotMinutes?: number
  appointmentType?: "presencial" | "telemedicina"
  active?: boolean
}

const VALID_APPOINTMENT_TYPES = new Set(["presencial", "telemedicina"])
const HH_MM_REGEX = /^\d{2}:\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_EXCEPTION_KINDS = new Set<DoctorExceptionKind>(["bloqueio", "disponibilidade_extra"])

export const DOCTOR_EXCEPTION_KIND_LABELS: Record<DoctorExceptionKind, string> = {
  bloqueio: "Bloqueio",
  disponibilidade_extra: "Disponibilidade extra",
}

const WEEKDAY_PT_VALUES = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const
const WEEKDAY_PT_DASH_VALUES = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"] as const

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizeWeekday(value: number | string): number {
  if (typeof value === "number") return value
  const numeric = Number(value)
  if (Number.isInteger(numeric)) return numeric

  const normalized = normalizeText(value)
  const ptIndex = WEEKDAY_PT_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_VALUES)[number])
  if (ptIndex >= 0) return ptIndex

  const ptDashIndex = WEEKDAY_PT_DASH_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_DASH_VALUES)[number])
  return ptDashIndex >= 0 ? ptDashIndex : 0
}

function apiToException(api: ApiDoctorException): DoctorException {
  const kind = VALID_EXCEPTION_KINDS.has(api.kind as DoctorExceptionKind)
    ? (api.kind as DoctorExceptionKind)
    : "bloqueio"

  return {
    id: api.id,
    doctorId: api.doctor_id,
    date: api.date,
    kind,
    startTime: api.start_time ? formatTimeForApi(api.start_time) : null,
    endTime: api.end_time ? formatTimeForApi(api.end_time) : null,
    reason: api.reason ?? null,
    createdAt: api.created_at,
    createdBy: api.created_by,
  }
}

function validateExceptionFilters(filters: ListDoctorExceptionsFilters): void {
  if (filters.kind !== undefined && !VALID_EXCEPTION_KINDS.has(filters.kind)) {
    throw new Error("kind deve ser bloqueio ou disponibilidade_extra.")
  }
  if (filters.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    throw new Error("date deve estar no formato YYYY-MM-DD.")
  }
}

function validateCreateExceptionInput(input: CreateDoctorExceptionInput): void {
  if (!input.doctorId) throw new Error("doctor_id é obrigatório.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("date deve estar no formato YYYY-MM-DD.")
  }
  if (!VALID_EXCEPTION_KINDS.has(input.kind)) {
    throw new Error("kind deve ser bloqueio ou disponibilidade_extra.")
  }
  if (input.startTime !== undefined && input.startTime !== null && !/^\d{2}:\d{2}/.test(input.startTime)) {
    throw new Error("start_time deve estar no formato HH:mm ou null.")
  }
  if (input.endTime !== undefined && input.endTime !== null && !/^\d{2}:\d{2}/.test(input.endTime)) {
    throw new Error("end_time deve estar no formato HH:mm ou null.")
  }
  const start = input.startTime ? formatTimeForApi(input.startTime) : null
  const end = input.endTime ? formatTimeForApi(input.endTime) : null
  if ((start && !end) || (!start && end)) {
    throw new Error("start_time e end_time devem ser ambos preenchidos ou ambos null.")
  }
  if (start && end && start >= end) {
    throw new Error("start_time deve ser menor que end_time.")
  }
}

function buildDoctorExceptionsParams(filters: ListDoctorExceptionsFilters): URLSearchParams {
  const params = new URLSearchParams({
    select: "*",
    order: "date.asc,start_time.asc",
  })
  if (filters.doctorId) params.set("doctor_id", `eq.${filters.doctorId}`)
  if (filters.date) params.set("date", `eq.${filters.date}`)
  if (filters.kind) params.set("kind", `eq.${filters.kind}`)
  return params
}

/** Intervalo em minutos usado para bloquear slots (null = dia inteiro). */
export function exceptionBlockedMinuteRange(
  exception: Pick<DoctorException, "startTime" | "endTime">,
): { start: number; end: number } {
  return {
    start: exception.startTime ? timeToMinutes(exception.startTime) : 0,
    end: exception.endTime ? timeToMinutes(exception.endTime) : 24 * 60,
  }
}

export function formatDoctorExceptionSchedule(exception: DoctorException): string {
  if (!exception.startTime && !exception.endTime) return "Dia inteiro"
  if (exception.startTime && exception.endTime) {
    return `${formatTimeForApi(exception.startTime)} - ${formatTimeForApi(exception.endTime)}`
  }
  if (exception.startTime) return `A partir de ${formatTimeForApi(exception.startTime)}`
  if (exception.endTime) return `Até ${formatTimeForApi(exception.endTime)}`
  return "Dia inteiro"
}

export async function getDoctorExceptions(
  filters: ListDoctorExceptionsFilters = {},
): Promise<DoctorException[]> {
  validateExceptionFilters(filters)
  const params = buildDoctorExceptionsParams(filters)
  const data = await apiRequest<ApiDoctorException[]>(
    `/rest/v1/doctor_exceptions?${params.toString()}`,
  )
  return (data ?? []).map(apiToException)
}

async function findException(input: CreateDoctorExceptionInput): Promise<ApiDoctorException | null> {
  const params = new URLSearchParams({
    doctor_id: `eq.${input.doctorId}`,
    date: `eq.${input.date}`,
    kind: `eq.${input.kind}`,
    order: "created_at.desc",
    limit: "1",
  })
  if (input.startTime) params.set("start_time", `eq.${formatTimeForApi(input.startTime)}`)
  if (input.endTime) params.set("end_time", `eq.${formatTimeForApi(input.endTime)}`)

  const data = await apiRequest<ApiDoctorException[]>(`/rest/v1/doctor_exceptions?${params.toString()}`)
  return data?.[0] ?? null
}

export async function createDoctorException(input: CreateDoctorExceptionInput): Promise<DoctorException> {
  validateCreateExceptionInput(input)

  const createdBy = input.createdBy ?? getApiUserId()
  if (!createdBy) {
    throw new Error("created_by é obrigatório para criar exceção de agenda.")
  }

  const payload = {
    doctor_id: input.doctorId,
    date: input.date,
    kind: input.kind,
    start_time: input.startTime ? formatTimeForApi(input.startTime) : null,
    end_time: input.endTime ? formatTimeForApi(input.endTime) : null,
    reason: input.reason?.trim() || null,
    created_by: createdBy,
  }

  const created = await apiRequest<ApiDoctorException[] | ApiDoctorException>(
    "/rest/v1/doctor_exceptions",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: payload,
    },
  )

  const raw = Array.isArray(created)
    ? (created[0] ?? null)
    : (created ?? null)
  const resolved = raw?.id ? raw : await findException(input)
  if (!resolved) throw new Error("Exceção criada, mas a API não retornou o registro.")
  return apiToException(resolved)
}

function apiToAvailability(api: ApiDoctorAvailability): DoctorAvailability {
  const appointmentType =
    api.appointment_type && VALID_APPOINTMENT_TYPES.has(api.appointment_type)
      ? api.appointment_type
      : "presencial"

  return {
    id: api.id,
    doctorId: api.doctor_id,
    weekday: normalizeWeekday(api.weekday),
    startTime: api.start_time,
    endTime: api.end_time,
    slotMinutes: api.slot_minutes ?? 30,
    appointmentType,
    active: api.active !== false,
  }
}

function formatTimeForApi(value: string): string {
  return value.slice(0, 5)
}

function validateUpdatePatch(patch: UpdateDoctorAvailabilityPatch): void {
  const hasField =
    patch.startTime !== undefined ||
    patch.endTime !== undefined ||
    patch.slotMinutes !== undefined ||
    patch.appointmentType !== undefined ||
    patch.active !== undefined

  if (!hasField) {
    throw new Error("Informe ao menos um campo para atualizar a disponibilidade.")
  }

  if (patch.startTime !== undefined && !HH_MM_REGEX.test(formatTimeForApi(patch.startTime))) {
    throw new Error("start_time deve estar no formato HH:mm.")
  }
  if (patch.endTime !== undefined && !HH_MM_REGEX.test(formatTimeForApi(patch.endTime))) {
    throw new Error("end_time deve estar no formato HH:mm.")
  }
  if (
    patch.startTime !== undefined &&
    patch.endTime !== undefined &&
    formatTimeForApi(patch.startTime) >= formatTimeForApi(patch.endTime)
  ) {
    throw new Error("start_time deve ser menor que end_time.")
  }
  if (
    patch.slotMinutes !== undefined &&
    (!Number.isInteger(patch.slotMinutes) || patch.slotMinutes < 15 || patch.slotMinutes > 120)
  ) {
    throw new Error("slot_minutes deve ser um inteiro entre 15 e 120.")
  }
  if (
    patch.appointmentType !== undefined &&
    !VALID_APPOINTMENT_TYPES.has(patch.appointmentType)
  ) {
    throw new Error("appointment_type deve ser presencial ou telemedicina.")
  }
}

function patchToApiBody(patch: UpdateDoctorAvailabilityPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.startTime !== undefined) body.start_time = formatTimeForApi(patch.startTime)
  if (patch.endTime !== undefined) body.end_time = formatTimeForApi(patch.endTime)
  if (patch.slotMinutes !== undefined) body.slot_minutes = patch.slotMinutes
  if (patch.appointmentType !== undefined) body.appointment_type = patch.appointmentType
  if (patch.active !== undefined) body.active = patch.active
  return body
}

function validateCreateInput(input: CreateDoctorAvailabilityInput): void {
  if (!input.doctorId) throw new Error("doctor_id é obrigatório.")
  if (!UUID_REGEX.test(input.doctorId)) {
    throw new Error("doctor_id deve ser um UUID válido.")
  }
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    throw new Error("weekday deve ser um inteiro entre 0 e 6.")
  }
  const start = formatTimeForApi(input.startTime)
  const end = formatTimeForApi(input.endTime)
  if (!HH_MM_REGEX.test(start) || !HH_MM_REGEX.test(end)) {
    throw new Error("start_time e end_time devem estar no formato HH:mm.")
  }
  if (start >= end) {
    throw new Error("start_time deve ser menor que end_time.")
  }
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes < 15 || input.slotMinutes > 120) {
    throw new Error("slot_minutes deve ser um inteiro entre 15 e 120.")
  }
  if (!VALID_APPOINTMENT_TYPES.has(input.appointmentType)) {
    throw new Error("appointment_type deve ser presencial ou telemedicina.")
  }
}

function apiToDoctor(api: ApiDoctor): AvailabilityDoctor {
  const crmValue = api.crm
    ? (api.crm_uf ? `${api.crm}-${api.crm_uf}` : api.crm)
    : undefined
  return {
    id: api.id,
    name: api.full_name,
    crm: crmValue,
    specialty: api.specialty ? formatSpecialtyLabel(api.specialty) : undefined,
  }
}

function extractAvailability(data: unknown): ApiDoctorAvailability | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] as ApiDoctorAvailability | undefined) ?? null
  if (typeof data !== "object") return null

  const obj = data as Partial<ApiDoctorAvailability> & {
    availability?: ApiDoctorAvailability
    data?: ApiDoctorAvailability
  }

  return obj.availability ?? obj.data ?? (obj.id && obj.doctor_id ? obj as ApiDoctorAvailability : null)
}

async function findAvailability(
  input: CreateDoctorAvailabilityInput,
  weekday: number | string,
): Promise<ApiDoctorAvailability | null> {
  const params = new URLSearchParams({
    doctor_id: `eq.${input.doctorId}`,
    weekday: `eq.${weekday}`,
    start_time: `eq.${input.startTime}`,
    end_time: `eq.${input.endTime}`,
    appointment_type: `eq.${input.appointmentType}`,
    order: "created_at.desc",
    limit: "1",
  })

  const rows = await apiRequest<ApiDoctorAvailability[]>(`/rest/v1/doctor_availability?${params.toString()}`)
  return rows?.[0] ?? null
}

export async function getAvailabilityDoctors(): Promise<AvailabilityDoctor[]> {
  const data = await apiRequest<ApiDoctor[]>(
    "/rest/v1/doctors?select=id,full_name,crm,crm_uf,specialty&active=eq.true&order=full_name.asc",
  )
  return (data ?? []).map(apiToDoctor)
}

export async function getBookableDoctors(): Promise<AvailabilityDoctor[]> {
  const doctors = await getAvailabilityDoctors()
  if (doctors.length === 0) return []

  let rows: { doctor_id: string; active?: boolean | null }[] = []
  try {
    rows = await apiRequest<{ doctor_id: string; active?: boolean | null }[]>(
      "/rest/v1/doctor_availability?select=doctor_id,active&active=eq.true",
      { logErrors: false },
    )
  } catch {
    return doctors
  }

  const withSchedule = new Set(
    (rows ?? [])
      .filter((row) => row.active !== false)
      .map((row) => row.doctor_id),
  )
  return doctors.filter((doctor) => withSchedule.has(doctor.id))
}

const WEEKDAY_LABELS_PT = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
]

export function weekdayFromDate(date: string): number {
  return new Date(`${date}T12:00:00`).getDay()
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

export function isDateOnDoctorSchedule(date: string, rows: DoctorAvailability[]): boolean {
  if (!date) return false
  const day = weekdayFromDate(date)
  return rows.some((row) => row.active && row.weekday === day)
}

export function slotDurationForDateTime(
  date: string,
  time: string,
  rows: DoctorAvailability[],
): number {
  const day = weekdayFromDate(date)
  const minutes = timeToMinutes(time)
  const match = rows.find((row) =>
    row.active &&
    row.weekday === day &&
    minutes >= timeToMinutes(row.startTime) &&
    minutes < timeToMinutes(row.endTime),
  )
  return match?.slotMinutes ?? 30
}

export function summarizeDoctorWeekdays(rows: DoctorAvailability[]): string {
  const days = [...new Set(rows.filter((row) => row.active).map((row) => row.weekday))].sort()
  if (days.length === 0) return "Sem horários cadastrados na agenda médica."
  return days.map((day) => WEEKDAY_LABELS_PT[day] ?? `dia ${day}`).join(", ")
}

export async function getDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  if (!doctorId) return []

  const params = new URLSearchParams({
    doctor_id: `eq.${doctorId}`,
    select: "*",
    order: "weekday.asc,start_time.asc",
  })

  const data = await apiRequest<ApiDoctorAvailability[]>(`/rest/v1/doctor_availability?${params.toString()}`)
  return (data ?? []).map(apiToAvailability)
}

export async function createDoctorAvailability(
  input: CreateDoctorAvailabilityInput,
): Promise<DoctorAvailability> {
  validateCreateInput(input)

  const basePayload = {
    doctor_id: input.doctorId,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_minutes: input.slotMinutes,
    appointment_type: input.appointmentType,
    active: true,
  }

  const created = await apiRequest<ApiDoctorAvailability[] | ApiDoctorAvailability>(
    "/rest/v1/doctor_availability",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { ...basePayload, weekday: input.weekday },
    },
  )

  const raw = extractAvailability(created) ?? await findAvailability(input, input.weekday)
  if (!raw) throw new Error("Disponibilidade criada, mas a API não retornou o registro cadastrado.")
  return apiToAvailability(raw)
}

export async function updateDoctorAvailability(
  id: string,
  patch: UpdateDoctorAvailabilityPatch,
): Promise<void> {
  if (!id) throw new Error("id é obrigatório para atualizar disponibilidade.")
  validateUpdatePatch(patch)

  await apiRequest(
    `/rest/v1/doctor_availability?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: patchToApiBody(patch),
    },
  )
}

/** Atualiza todos os campos editáveis de uma linha (mesmo contrato do PATCH). */
export async function updateDoctorAvailabilityRow(
  availability: DoctorAvailability,
): Promise<DoctorAvailability> {
  await updateDoctorAvailability(availability.id, {
    startTime: availability.startTime,
    endTime: availability.endTime,
    slotMinutes: availability.slotMinutes,
    appointmentType: availability.appointmentType as "presencial" | "telemedicina",
    active: availability.active,
  })
  return availability
}

export async function deleteDoctorAvailability(id: string): Promise<void> {
  if (!id) throw new Error("id é obrigatório para excluir disponibilidade.")
  await apiRequest(`/rest/v1/doctor_availability?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" })
}
