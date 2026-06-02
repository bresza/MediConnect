import { ApiError, apiRequest, getApiUserId } from "./api"
import {
  isEdgeAutomationEnabled,
  isEndpointUnavailable,
  markEndpointUnavailableFromError,
} from "./schemaSafe"
import {
  exceptionBlockedMinuteRange,
  getDoctorExceptions,
  normalizeWeekday,
} from "./availability"
import { fetchDoctorNameMap, fetchPatientNameMap } from "./lookups"
import { getPatientByIdentity, type PatientIdentity } from "./patients"
import { fillGapFromWaitlist } from "./waitlistAutomation"
import {
  handleAppointmentUpdateNotifications,
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
} from "./appointmentNotifications"
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
interface ApiDoctorAvailability {
  doctor_id: string
  weekday: number | string
  start_time: string
  end_time: string
  slot_minutes?: number
  appointment_type?: string
  active?: boolean
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

/** Conflito de horário com agendamentos já carregados no client (ex.: assistente IA). */
export function isAppointmentSlotBusy(
  appointments: Appointment[],
  doctorId: string,
  date: string,
  time: string,
  durationMinutes = 30,
): boolean {
  if (!doctorId || !date || !time) return false
  const start = timeToMinutes(time.slice(0, 5))
  const end = start + durationMinutes
  return appointments.some((appointment) => {
    if (appointment.doctorId !== doctorId || appointment.date !== date) return false
    if (appointment.status === "cancelled") return false
    const otherStart = timeToMinutes(appointment.time.slice(0, 5))
    const otherEnd = otherStart + (appointment.duration ?? 30)
    return rangesOverlap(start, end, otherStart, otherEnd)
  })
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

  if (isCreate) {
    // Contrato da API (POST /appointments): somente campos documentados.
    // Nao enviamos `appointment_type`/`notes` aqui para evitar 400 por campos extras.
    const payload: Record<string, unknown> = {
      patient_id: a.patientId,
      doctor_id: a.doctorId,
      scheduled_at: scheduledAt,
      duration_minutes: a.duration,
    }

    if (
      a.status === "requested" ||
      a.status === "confirmed" ||
      a.status === "completed" ||
      a.status === "cancelled"
    ) {
      payload.status = a.status
    }

    const uid = getApiUserId()
    if (!uid) {
      throw new Error("Não foi possível identificar o usuário autenticado para criar o agendamento (campo obrigatório `created_by`).")
    }
    payload.created_by = uid

    return payload
  }

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

  return payload
}

export interface GetAppointmentsOptions {
  doctorId?: string
  patientId?: string
  status?: "requested" | "confirmed" | "completed" | "cancelled"
  from?: string
  to?: string
}

export async function getAppointments(options: GetAppointmentsOptions = {}): Promise<Appointment[]> {
  const params = new URLSearchParams()
  if (options.doctorId) params.set("doctor_id", options.doctorId)
  if (options.patientId) params.set("patient_id", options.patientId)
  if (options.status) params.set("status", options.status)

  const [apts, patientMap, doctorMap] = await Promise.all([
    apiRequest<ApiAppointment[]>(`/rest/v1/appointments?${params.toString()}`),
    fetchPatientNameMap(),
    fetchDoctorNameMap(),
  ])

  const mapped = (apts ?? []).map((a) => {
    const appointment = apiToAppointment(a, doctorMap.get(a.doctor_id) ?? "")
    return {
      ...appointment,
      patientName: patientMap.get(a.patient_id) ?? appointment.patientName,
    }
  })

  // Compatibilidade temporaria: alguns fluxos ainda enviam range no client.
  // Mantemos o filtro local para nao acoplar a listagem a parametros nao documentados.
  return mapped
    .filter((appointment) => !options.from || appointment.date >= options.from)
    .filter((appointment) => !options.to || appointment.date <= options.to)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
}

async function fetchAppointmentById(id: string): Promise<Appointment | null> {
  if (!id) return null
  try {
    const rows = await apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { logErrors: false },
    )
    const raw = rows?.[0]
    if (!raw) return null
    const doctors = await getAppointmentDoctors()
    const doctorMap = new Map(doctors.map((doctor) => [doctor.id, doctor.name]))
    return apiToAppointment(raw, doctorMap.get(raw.doctor_id) ?? "")
  } catch {
    return null
  }
}

function appointmentConflictMessage(err: unknown): Error | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null
  return new Error(
    "Este horário já está ocupado para o médico. Escolha outro horário ou outra data.",
  )
}

