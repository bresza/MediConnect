import { ApiError, apiRequest } from "./api"
import type { Appointment, AppointmentType } from "../types"
import type { GapFillTrigger } from "./waitlistAutomation"

const STORAGE_KEY = "mediconnect:freed-slots"
const TABLE_PATH  = "/rest/v1/freed_appointment_slots"

export type FreedSlotStatus = "pending" | "filled" | "dismissed"

export interface FreedAppointmentSlot {
  id:             string
  appointmentId:  string
  patientId:      string
  patientName:    string
  doctorId:       string
  doctorName:     string
  date:           string
  time:           string
  duration:       number
  type:           AppointmentType
  trigger:        GapFillTrigger
  status:         FreedSlotStatus
  freedAt:        string
  filledAt?:      string
  filledBy?:      string
}

export type FreedSlotInput = Pick<
  Appointment,
  "id" | "patientId" | "patientName" | "doctorId" | "doctorName" | "date" | "time" | "duration" | "type"
>

interface ApiFreedSlotRow {
  id:               string
  appointment_id:   string
  patient_id:       string
  patient_name:     string
  doctor_id:        string
  doctor_name:      string
  slot_date:        string
  slot_time:        string
  duration_minutes: number
  appointment_type: string
  trigger:          GapFillTrigger
  status:           FreedSlotStatus
  freed_at:         string
  filled_at?:       string | null
  filled_by?:       string | null
}

function genId(): string {
  return `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadLocal(): FreedAppointmentSlot[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FreedAppointmentSlot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocal(entries: FreedAppointmentSlot[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}

function isRemoteUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return [0, 401, 403, 404].includes(err.status)
}

function normalizeTime(value: string): string {
  return value.slice(0, 5)
}

function fromRow(row: ApiFreedSlotRow): FreedAppointmentSlot {
  return {
    id:            row.id,
    appointmentId: row.appointment_id,
    patientId:     row.patient_id,
    patientName:   row.patient_name,
    doctorId:      row.doctor_id,
    doctorName:    row.doctor_name,
    date:          row.slot_date,
    time:          normalizeTime(row.slot_time),
    duration:      row.duration_minutes,
    type:          row.appointment_type as AppointmentType,
    trigger:       row.trigger,
    status:        row.status,
    freedAt:       row.freed_at,
    filledAt:      row.filled_at ?? undefined,
    filledBy:      row.filled_by ?? undefined,
  }
}

function toRow(slot: FreedAppointmentSlot): Partial<ApiFreedSlotRow> {
  return {
    id:               slot.id,
    appointment_id:   slot.appointmentId,
    patient_id:       slot.patientId,
    patient_name:     slot.patientName,
    doctor_id:        slot.doctorId,
    doctor_name:      slot.doctorName,
    slot_date:        slot.date,
    slot_time:        slot.time,
    duration_minutes: slot.duration,
    appointment_type: slot.type,
    trigger:          slot.trigger,
    status:           slot.status,
    freed_at:         slot.freedAt,
    filled_at:        slot.filledAt ?? null,
    filled_by:        slot.filledBy ?? null,
  }
}

function isFutureSlot(date: string, time: string): boolean {
  const slotTime = new Date(`${date}T${time}:00`)
  return !Number.isNaN(slotTime.getTime()) && slotTime > new Date()
}

export async function getPendingFreedSlots(): Promise<FreedAppointmentSlot[]> {
  try {
    const rows = await apiRequest<ApiFreedSlotRow[]>(
      `${TABLE_PATH}?select=*&status=eq.pending&order=freed_at.desc`,
      { logErrors: false },
    )
    return Array.isArray(rows)
      ? rows.map(fromRow).filter((s) => isFutureSlot(s.date, s.time))
      : []
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
    return loadLocal()
      .filter((s) => s.status === "pending" && isFutureSlot(s.date, s.time))
      .sort((a, b) => b.freedAt.localeCompare(a.freedAt))
  }
}

export async function recordFreedSlot(
  freed: FreedSlotInput,
  trigger: GapFillTrigger,
): Promise<FreedAppointmentSlot | null> {
  if (!isFutureSlot(freed.date, freed.time)) return null

  const slot: FreedAppointmentSlot = {
    id:            genId(),
    appointmentId: freed.id,
    patientId:     freed.patientId,
    patientName:   freed.patientName,
    doctorId:      freed.doctorId,
    doctorName:    freed.doctorName,
    date:          freed.date,
    time:          freed.time,
    duration:      freed.duration,
    type:          freed.type,
    trigger,
    status:        "pending",
    freedAt:       new Date().toISOString(),
  }

  try {
    const created = await apiRequest<ApiFreedSlotRow[]>(TABLE_PATH, {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    toRow(slot),
      logErrors: false,
    })
    const row = Array.isArray(created) ? created[0] : (created as unknown as ApiFreedSlotRow)
    if (row) return fromRow(row)
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  const local = loadLocal().filter((s) => s.appointmentId !== slot.appointmentId)
  local.push(slot)
  saveLocal(local)
  return slot
}

export async function updateFreedSlotStatus(
  id: string,
  status: FreedSlotStatus,
  filledBy?: string,
): Promise<void> {
  const patch = {
    status,
    filled_at: status === "filled" ? new Date().toISOString() : null,
    filled_by: filledBy ?? null,
  }

  try {
    await apiRequest(`${TABLE_PATH}?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: patch,
      logErrors: false,
    })
    return
  } catch (err) {
    if (!isRemoteUnavailable(err)) throw err
  }

  saveLocal(loadLocal().map((s) => {
    if (s.id !== id) return s
    return {
      ...s,
      status,
      filledAt: status === "filled" ? new Date().toISOString() : s.filledAt,
      filledBy: filledBy ?? s.filledBy,
    }
  }))
}

export function freedSlotToAppointmentShape(slot: FreedAppointmentSlot): FreedSlotInput {
  return {
    id:          slot.appointmentId,
    patientId:   slot.patientId,
    patientName: slot.patientName,
    doctorId:    slot.doctorId,
    doctorName:  slot.doctorName,
    date:        slot.date,
    time:        slot.time,
    duration:    slot.duration,
    type:        slot.type,
  }
}
