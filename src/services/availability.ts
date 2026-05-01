import { apiRequest } from "./api"

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

interface ApiDoctorAvailability {
  id: string
  doctor_id: string
  weekday: number
  start_time: string
  end_time: string
  slot_minutes: number
  appointment_type: string
  active: boolean
}

export interface CreateDoctorAvailabilityInput {
  doctorId: string
  weekday: number
  startTime: string
  endTime: string
  slotMinutes: number
  appointmentType?: string
}

function apiToAvailability(api: ApiDoctorAvailability): DoctorAvailability {
  return {
    id: api.id,
    doctorId: api.doctor_id,
    weekday: api.weekday,
    startTime: api.start_time,
    endTime: api.end_time,
    slotMinutes: api.slot_minutes,
    appointmentType: api.appointment_type,
    active: api.active,
  }
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

export async function createDoctorAvailability(
  input: CreateDoctorAvailabilityInput,
): Promise<DoctorAvailability> {
  const created = await apiRequest<ApiDoctorAvailability[] | ApiDoctorAvailability>(
    "/rest/v1/doctor_availability",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        doctor_id: input.doctorId,
        weekday: input.weekday,
        start_time: input.startTime,
        end_time: input.endTime,
        slot_minutes: input.slotMinutes,
        appointment_type: input.appointmentType ?? "presencial",
        active: true,
      },
    },
  )

  const raw = Array.isArray(created) ? created[0] : created
  return apiToAvailability(raw)
}
