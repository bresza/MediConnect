import { ApiError, apiRequest, getApiUserId } from "./api"
import { rememberPatientLink } from "./patientLinks"
import type {
  Appointment,
  AppointmentStatus,
} from "../types"

interface ApiAppointment {
  id: string
  patient_id: string
  doctor_id: string
  scheduled_at: string
  duration_minutes?: number
  status?: string
  created_by?: string
  patients?: { id?: string; user_id?: string; full_name: string; email?: string; cpf?: string } | null
}

interface ApiDoctor {
  id: string
  full_name: string
}
interface ApiProfile {
  id: string
  full_name: string
}
interface ApiAvailableSlot {
  time?: string
  start_time?: string
  start?: string
  available?: boolean
}
interface ApiDoctorAvailability {
  doctor_id: string
  weekday: number | string
  start_time: string
  end_time: string
  slot_minutes?: number
  appointment_type?: string
  active?: boolean
}
interface ApiDoctorException {
  doctor_id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
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

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function localTime(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function normalizeWeekday(value: number | string): number {
  if (typeof value === "number") return value
  const numeric = Number(value)
  if (Number.isInteger(numeric)) return numeric
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const englishIndex = WEEKDAY_ENUM_VALUES.indexOf(normalized as (typeof WEEKDAY_ENUM_VALUES)[number])
  if (englishIndex >= 0) return englishIndex
  const ptIndex = WEEKDAY_PT_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_VALUES)[number])
  if (ptIndex >= 0) return ptIndex
  const ptDashIndex = WEEKDAY_PT_DASH_VALUES.indexOf(normalized as (typeof WEEKDAY_PT_DASH_VALUES)[number])
  return ptDashIndex >= 0 ? ptDashIndex : -1
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value: number): string {
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

function onlyDigits(value?: string): string {
  return value?.replace(/\D/g, "") ?? ""
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
}

function mergeAppointments(rows: ApiAppointment[][]): ApiAppointment[] {
  return Array.from(new Map(rows.flat().map((row) => [row.id, row])).values())
}

async function getAppointmentDoctors(): Promise<Map<string, string>> {
  const [doctors, profiles] = await Promise.all([
    apiRequest<ApiDoctor[]>("/rest/v1/doctors?select=id,full_name").catch(() => []),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=id,full_name").catch(() => []),
  ])

  return new Map([
    ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
    ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
  ])
}

function toApiDateTime(date?: string, time?: string): string | undefined {
  if (!date) return undefined
  if (!time) return date
  const parsed = new Date(`${date}T${time}:00`)
  return Number.isNaN(parsed.getTime()) ? `${date}T${time}:00Z` : parsed.toISOString()
}

function apiToAppointment(
  api: ApiAppointment,
  doctorName = ""
): Appointment {
  const dt = api.scheduled_at
    ? new Date(api.scheduled_at)
    : new Date()

  const date = localDate(dt)
  const time = localTime(dt)

  return {
    id: api.id,
    patientId: api.patient_id,
    patientName: api.patients?.full_name ?? "",
    doctorId: api.doctor_id,
    doctorName,
    date,
    time,
    duration: api.duration_minutes ?? 30,
    type: "consultation",
    status: (api.status as AppointmentStatus) ?? "scheduled",
  }
}

function appointmentToApi(
  a: Omit<Appointment, "id"> | Appointment,
  isCreate = false
): Record<string, unknown> {
  const scheduledAt = toApiDateTime(a.date, a.time)

  const payload: Record<string, unknown> = {
    patient_id: a.patientId,
    doctor_id: a.doctorId,
    scheduled_at: scheduledAt,
    duration_minutes: a.duration,
  }

  if (!isCreate) {
    payload.status = a.status ?? "confirmed"
  }

  if (isCreate) {
    const uid = getApiUserId()

    if (!uid) {
      throw new Error("Sessão inválida. Faça login novamente para criar agendamentos.")
    }

    payload.created_by = uid
  }

  return payload
}

function extractAppointment(data: unknown): ApiAppointment | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] as ApiAppointment | undefined) ?? null
  if (typeof data !== "object") return null

  const obj = data as Partial<ApiAppointment> & {
    appointment?: ApiAppointment
    data?: ApiAppointment
  }

  return obj.appointment ?? obj.data ?? (obj.id && obj.scheduled_at ? obj as ApiAppointment : null)
}

