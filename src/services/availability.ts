import { ApiError, apiRequest } from "./api"

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
  appointment_type?: string
  active?: boolean
}

interface ApiDoctor {
  id: string
  full_name: string
  email?: string
  crm?: string
  specialty?: string
}

export interface CreateDoctorAvailabilityInput {
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType: string
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
    /weekday|enum|invalid input value/i.test(err.message)
}

function apiToAvailability(api: ApiDoctorAvailability): DoctorAvailability {
  return {
    id: api.id,
    doctorId: api.doctor_id,
    weekday: normalizeWeekday(api.weekday),
    startTime: api.start_time,
    endTime: api.end_time,
    slotMinutes: api.slot_minutes ?? 30,
    appointmentType: api.appointment_type ?? "presencial",
    active: api.active !== false,
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
  // Usamos `select=*` para nao depender de colunas opcionais (ex.: `active`) que podem nao
  // existir em projetos antigos. O filtro de `active` e aplicado no client.
  // Se a coluna `full_name` nao existir, retiramos o `order` e logamos
  // silenciosamente — a ordenacao volta para o client.
  let data: (ApiDoctor & { active?: boolean | null })[] | null = null
  try {
    data = await apiRequest<(ApiDoctor & { active?: boolean | null })[]>(
      "/rest/v1/doctors?select=*&order=full_name.asc",
      { logErrors: false },
    )
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 406)) {
      data = await apiRequest<(ApiDoctor & { active?: boolean | null })[]>(
        "/rest/v1/doctors?select=*",
        { logErrors: false },
      )
    } else {
      throw err
    }
  }

  return (data ?? [])
    .filter((doctor) => doctor.active !== false)
    .map(apiToDoctor)
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
  const basePayload = {
    doctor_id: input.doctorId,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_minutes: input.slotMinutes,
    appointment_type: input.appointmentType,
    active: true,
  }

  const candidates = weekdayApiCandidates(input.weekday)
  let created: ApiDoctorAvailability[] | ApiDoctorAvailability | undefined
  let usedWeekday: number | string = input.weekday
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      usedWeekday = candidate
      created = await apiRequest<ApiDoctorAvailability[] | ApiDoctorAvailability>(
        "/rest/v1/doctor_availability",
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: { ...basePayload, weekday: candidate },
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

  const raw = extractAvailability(created) ?? await findAvailability(input, usedWeekday)
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
