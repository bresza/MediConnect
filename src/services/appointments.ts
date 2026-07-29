import { ApiError, apiRequest, getApiUserId } from "./api"
import { getPatientByIdentity, type PatientIdentity } from "./patients"
import { fillGapFromWaitlist } from "./waitlistAutomation"
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
  active?: boolean | null
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
  appointment_type?: string
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

function localDateTimeIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0).toISOString()
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

/**
 * O enum `appointment_type` da tabela `appointments` no Supabase deste projeto
 * representa apenas a MODALIDADE do atendimento e aceita somente:
 *   - "presencial"
 *   - "telemedicina"
 * (Confirmado pela documentação RISEUP da API.)
 *
 * O "tipo de visita" do front (Consulta/Exame/Retorno/Procedimento) e um conceito
 * exclusivo de UI: nao tem coluna correspondente na API. Por isso, ao gravar,
 * enviamos a modalidade fixa "presencial" para o backend e preservamos o tipo
 * escolhido pelo usuario apenas no campo `notes` (prefixo `[Tipo: ...]`),
 * permitindo round-trip sem perda de informacao visual.
 */
const APPOINTMENT_MODALITY_DEFAULT = "presencial"

const TYPE_NOTE_PATTERN = /^\s*\[Tipo:\s*([^\]]+)\]\s*/i

function encodeTypeInNotes(type: AppointmentType, notes?: string): string | undefined {
  const stripped = (notes ?? "").replace(TYPE_NOTE_PATTERN, "").trim()
  const label = `[Tipo: ${type}]`
  if (!stripped) return label
  return `${label} ${stripped}`
}

function decodeTypeFromNotes(notes?: string | null): { type: AppointmentType; notes?: string } {
  if (!notes) return { type: "consultation", notes: undefined }
  const match = TYPE_NOTE_PATTERN.exec(notes)
  if (!match) return { type: "consultation", notes }
  const candidate = match[1].toLowerCase().trim()
  const validTypes: AppointmentType[] = ["consultation", "exam", "return", "procedure"]
  const type = (validTypes as string[]).includes(candidate)
    ? (candidate as AppointmentType)
    : "consultation"
  const rest = notes.replace(TYPE_NOTE_PATTERN, "").trim()
  return { type, notes: rest || undefined }
}

function apiToAppointment(
  api: ApiAppointment,
  doctorName = ""
): Appointment {
  const dt = api.scheduled_at
    ? new Date(api.scheduled_at)
    : new Date()

  // Mantemos data e hora no mesmo fuso (local do navegador) para evitar deslocamento
  // perto da meia-noite quando o servidor responde em UTC.
  const date = localDate(dt)
  const time = localTime(dt)

  // O backend so guarda a modalidade em `appointment_type`. O tipo de visita
  // (consulta/exame/retorno/procedimento) e recuperado do prefixo em `notes`.
  const { type: visitType, notes: cleanNotes } = decodeTypeFromNotes(api.notes)

  return {
    id: api.id,
    patientId: api.patient_id,
    patientName: api.patients?.full_name ?? "",
    doctorId: api.doctor_id,
    doctorName,
    date,
    time,
    duration: api.duration_minutes ?? 30,

    type: visitType,

    status:
      (api.status as AppointmentStatus) ??
      "scheduled",

    observations: cleanNotes,
  }
}