async function findCreatedAppointment(
  payload: Record<string, unknown>,
): Promise<ApiAppointment | null> {
  const patientId = typeof payload.patient_id === "string" ? payload.patient_id : ""
  const doctorId = typeof payload.doctor_id === "string" ? payload.doctor_id : ""
  const scheduledAt = typeof payload.scheduled_at === "string" ? payload.scheduled_at : ""

  if (!patientId || !doctorId || !scheduledAt) return null

  const query = new URLSearchParams({
    patient_id: `eq.${patientId}`,
    doctor_id: `eq.${doctorId}`,
    scheduled_at: `eq.${scheduledAt}`,
    select: "*",
    limit: "1",
  })

  const rows = await apiRequest<ApiAppointment[]>(`/rest/v1/appointments?${query.toString()}`)
  return rows?.[0] ?? null
}

export async function getAppointments(): Promise<Appointment[]> {
  const [apts, patients, doctors, profiles] = await Promise.all([
    apiRequest<ApiAppointment[]>(
      "/rest/v1/appointments?select=*&order=scheduled_at.desc"
    ),
    apiRequest<{ id: string; full_name: string }[]>(
      "/rest/v1/patients?select=id,full_name"
    ),
    apiRequest<ApiDoctor[]>(
      "/rest/v1/doctors?select=id,full_name"
    ),
    apiRequest<ApiProfile[]>(
      "/rest/v1/profiles?select=id,full_name"
    ),
  ])

  const patientMap = new Map(
    (patients ?? []).map((p) => [
      p.id,
      p.full_name,
    ])
  )
  const doctorMap = new Map(
    [
      ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
      ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
    ]
  )

  return (apts ?? []).map((a) => {
    const appointment = apiToAppointment(a, doctorMap.get(a.doctor_id) ?? "")
    return {
      ...appointment,
      patientName: patientMap.get(a.patient_id) ?? appointment.patientName,
    }
  })
}

