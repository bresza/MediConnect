import { ApiError, apiRequest, getApiUserId } from "./api"
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
} from "../types"

interface ApiAppointment {
  id: string
  patient_id: string
  doctor_id: string
  scheduled_at: string
  duration_minutes?: number
  appointment_type?: string
  status?: string
  notes?: string
  created_by?: string
  patients?: { full_name: string } | null
}

interface ApiDoctor {
  id: string
  full_name: string
}
interface ApiProfile {
  id: string
  full_name: string
}
interface ApiDoctorAvailability {
  doctor_id: string
  weekday: number | string
  start_time: string
  end_time: string
  slot_minutes?: number
  active?: boolean
}
interface ApiDoctorException {
  doctor_id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
}
interface ApiAvailableSlot {
  time?: string
  start_time?: string
  start?: string
  scheduled_at?: string
}
type ApiAvailableSlotsResponse =
  | string[]
  | ApiAvailableSlot[]
  | {
      slots?: Array<string | ApiAvailableSlot>
      data?: Array<string | ApiAvailableSlot> | { slots?: Array<string | ApiAvailableSlot> }
    }

export interface AppointmentDoctor {
  id: string
  name: string
}

export interface DoctorAvailability {
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
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

function apiToAvailability(api: ApiDoctorAvailability): DoctorAvailability {
  return {
    doctorId: api.doctor_id,
    weekday: normalizeWeekday(api.weekday),
    startTime: api.start_time,
    endTime: api.end_time,
    slotMinutes: api.slot_minutes ?? 30,
    active: api.active !== false,
  }
}

function apiToAppointment(
  api: ApiAppointment,
  doctorName = ""
): Appointment {
  const dt = api.scheduled_at
    ? new Date(api.scheduled_at)
    : new Date()

  const date = dt.toISOString().slice(0, 10)
  const time = dt.toTimeString().slice(0, 5)

  return {
    id: api.id,
    patientId: api.patient_id,
    patientName: api.patients?.full_name ?? "",
    doctorId: api.doctor_id,
    doctorName,
    date,
    time,
    duration: api.duration_minutes ?? 30,

    /*
    Aqui mantemos compatibilidade com o front.
    Se vier algo desconhecido do backend,
    usamos consultation como fallback visual.
    */
    type:
      (api.appointment_type as AppointmentType) ??
      "consultation",

    status:
      (api.status as AppointmentStatus) ??
      "scheduled",

    observations: api.notes,
  }
}

function appointmentToApi(
  a: Omit<Appointment, "id"> | Appointment,
  isCreate = false
): Record<string, unknown> {
  const scheduledAt =
    a.date && a.time
      ? `${a.date}T${a.time}:00`
      : a.date

  const payload: Record<string, unknown> = {
    patient_id: a.patientId,
    doctor_id: a.doctorId,
    scheduled_at: scheduledAt,
    duration_minutes: a.duration,
    appointment_type: a.type,
  }

  if (!isCreate) {
    payload.status = a.status ?? "confirmed"
  }

  if (isCreate) {
    const uid = getApiUserId()

    if (uid) {
      payload.created_by = uid
    }
  }

  return payload
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

  return (apts ?? []).map((a) =>
    {
      const appointment = apiToAppointment(
        a,
        doctorMap.get(a.doctor_id) ?? ""
      )
      return {
        ...appointment,
        patientName: patientMap.get(a.patient_id) ?? appointment.patientName,
      }
    }
  )
}

export async function createAppointment(
  data: Omit<Appointment, "id">
): Promise<Appointment> {
  const created = await apiRequest<ApiAppointment[]>(
    "/rest/v1/appointments",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: appointmentToApi(data, true),
    }
  )

  const raw = Array.isArray(created)
    ? created[0]
    : (created as ApiAppointment)

  return {
    ...apiToAppointment(
      raw,
      data.doctorName
    ),
    patientName: data.patientName,
  }
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
  appointmentType = "presencial",
): Promise<string[]> {
  if (!doctorId || !date) return []
  if (date < localDate(new Date())) return []

  try {
    return await getAvailableSlotsFromApi(doctorId, date, appointmentType)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return getAvailableSlotsFromAvailability(doctorId, date)
}

export async function getDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  if (!doctorId) return []

  const rows = await apiRequest<ApiDoctorAvailability[]>(
    `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&active=eq.true&select=*&order=weekday.asc,start_time.asc`,
  )

  return (rows ?? []).map(apiToAvailability).filter((row) => row.weekday >= 0 && row.active)
}

