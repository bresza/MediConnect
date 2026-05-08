import { apiRequest, getApiUserId } from "./api"
import type {
  Patient, Gender, PatientStatus, MaritalStatus,
  Ethnicity, CommunicationChannel, CommunicationFrequency,
  EmergencyContact, Address,
} from "../types"
import { normalizeEmail, onlyDigits } from "../utils/masks"

interface ApiPatient {
  id:                       string
  full_name:                string
  cpf:                      string
  email?:                   string
  phone_mobile:             string
  birth_date?:              string
  gender?:                  string
  status?:                  string
  social_name?:             string
  rg?:                      string
  marital_status?:          string
  occupation?:              string
  nationality?:             string
  birthplace?:              string
  ethnicity?:               string
  health_insurance?:        string
  health_insurance_number?: string
  is_vip?:                  boolean
  emergency_contact?:       EmergencyContact
  address?:                 Address
  observations?:            string
  preferred_channel?:       string
  communication_frequency?: string
  opt_in?:                  boolean
  behavior_score?:          number
  last_visit?:              string
  next_visit?:              string
  created_at?:              string
  updated_at?:              string
  photo_url?:               string
}

function apiToPatient(api: ApiPatient): Patient {
  return {
    id:                     api.id,
    name:                   api.full_name,
    cpf:                    api.cpf,
    email:                  api.email,
    phone:                  api.phone_mobile ?? "",
    dob:                    api.birth_date ?? "",
    gender:                 (api.gender as Gender) ?? "Other",
    status:                 (api.status as PatientStatus) ?? "Active",
    socialName:             api.social_name,
    rg:                     api.rg,
    maritalStatus:          api.marital_status as MaritalStatus | undefined,
    occupation:             api.occupation,
    nationality:            api.nationality,
    birthplace:             api.birthplace,
    ethnicity:              api.ethnicity as Ethnicity | undefined,
    healthInsurance:        api.health_insurance,
    healthInsuranceNumber:  api.health_insurance_number,
    isVip:                  api.is_vip,
    emergencyContact:       api.emergency_contact,
    address:                api.address,
    observations:           api.observations,
    preferredChannel:       api.preferred_channel as CommunicationChannel | undefined,
    communicationFrequency: api.communication_frequency as CommunicationFrequency | undefined,
    optIn:                  api.opt_in,
    behaviorScore:          api.behavior_score,
    lastVisit:              api.last_visit,
    nextVisit:              api.next_visit,
    createdAt:              api.created_at,
    updatedAt:              api.updated_at,
    photoUrl:               api.photo_url,
  }
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !(typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0),
    ),
  )
}

function onlyDigits(value?: string): string | undefined {
  const digits = value?.replace(/\D/g, "")
  return digits || undefined
}

function patientToApi(
  p: Omit<Patient, "id"> | Patient,
  mode: "create" | "update" = "create",
): Record<string, unknown> {
  return {
    full_name: p.name?.trim() || null,

    cpf: p.cpf ? onlyDigits(p.cpf) : null,

    email: normalizeEmail(p.email ?? "") || "sememail@temp.com",

    phone_mobile: p.phone ? onlyDigits(p.phone) : null,
  }
}

export async function getPatients(): Promise<Patient[]> {
  const data = await apiRequest<ApiPatient[]>(
    "/rest/v1/patients?select=*&order=full_name.asc",
  )
  return (data ?? []).map(apiToPatient)
}

export async function createPatient(
  data: Omit<Patient, "id">
): Promise<Patient> {

  const payload = patientToApi(data, "create")

  const created = await apiRequest<ApiPatient[] | ApiPatient | { patient?: ApiPatient } | void>(
    "/functions/v1/create-patient",
    { method: "POST", body: payload },
  )

  const raw = Array.isArray(created)
    ? created[0]
    : created && "patient" in created
      ? created.patient
      : created

  if (raw && typeof raw === "object" && "id" in raw) return apiToPatient(raw as ApiPatient)

  const cpf = String(payload.cpf ?? "")
  const found = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?cpf=eq.${encodeURIComponent(cpf)}&select=*&limit=1`,
  )

  if (found[0]) return apiToPatient(found[0])
  throw new Error("A API não retornou o paciente criado e o registro não foi encontrado no banco.")
}

export async function updatePatient(patient: Patient): Promise<Patient> {
  await apiRequest(`/rest/v1/patients?id=eq.${patient.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: patientToApi(patient, "update"),
  })
  return patient
}

export async function deletePatient(id: string): Promise<void> {
  await apiRequest(`/rest/v1/patients?id=eq.${id}`, { method: "DELETE" })
}