export async function getPatientAppointments(patientId: string): Promise<Appointment[]> {
  if (!patientId) return []

  const [apts, doctorMap] = await Promise.all([
    apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?patient_id=eq.${encodeURIComponent(patientId)}&select=*,patients(id,full_name,email,cpf)&order=scheduled_at.asc`,
    ),
    getAppointmentDoctors(),
  ])

  return (apts ?? []).map((appointment) =>
    apiToAppointment(appointment, doctorMap.get(appointment.doctor_id) ?? ""),
  )
}

export async function getPatientAppointmentsByIdentity(identity: PatientLookup): Promise<Appointment[]> {
  const ids = uniqueValues([identity.patientId])
  const userId = identity.userId?.trim()
  const email = identity.email?.trim().toLowerCase()
  const cpf = onlyDigits(identity.cpf)
  const name = identity.name?.trim()

  const queries: Array<Promise<ApiAppointment[]>> = []

  if (ids.length > 0) {
    const filter = ids.length === 1
      ? `patient_id=eq.${encodeURIComponent(ids[0])}`
      : `patient_id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?${filter}&select=*,patients(id,full_name,email,cpf)&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (email) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf)&patients.email=eq.${encodeURIComponent(email)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (userId) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf,user_id)&patients.user_id=eq.${encodeURIComponent(userId)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (cpf) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf)&patients.cpf=eq.${encodeURIComponent(cpf)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (name) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf)&patients.full_name=ilike.*${encodeURIComponent(name)}*&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (queries.length === 0) return []

  const [rows, doctorMap] = await Promise.all([
    Promise.all(queries).then(mergeAppointments),
    getAppointmentDoctors(),
  ])

  return rows
    .map((appointment) => apiToAppointment(appointment, doctorMap.get(appointment.doctor_id) ?? ""))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

export async function createAppointment(
  data: Omit<Appointment, "id">
): Promise<Appointment> {
  const payload = appointmentToApi(data, true)
  const created = await apiRequest<ApiAppointment[] | ApiAppointment | undefined>(
    "/rest/v1/appointments",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: payload,
    }
  )

  const raw = extractAppointment(created) ?? await findCreatedAppointment(payload)
  if (!raw) throw new Error("Agendamento criado, mas a API não retornou o registro cadastrado.")

  const appointment = {
    ...apiToAppointment(
      raw,
      data.doctorName
    ),
    patientName: data.patientName,
  }
  rememberPatientLink({ patientId: data.patientId, name: data.patientName })
  return appointment
}

export async function updateAppointment(
  appointment: Appointment
): Promise<Appointment> {
  await apiRequest(
    `/rest/v1/appointments?id=eq.${appointment.id}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: appointmentToApi(appointment),
    }
  )

  rememberPatientLink({ patientId: appointment.patientId, name: appointment.patientName })
  return appointment
}

export async function deleteAppointment(
  id: string
): Promise<void> {
  await apiRequest(
    `/rest/v1/appointments?id=eq.${id}`,
    {
      method: "DELETE",
    }
  )
}

export async function getAvailableSlots(
  doctorId: string,
  date: string,
): Promise<string[]> {
  if (!doctorId || !date) return []

  try {
    async function requestSlots(path: string, body: Record<string, unknown>) {
      return apiRequest<
      | ApiAvailableSlot[]
      | string[]
      | {
          slots?: ApiAvailableSlot[] | string[]
          available_slots?: ApiAvailableSlot[] | string[]
          availableSlots?: ApiAvailableSlot[] | string[]
        }
      >(path, {
        method: "POST",
        logErrors: false,
        body,
      })
    }

    let data: Awaited<ReturnType<typeof requestSlots>>
    try {
      data = await requestSlots("/functions/v1/get-available-slots", {
        doctor_id: doctorId,
        start_date: date,
        end_date: date,
        appointment_type: "presencial",
      })
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err
      data = await requestSlots("/get-available-slots", {
        doctor_id: doctorId,
        start_date: date,
        end_date: date,
        appointment_type: "presencial",
      })
    }

    const slots = Array.isArray(data)
      ? data
      : data.slots ?? data.available_slots ?? data.availableSlots ?? []

    const normalizedSlots = slots
      .map((slot) => {
        if (typeof slot === "string") return slot
        if (slot.available === false) return null
        return slot.time ?? slot.start_time ?? slot.start ?? null
      })
      .filter((time): time is string => Boolean(time))
      .map((time) => time.slice(0, 5))
      .filter((time, index, all) => all.indexOf(time) === index)
      .sort()

    return normalizedSlots.length > 0
      ? normalizedSlots
      : getAvailableSlotsFromAvailability(doctorId, date)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 500)) {
      return getAvailableSlotsFromAvailability(doctorId, date)
    }
    throw err
  }
}

async function getAvailableSlotsFromAvailability(
  doctorId: string,
  date: string,
): Promise<string[]> {
  const day = new Date(`${date}T00:00:00`).getDay()
  const [availability, exceptions, appointments] = await Promise.all([
    apiRequest<ApiDoctorAvailability[]>(
      `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&active=eq.true&select=*`,
    ),
    apiRequest<ApiDoctorException[]>(
      `/rest/v1/doctor_exceptions?doctor_id=eq.${encodeURIComponent(doctorId)}&date=eq.${encodeURIComponent(date)}&select=*`,
    ).catch((err) => {
      if (err instanceof ApiError && err.status === 404) return []
      throw err
    }),
    apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?doctor_id=eq.${encodeURIComponent(doctorId)}&select=id,doctor_id,patient_id,scheduled_at,duration_minutes,status`,
    ),
  ])

  const busyRanges = (appointments ?? [])
    .filter((appointment) => localDate(new Date(appointment.scheduled_at)) === date)
    .filter((appointment) => appointment.status !== "cancelled")
    .map((appointment) => {
      const start = timeToMinutes(localTime(new Date(appointment.scheduled_at)))
      return {
        start,
        end: start + (appointment.duration_minutes ?? 30),
      }
    })

  const blockedRanges = (exceptions ?? []).map((exception) => ({
    start: exception.start_time ? timeToMinutes(exception.start_time) : 0,
    end: exception.end_time ? timeToMinutes(exception.end_time) : 24 * 60,
  }))

  const now = new Date()
  const today = localDate(now)
  const nowMinutes = timeToMinutes(localTime(now))

  return (availability ?? [])
    .filter((row) => normalizeWeekday(row.weekday) === day)
    .flatMap((row) => {
      const slotMinutes = row.slot_minutes ?? 30
      const start = timeToMinutes(row.start_time)
      const end = timeToMinutes(row.end_time)
      const slots: string[] = []

      for (let cursor = start; cursor + slotMinutes <= end; cursor += slotMinutes) {
        const slotEnd = cursor + slotMinutes
        const inPast = date === today && cursor <= nowMinutes
        const blocked = blockedRanges.some((range) => rangesOverlap(cursor, slotEnd, range.start, range.end))
        const occupied = busyRanges.some((range) => rangesOverlap(cursor, slotEnd, range.start, range.end))
        if (!inPast && !blocked && !occupied) slots.push(minutesToTime(cursor))
      }

      return slots
    })
    .filter((time, index, all) => all.indexOf(time) === index)
    .sort()
}
