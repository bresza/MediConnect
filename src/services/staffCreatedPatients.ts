import type { Patient } from "../types"

const IDS_KEY = "mediconnect:staff-created-patients"
const SNAPSHOTS_KEY = "mediconnect:staff-created-patient-snapshots"

type StaffCreatedMap = Record<string, string[]>

function readIdMap(): StaffCreatedMap {
  try {
    const raw = localStorage.getItem(IDS_KEY)
    return raw ? JSON.parse(raw) as StaffCreatedMap : {}
  } catch {
    return {}
  }
}

function writeIdMap(map: StaffCreatedMap): void {
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(map))
  } catch {
    // localStorage indisponivel
  }
}

function readSnapshots(): Record<string, Patient> {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY)
    return raw ? JSON.parse(raw) as Record<string, Patient> : {}
  } catch {
    return {}
  }
}

function writeSnapshots(map: Record<string, Patient>): void {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(map))
  } catch {
    // localStorage indisponivel
  }
}

/** Registra paciente recém-cadastrado por um membro da equipe (fallback quando RLS/created_by falham). */
export function trackStaffCreatedPatient(staffUserId: string, patient: Patient): void {
  if (!staffUserId || !patient.id) return

  const map = readIdMap()
  const current = new Set(map[staffUserId] ?? [])
  current.add(patient.id)
  map[staffUserId] = [...current]
  writeIdMap(map)

  const snapshots = readSnapshots()
  snapshots[patient.id] = patient
  writeSnapshots(snapshots)
}

export function getStaffCreatedPatientIds(staffUserId: string): string[] {
  if (!staffUserId) return []
  return readIdMap()[staffUserId] ?? []
}

export function getStaffCreatedPatientSnapshots(staffUserId: string): Patient[] {
  const ids = new Set(getStaffCreatedPatientIds(staffUserId))
  if (ids.size === 0) return []

  const snapshots = readSnapshots()
  return [...ids]
    .map((id) => snapshots[id])
    .filter((p): p is Patient => Boolean(p?.id))
}

export function forgetStaffCreatedPatient(patientId: string): void {
  if (!patientId) return
  const map = readIdMap()
  for (const staffUserId of Object.keys(map)) {
    map[staffUserId] = map[staffUserId].filter((id) => id !== patientId)
  }
  writeIdMap(map)

  const snapshots = readSnapshots()
  delete snapshots[patientId]
  writeSnapshots(snapshots)
}
