import { apiRequest } from "./api"

export type SlimPatient = { id: string; full_name: string }

let patientMapCache: Map<string, string> | null = null
let patientMapPromise: Promise<Map<string, string>> | null = null

export async function fetchPatientNameMap(): Promise<Map<string, string>> {
  if (patientMapCache) return patientMapCache
  if (patientMapPromise) return patientMapPromise

  patientMapPromise = apiRequest<SlimPatient[]>(
    "/rest/v1/patients?select=id,full_name&order=full_name.asc",
    { logErrors: false },
  ).then((rows) => {
    patientMapCache = new Map((rows ?? []).map((p) => [p.id, p.full_name]))
    return patientMapCache
  }).finally(() => {
    patientMapPromise = null
  })

  return patientMapPromise
}

export function invalidatePatientNameMap(): void {
  patientMapCache = null
}

interface ApiDoctor { id: string; full_name: string }
interface ApiProfile { id: string; full_name: string }

let doctorMapCache: Map<string, string> | null = null
let doctorMapPromise: Promise<Map<string, string>> | null = null

export async function fetchDoctorNameMap(): Promise<Map<string, string>> {
  if (doctorMapCache) return doctorMapCache
  if (doctorMapPromise) return doctorMapPromise

  doctorMapPromise = Promise.all([
    apiRequest<ApiDoctor[]>("/rest/v1/doctors?select=id,full_name", { logErrors: false }),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=id,full_name", { logErrors: false }),
  ]).then(([doctors, profiles]) => {
    doctorMapCache = new Map([
      ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
      ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
    ])
    return doctorMapCache
  }).finally(() => {
    doctorMapPromise = null
  })

  return doctorMapPromise
}

export function invalidateDoctorNameMap(): void {
  doctorMapCache = null
}

export function invalidateLookupCaches(): void {
  invalidatePatientNameMap()
  invalidateDoctorNameMap()
}
