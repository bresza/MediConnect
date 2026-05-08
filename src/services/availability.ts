import { ApiError, apiRequest, getApiUserId } from "./api"

export interface DoctorAvailability {
  id: string
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType: string
  active: boolean
}

export interface DoctorException {
  id: string
  doctorId: string
  date: string
  kind: "bloqueio"
  startTime?: string
  endTime?: string
  reason?: string
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
  slot_minutes: number
  appointment_type: string
  active: boolean
}

const WEEKDAY_ENUM_VALUES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const
const WEEKDAY_PT_VALUES = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
] as const
const WEEKDAY_PT_DASH_VALUES = [
  "domingo",
  "segunda-feira",
  "terca-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sabado",
] as const

function normalizeWeekday(value: number | string): number {
  if (typeof value === "number") return value
  const numeric = Number(value)
  if (Number.isInteger(numeric)) return numeric
  const normalized = value.toLowerCase()
  const englishIndex = WEEKDAY_ENUM_VALUES.indexOf(normalized as (typeof WEEKDAY_ENUM_VALUES)[number])
  if (englishIndex >= 0) return englishIndex
  const ptIndex = WEEKDAY_PT_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_VALUES)[number])
  if (ptIndex >= 0) return ptIndex
  const ptDashIndex = WEEKDAY_PT_DASH_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_DASH_VALUES)[number])
  return ptDashIndex >= 0 ? ptDashIndex : 0
}

function weekdayApiCandidates(weekday: number): Array<number | string> {
  return [
    weekday,
    WEEKDAY_ENUM_VALUES[weekday] ?? WEEKDAY_ENUM_VALUES[0],
    WEEKDAY_PT_VALUES[weekday] ?? WEEKDAY_PT_VALUES[0],
    WEEKDAY_PT_DASH_VALUES[weekday] ?? WEEKDAY_PT_DASH_VALUES[0],
  ]
}

function isWeekdayEnumError(err: unknown): boolean {
  return err instanceof ApiError &&
    err.status === 400 &&
    /enum\s+"?weekday"?|enum weekday|invalid input value/i.test(err.message)
}

interface ApiDoctorException {
  id: string
  doctor_id: string
  date?: string
  kind?: string
  start_time?: string
  end_time?: string
  reason?: string
}

interface ApiDoctor {
  id: string
  full_name: string
  email?: string
  crm?: string
  specialty?: string
  active?: boolean
}

export interface CreateDoctorAvailabilityInput {
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType?: string
}

export interface CreateDoctorExceptionInput {
  doctorId: string
  date: string
  startTime?: string
  endTime?: string
  reason?: string
}

function apiToAvailability(api: ApiDoctorAvailability): DoctorAvailability {
  return {
    id: api.id,
    doctorId: api.doctor_id,
    weekday: normalizeWeekday(api.weekday),
    startTime: api.start_time,
    endTime: api.end_time,
    slotMinutes: api.slot_minutes,
    appointmentType: api.appointment_type,
    active: api.active,
  }
}

function apiToException(api: ApiDoctorException): DoctorException {
  return {
    id: api.id,
    doctorId: api.doctor_id,
    date: api.date ?? "",
    kind: "bloqueio",
    startTime: api.start_time,
    endTime: api.end_time,
    reason: api.reason,
  }
}

function apiToDoctor(api: ApiDoctor): AvailabilityDoctor {
  return {
    id: api.id,
    name: api.full_name,
    email: api.email,
    crm: api.crm,
    specialty: api.specialty,
  }
}

function extractException(data: unknown): ApiDoctorException | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] as ApiDoctorException | undefined) ?? null
  if (typeof data !== "object") return null

  const obj = data as Partial<ApiDoctorException> & {
    exception?: ApiDoctorException
    data?: ApiDoctorException
  }

  return obj.exception ?? obj.data ?? (obj.id && obj.doctor_id ? obj as ApiDoctorException : null)
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

async function findCreatedAvailability(
  input: CreateDoctorAvailabilityInput,
  apiWeekday: number | string = input.weekday,
): Promise<ApiDoctorAvailability | null> {
  const params = new URLSearchParams({
    doctor_id: `eq.${input.doctorId}`,
    weekday: `eq.${apiWeekday}`,
    start_time: `eq.${input.startTime}`,
    end_time: `eq.${input.endTime}`,
    appointment_type: `eq.${input.appointmentType ?? "presencial"}`,
    order: "created_at.desc",
    limit: "1",
  })
  const rows = await apiRequest<ApiDoctorAvailability[]>(`/rest/v1/doctor_availability?${params.toString()}`)
  return rows?.[0] ?? null
}