async function getAvailableSlotsFromAvailability(
  doctorId: string,
  date: string,
): Promise<string[]> {
  const today = localDate(new Date())
  if (date < today) return []

  const day = new Date(`${date}T00:00:00`).getDay()
  const [availability, exceptions, appointments] = await Promise.all([
    apiRequest<ApiDoctorAvailability[]>(
      `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&active=eq.true&select=*`,
    ),
    apiRequest<ApiDoctorException[]>(
      `/rest/v1/doctor_exceptions?doctor_id=eq.${encodeURIComponent(doctorId)}&date=eq.${encodeURIComponent(date)}&select=*`,
    ).catch(() => []),
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

function slotToTime(slot: string | ApiAvailableSlot): string | null {
  const raw = typeof slot === "string"
    ? slot
    : slot.time ?? slot.start_time ?? slot.start ?? slot.scheduled_at ?? ""
  if (!raw) return null
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5)

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return localTime(parsed)
}

function extractSlots(data: ApiAvailableSlotsResponse | undefined): Array<string | ApiAvailableSlot> {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.slots)) return data.slots
  if (Array.isArray(data.data)) return data.data
  if (data.data && typeof data.data === "object" && Array.isArray(data.data.slots)) return data.data.slots
  return []
}

async function getAvailableSlotsFromApi(
  doctorId: string,
  date: string,
  appointmentType: string,
): Promise<string[]> {
  async function request(path: string) {
    return apiRequest<ApiAvailableSlotsResponse>(path, {
      method: "POST",
      body: {
        doctor_id: doctorId,
        start_date: date,
        end_date: date,
        appointment_type: appointmentType,
      },
      logErrors: false,
    })
  }

  let data: ApiAvailableSlotsResponse | undefined
  try {
    data = await request("/functions/v1/get-available-slots")
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
    data = await request("/get-available-slots")
  }

  const today = localDate(new Date())
  const nowMinutes = timeToMinutes(localTime(new Date()))

  return extractSlots(data)
    .map(slotToTime)
    .filter((time): time is string => Boolean(time))
    .filter((time) => date !== today || timeToMinutes(time) > nowMinutes)
    .filter((time, index, all) => all.indexOf(time) === index)
    .sort()
}

export async function getAppointmentDoctors(): Promise<AppointmentDoctor[]> {
  const doctors = await apiRequest<ApiDoctor[]>(
    "/rest/v1/doctors?select=id,full_name&active=eq.true&order=full_name.asc"
  )

  return (doctors ?? []).map((doctor) => ({
    id: doctor.id,
    name: doctor.full_name,
  }))
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

function compactValues(values: Array<string | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
}

function mergeAppointments(rows: ApiAppointment[][]): ApiAppointment[] {
  return Array.from(new Map(rows.flat().map((row) => [row.id, row])).values())
}

export async function getPatientAppointmentsByIdentity(identity: PatientLookup): Promise<Appointment[]> {
  const queries: Array<Promise<ApiAppointment[]>> = []
  const patientIds = compactValues([identity.patientId])
  const email = identity.email?.trim().toLowerCase()
  const cpf = identity.cpf?.replace(/\D/g, "")
  const userId = identity.userId?.trim()

  if (patientIds.length > 0) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?patient_id=eq.${encodeURIComponent(patientIds[0])}&select=*,patients(id,full_name,email,cpf,user_id)&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }
  if (email) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf,user_id)&patients.email=eq.${encodeURIComponent(email)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }
  if (cpf) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf,user_id)&patients.cpf=eq.${encodeURIComponent(cpf)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }
  if (userId) {
    queries.push(apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?select=*,patients!inner(id,full_name,email,cpf,user_id)&patients.user_id=eq.${encodeURIComponent(userId)}&order=scheduled_at.asc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (queries.length === 0) return []

  const [rows, doctors] = await Promise.all([
    Promise.all(queries).then(mergeAppointments),
    getAppointmentDoctors(),
  ])
  const doctorMap = new Map(doctors.map((doctor) => [doctor.id, doctor.name]))

  return rows
    .map((appointment) => apiToAppointment(appointment, doctorMap.get(appointment.doctor_id) ?? ""))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}