export async function createAppointment(
  data: Omit<Appointment, "id">
): Promise<Appointment> {
  let created: ApiAppointment[] | ApiAppointment
  try {
    created = await apiRequest<ApiAppointment[]>(
      "/rest/v1/appointments",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: appointmentToApi(data, true),
      },
    )
  } catch (err) {
    const conflict = appointmentConflictMessage(err)
    if (conflict) throw conflict
    throw err
  }

  const raw = Array.isArray(created)
    ? created[0]
    : (created as ApiAppointment)

  const appointment = {
    ...apiToAppointment(
      raw,
      data.doctorName
    ),
    patientName: data.patientName,
  }

  notifyAppointmentBooked(appointment)
  return appointment
}

export async function updateAppointment(
  appointment: Appointment
): Promise<Appointment> {
  const previous = await fetchAppointmentById(appointment.id)

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

  handleAppointmentUpdateNotifications(previous, appointment)
  return appointment
}

export async function deleteAppointment(
  id: string
): Promise<void> {
  const previous = await fetchAppointmentById(id)

  await apiRequest(
    `/rest/v1/appointments?id=eq.${id}`,
    {
      method: "DELETE",
    }
  )

  if (previous && previous.status !== "cancelled") {
    notifyAppointmentCancelled(previous, "Consulta removida da agenda.")
  }
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
    if (err instanceof ApiError && [0, 400, 404, 422, 500, 501, 502, 503].includes(err.status)) {
      return []
    }
    throw err
  }
}

export interface GetAvailableSlotsOptions {
  /** Quando false, nao inventa horario comercial se nao houver grade cadastrada. */
  allowDefaultFallback?: boolean
}

const EDGE_AVAILABLE_SLOTS_KEY = "edge:get-available-slots"

export async function getAvailableSlots(
  doctorId: string,
  date: string,
  appointmentType = "presencial",
  options: GetAvailableSlotsOptions = {},
): Promise<string[]> {
  const { allowDefaultFallback = true } = options
  if (!doctorId || !date) return []
  if (date < localDate(new Date())) return []

  const localSlots = await safeAvailabilitySlots(doctorId, date, appointmentType)
  if (localSlots.length > 0) return localSlots

  if (
    isEdgeAutomationEnabled() &&
    !isEndpointUnavailable(EDGE_AVAILABLE_SLOTS_KEY)
  ) {
    try {
      const apiSlots = await getAvailableSlotsFromApi(doctorId, date, appointmentType)
      if (apiSlots.length > 0) return apiSlots
    } catch (err) {
      markEndpointUnavailableFromError(EDGE_AVAILABLE_SLOTS_KEY, err)
      if (!(err instanceof ApiError)) throw err
      const recoverable = [0, 400, 404, 422, 500, 501, 502, 503]
      if (!recoverable.includes(err.status)) throw err
    }
  }

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

  let availabilityRows: ApiDoctorAvailability[] = []
  try {
    availabilityRows = await apiRequest<ApiDoctorAvailability[]>(
      `/rest/v1/doctor_availability?doctor_id=eq.${encodeURIComponent(doctorId)}&select=*&order=start_time.asc`,
      { logErrors: false },
    ) ?? []
  } catch {
    return []
  }

  const [exceptions, appointments] = await Promise.all([
    getDoctorExceptions({ doctorId, date, kind: "bloqueio" }).catch(() => []),
    apiRequest<ApiAppointment[]>(
      `/rest/v1/appointments?doctor_id=eq.${encodeURIComponent(doctorId)}&select=id,doctor_id,patient_id,scheduled_at,duration_minutes,status`,
      { logErrors: false },
    ).catch(() => []),
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

  const blockedRanges = exceptions.map(exceptionBlockedMinuteRange)

  const now = new Date()
  const nowMinutes = timeToMinutes(localTime(now))

  return availabilityRows
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
  const data = await apiRequest<ApiAvailableSlotsResponse>("/functions/v1/get-available-slots", {
    method: "POST",
    body: {
      doctor_id: doctorId,
      start_date: date,
      end_date: date,
      appointment_type: appointmentType,
    },
    logErrors: false,
  })

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
    "/rest/v1/doctors?select=id,full_name&active=eq.true&order=full_name.asc",
  )

  return (doctors ?? [])
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

  const cancelled = { ...appointment, status: "cancelled" as const }
  notifyAppointmentCancelled(cancelled, reason)
  return cancelled
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

  const previous = await fetchAppointmentById(appointment.id)

  await patchAppointmentFields(appointment.id, linked.id, {
    scheduled_at: localDateTimeIso(appointment.date, appointment.time),
    duration_minutes: appointment.duration,
    status: appointment.status ?? "scheduled",
  })

  notifyAppointmentRescheduled(appointment, previous)
  return appointment
}