function appointmentToApi(
  a: Omit<Appointment, "id"> | Appointment,
  isCreate = false
): Record<string, unknown> {
  const scheduledAt =
    a.date && a.time
      ? localDateTimeIso(a.date, a.time)
      : a.date

  const payload: Record<string, unknown> = {
    patient_id: a.patientId,
    doctor_id: a.doctorId,
    scheduled_at: scheduledAt,
    duration_minutes: a.duration,
    // O enum aceita apenas "presencial" | "telemedicina". O tipo de visita
    // selecionado pelo usuario e preservado em `notes`.
    appointment_type: APPOINTMENT_MODALITY_DEFAULT,
    notes: encodeTypeInNotes(a.type, a.observations),
  }

  // Em updates, so envia status quando o frontend efetivamente informa um valor.
  // Antes a chamada forcava "confirmed" e podia ressuscitar agendamentos cancelados.
  if (!isCreate && a.status) {
    payload.status = a.status
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

// Horario comercial padrao quando nao ha disponibilidade cadastrada nem
// Edge Function disponivel: 08:00 - 18:00, slots de 30 min.
const DEFAULT_SLOT_START_MIN = 8 * 60
const DEFAULT_SLOT_END_MIN   = 18 * 60
const DEFAULT_SLOT_DURATION  = 30

function buildDefaultSlots(date: string): string[] {
  const today = localDate(new Date())
  const nowMinutes = timeToMinutes(localTime(new Date()))
  const out: string[] = []
  for (let m = DEFAULT_SLOT_START_MIN; m + DEFAULT_SLOT_DURATION <= DEFAULT_SLOT_END_MIN; m += DEFAULT_SLOT_DURATION) {
    if (date === today && m <= nowMinutes) continue
    out.push(minutesToTime(m))
  }
  return out
}

async function safeAvailabilitySlots(
  doctorId: string,
  date: string,
  appointmentType: string,
): Promise<string[]> {
  try {
    return await getAvailableSlotsFromAvailability(doctorId, date, appointmentType)
  } catch (err) {
    if (err instanceof ApiError && [400, 404, 422, 500, 501, 502, 503].includes(err.status)) {
      return []
    }
    throw err
  }
}

export interface GetAvailableSlotsOptions {
  /** Quando false, nao inventa horario comercial se nao houver grade cadastrada. */
  allowDefaultFallback?: boolean
  /**
   * Quando false, nao recalcula slots no client a partir de doctor_availability +
   * appointments. Necessario para o portal do paciente: sob JWT de paciente o
   * SELECT de appointments pode omitir consultas de terceiros (RLS), e o
   * fallback local ofereceria horarios ja ocupados.
   */
  allowLocalAvailabilityFallback?: boolean
}

/** Opcoes seguras para agendamento/reagendamento no portal do paciente. */
export const PATIENT_SLOT_OPTIONS: GetAvailableSlotsOptions = {
  allowDefaultFallback: false,
  allowLocalAvailabilityFallback: false,
}

export async function getAvailableSlots(
  doctorId: string,
  date: string,
  appointmentType = "presencial",
  options: GetAvailableSlotsOptions = {},
): Promise<string[]> {
  const {
    allowDefaultFallback = true,
    allowLocalAvailabilityFallback = true,
  } = options
  if (!doctorId || !date) return []
  if (date < localDate(new Date())) return []

  try {
    const apiSlots = await getAvailableSlotsFromApi(doctorId, date, appointmentType)
    if (apiSlots.length > 0) return apiSlots
    // Resposta vazia da edge function e autoritativa quando o fallback local
    // esta desligado (portal): dia cheio/bloqueado nao deve reabrir via RLS parcial.
    if (!allowLocalAvailabilityFallback) return []
  } catch (err) {
    if (!(err instanceof ApiError)) throw err
    const fallbackStatuses = [400, 404, 422, 500, 501, 502, 503]
    if (!fallbackStatuses.includes(err.status)) throw err
    if (!allowLocalAvailabilityFallback) return []
  }

  if (!allowLocalAvailabilityFallback) return []

  const localSlots = await safeAvailabilitySlots(doctorId, date, appointmentType)
  if (localSlots.length > 0) return localSlots

  if (!allowDefaultFallback) return []

  return buildDefaultSlots(date)
}

export async function getDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  if (!doctorId) return []

  // Nao filtramos por `active=eq.true` aqui: a coluna `active` pode nao existir
  // em projetos antigos e levaria a 400. Filtramos no client.
  const rows = await apiRequest<ApiDoctorAvailability[]>(
    `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&select=*&order=weekday.asc,start_time.asc`,
  )

  return (rows ?? []).map(apiToAvailability).filter((row) => row.weekday >= 0 && row.active)
}

async function getAvailableSlotsFromAvailability(
  doctorId: string,
  date: string,
  appointmentType = "presencial",
): Promise<string[]> {
  const today = localDate(new Date())
  if (date < today) return []

  const day = new Date(`${date}T00:00:00`).getDay()
  const [availability, exceptions, appointments] = await Promise.all([
    apiRequest<ApiDoctorAvailability[]>(
      `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&select=*`,
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
    .filter((row) => row.active !== false)
    .filter((row) => normalizeWeekday(row.weekday) === day)
    .filter((row) => !row.appointment_type || row.appointment_type === appointmentType)
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
  // Nao filtramos por `active=eq.true` no PostgREST porque a coluna `active`
  // pode nao existir em alguns projetos (causa 400). Filtramos client-side
  // tratando ausencia / null como ativo (so excluimos active === false).
  const doctors = await apiRequest<ApiDoctor[]>(
    "/rest/v1/doctors?select=id,full_name,active&order=full_name.asc",
    { logErrors: false },
  ).catch(async (err) => {
    // Caso `active` (ou `full_name`) realmente nao existam, refazemos com
    // variantes mais conservadoras. As tentativas tambem nao logam para
    // evitar ruido enquanto o schema do projeto ainda esta sendo migrado.
    if (err instanceof ApiError && (err.status === 400 || err.status === 406)) {
      try {
        return await apiRequest<ApiDoctor[]>(
          "/rest/v1/doctors?select=id,full_name&order=full_name.asc",
          { logErrors: false },
        )
      } catch (err2) {
        if (err2 instanceof ApiError && (err2.status === 400 || err2.status === 406)) {
          return apiRequest<ApiDoctor[]>(
            "/rest/v1/doctors?select=*",
            { logErrors: false },
          )
        }
        throw err2
      }
    }
    throw err
  })

  return (doctors ?? [])
    .filter((doctor) => doctor.active !== false)
    .map((doctor) => ({
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

function isFutureAppointmentDateTime(date: string, time: string): boolean {
  const dt = new Date(`${date}T${time}:00`)
  return !Number.isNaN(dt.getTime()) && dt > new Date()
}

function canPatientManageAppointment(appointment: Appointment): boolean {
  const active = appointment.status !== "cancelled" &&
    appointment.status !== "completed" &&
    appointment.status !== "absent"
  return active && isFutureAppointmentDateTime(appointment.date, appointment.time)
}

async function patchAppointmentFields(
  appointmentId: string,
  patientId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const filter = `id=eq.${encodeURIComponent(appointmentId)}&patient_id=eq.${encodeURIComponent(patientId)}`
  await apiRequest(`/rest/v1/appointments?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body,
    logErrors: false,
  })
}

function buildCancellationNotes(
  type: AppointmentType,
  existingNotes: string | undefined,
  reason: string,
): string {
  const reasonLine = `Motivo do cancelamento (paciente): ${reason.trim()}`
  const merged = [existingNotes?.trim(), reasonLine].filter(Boolean).join("\n")
  return encodeTypeInNotes(type, merged) ?? reasonLine
}

export async function createPatientAppointment(
  data: Omit<Appointment, "id">,
  identity: PatientIdentity,
): Promise<Appointment> {
  const linked = await getPatientByIdentity(identity)
  if (!linked?.id) {
    throw new Error(
      "Não encontramos seu cadastro de paciente vinculado a esta conta. " +
      "Peça à recepção para vincular seu acesso ao cadastro.",
    )
  }

  return createAppointment({
    ...data,
    patientId: linked.id,
    patientName: linked.socialName || linked.name,
    status: data.status ?? "scheduled",
  })
}

export async function cancelPatientAppointment(
  appointment: Appointment,
  identity: PatientIdentity,
  cancellationReason: string,
): Promise<Appointment> {
  const linked = await getPatientByIdentity(identity)
  if (!linked?.id) {
    throw new Error(
      "Não encontramos seu cadastro de paciente vinculado a esta conta. " +
      "Peça à recepção para vincular seu acesso ao cadastro.",
    )
  }

  if (appointment.patientId !== linked.id) {
    throw new Error("Você só pode cancelar consultas do seu próprio cadastro.")
  }

  if (!canPatientManageAppointment(appointment)) {
    throw new Error("Esta consulta não pode mais ser cancelada.")
  }

  const reason = cancellationReason.trim()
  if (!reason) {
    throw new Error("Informe o motivo do cancelamento.")
  }

  await patchAppointmentFields(appointment.id, linked.id, {
    status: "cancelled",
    notes: buildCancellationNotes(appointment.type, appointment.observations, reason),
  })

  try {
    await fillGapFromWaitlist(appointment, "patient_cancellation")
  } catch {
    // Cancelamento do paciente não deve falhar se o encaixe automático der erro.
  }

  return { ...appointment, status: "cancelled" }
}

export async function updatePatientAppointment(
  appointment: Appointment,
  identity: PatientIdentity,
): Promise<Appointment> {
  const linked = await getPatientByIdentity(identity)
  if (!linked?.id) {
    throw new Error(
      "Não encontramos seu cadastro de paciente vinculado a esta conta. " +
      "Peça à recepção para vincular seu acesso ao cadastro.",
    )
  }

  if (appointment.patientId !== linked.id) {
    throw new Error("Você só pode alterar consultas do seu próprio cadastro.")
  }

  if (!canPatientManageAppointment(appointment)) {
    throw new Error("Esta consulta não pode mais ser reagendada.")
  }

  await patchAppointmentFields(appointment.id, linked.id, {
    scheduled_at: localDateTimeIso(appointment.date, appointment.time),
    duration_minutes: appointment.duration,
    status: appointment.status ?? "scheduled",
  })

  return appointment
}
