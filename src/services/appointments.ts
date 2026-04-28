import { apiRequest, getApiUserId } from "./api"
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

/*
IMPORTANTE:

Como você não tem acesso ao Supabase, o frontend NÃO deve inventar
valores para o enum appointment_type.

Agora usamos exatamente o valor vindo do backend.

Se existir appointment_type salvo no banco, ele será reutilizado.
Se for criação nova e não houver certeza do enum correto,
enviamos null para evitar erro de enum inválido.

Depois que você descobrir o valor real do enum aceito pelo backend,
basta substituir no map abaixo.
*/

const appointmentTypeMap: Record<string, string | null> = {
  consultation: null,
  evaluation: null,
  return: null,
  procedure: null,
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

  /*
  Só envia appointment_type se houver valor real conhecido.
  Isso evita erro:
  invalid input value for enum appointment_type
  */
  const mappedType =
    appointmentTypeMap[a.type] ?? null

  const payload: Record<string, unknown> = {
    patient_id: a.patientId,
    doctor_id: a.doctorId,
    scheduled_at: scheduledAt,
    duration_minutes: a.duration,
    status: a.status ?? "confirmed",
    notes: a.observations ?? null,
  }

  if (mappedType) {
    payload.appointment_type = mappedType
  }

  if (isCreate) {
    const uid = getApiUserId()

    if (uid) {
      payload.created_by = uid
    }
  }

  console.log(
    "APPOINTMENT PAYLOAD:",
    JSON.stringify(payload, null, 2)
  )

  return payload
}

export async function getAppointments(): Promise<Appointment[]> {
  const [apts, doctors] = await Promise.all([
    apiRequest<ApiAppointment[]>(
      "/rest/v1/appointments?select=*,patients(full_name)&order=scheduled_at.desc"
    ),
    apiRequest<ApiDoctor[]>(
      "/rest/v1/doctors?select=id,full_name"
    ),
  ])

  console.log("APPOINTMENTS RAW:", apts)

  const doctorMap = new Map(
    (doctors ?? []).map((d) => [
      d.id,
      d.full_name,
    ])
  )

  return (apts ?? []).map((a) =>
    apiToAppointment(
      a,
      doctorMap.get(a.doctor_id) ?? ""
    )
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

  return apiToAppointment(
    raw,
    data.doctorName
  )
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