async function findCreatedException(
  input: CreateDoctorExceptionInput,
): Promise<ApiDoctorException | null> {
  const params = new URLSearchParams({
    doctor_id: `eq.${input.doctorId}`,
    date: `eq.${input.date}`,
    kind: "eq.bloqueio",
    order: "created_at.desc",
    limit: "1",
  })
  const rows = await apiRequest<ApiDoctorException[]>(`/rest/v1/doctor_exceptions?${params.toString()}`)
  return rows?.[0] ?? null
}

export async function getDoctorAvailability(
  doctorId: string,
  weekday?: number,
): Promise<DoctorAvailability[]> {
  const params = new URLSearchParams({
    doctor_id: `eq.${doctorId}`,
    active: "eq.true",
    order: "weekday.asc,start_time.asc",
  })

  if (weekday !== undefined) params.set("weekday", `eq.${weekday}`)

  const data = await apiRequest<ApiDoctorAvailability[]>(
    `/rest/v1/doctor_availability?${params.toString()}`,
  )

  return (data ?? []).map(apiToAvailability)
}

export async function getAvailabilityDoctors(): Promise<AvailabilityDoctor[]> {
  const data = await apiRequest<ApiDoctor[]>(
    "/rest/v1/doctors?select=id,full_name,email,crm,specialty,active&active=eq.true&order=full_name.asc",
  )
  return (data ?? []).map(apiToDoctor)
}

export async function createDoctorAvailability(
  input: CreateDoctorAvailabilityInput,
): Promise<DoctorAvailability> {
  const payload = {
    doctor_id: input.doctorId,
    weekday: input.weekday as number | string,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_minutes: input.slotMinutes,
    appointment_type: input.appointmentType ?? "presencial",
    active: true,
  }

  const candidates = weekdayApiCandidates(input.weekday)
  let apiWeekday: number | string = candidates[0]
  let created: ApiDoctorAvailability[] | ApiDoctorAvailability | undefined
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      apiWeekday = candidate
      created = await apiRequest<ApiDoctorAvailability[] | ApiDoctorAvailability | undefined>(
        "/rest/v1/doctor_availability",
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: { ...payload, weekday: candidate },
          logErrors: candidate === candidates[0],
        },
      )
      lastError = undefined
      break
    } catch (err) {
      lastError = err
      if (!isWeekdayEnumError(err)) throw err
    }
  }
  if (lastError) throw lastError

  const raw = extractAvailability(created) ?? await findCreatedAvailability(input, apiWeekday)
  if (!raw) throw new Error("Disponibilidade criada, mas a API não retornou o registro cadastrado.")
  return apiToAvailability(raw)
}

export async function updateDoctorAvailability(
  availability: DoctorAvailability,
): Promise<DoctorAvailability> {
  await apiRequest(`/rest/v1/doctor_availability?id=eq.${availability.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      start_time: availability.startTime,
      end_time: availability.endTime,
      slot_minutes: availability.slotMinutes,
      appointment_type: availability.appointmentType,
      active: availability.active,
    },
  })
  return availability
}

export async function deleteDoctorAvailability(id: string): Promise<void> {
  await apiRequest(`/rest/v1/doctor_availability?id=eq.${id}`, { method: "DELETE" })
}

export async function getDoctorExceptions(
  doctorId: string,
): Promise<DoctorException[]> {
  if (!doctorId) return []
  const params = new URLSearchParams({
    doctor_id: `eq.${doctorId}`,
    order: "date.asc,start_time.asc",
  })

  const data = await apiRequest<ApiDoctorException[]>(
    `/rest/v1/doctor_exceptions?${params.toString()}`,
  )

  return (data ?? []).map(apiToException)
}

export async function createDoctorException(
  input: CreateDoctorExceptionInput,
): Promise<DoctorException> {
  const uid = getApiUserId()
  if (!uid) {
    throw new Error("Sessão inválida. Faça login novamente para criar exceções.")
  }

  const created = await apiRequest<ApiDoctorException[] | ApiDoctorException>(
    "/rest/v1/doctor_exceptions",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        doctor_id: input.doctorId,
        date: input.date,
        kind: "bloqueio",
        start_time: input.startTime || null,
        end_time: input.endTime || null,
        reason: input.reason || undefined,
        created_by: uid,
      },
    },
  )

  const raw = extractException(created) ?? await findCreatedException(input)
  if (!raw) throw new Error("Exceção criada, mas a API não retornou o registro cadastrado.")
  return apiToException(raw)
}
