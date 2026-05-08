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
interface ApiProfile {
  id: string
  full_name: string
}
interface ApiAvailableSlot {
  time: string
  available: boolean
}

export interface AppointmentDoctor {
  id: string
  name: string
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
): Promise<string[]> {
  if (!doctorId || !date) return []

  const data = await apiRequest<{ slots?: ApiAvailableSlot[] }>(
    "/functions/v1/get-available-slots",
    {
      method: "POST",
      body: {
        doctor_id: doctorId,
        date,
      },
    },
  )

  return (data.slots ?? [])
    .filter((slot) => slot.available)
    .map((slot) => slot.time.slice(0, 5))
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
