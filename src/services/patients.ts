import { ApiError, apiRequest } from "./api"
import type {
  Patient, Gender, PatientStatus, MaritalStatus,
  Ethnicity, CommunicationChannel, CommunicationFrequency,
  EmergencyContact, Address,
} from "../types"
import { normalizeEmail, onlyDigits } from "../utils/masks"

interface ApiPatient {
  id:                       string
  user_id?:                  string
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

interface CreateUserWithPasswordResponse {
  success?: boolean
  user?: {
    id: string
    email: string
    full_name?: string
    roles?: string[]
  }
  user_id?: string
  patient_id?: string
  message?: string
}

function apiToPatient(api: ApiPatient): Patient {
  return {
    id:                     api.id,
    userId:                 api.user_id,
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

function patientToApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  return {
    full_name: p.name?.trim() || null,

    cpf: p.cpf ? onlyDigits(p.cpf) : null,

    email: normalizeEmail(p.email ?? "") || "sememail@temp.com",

    phone_mobile: p.phone ? onlyDigits(p.phone) : null,
  }
}

function patientToUserPayload(p: Omit<Patient, "id"> | Patient, password: string, createPatientRecord: boolean): Record<string, unknown> {
  return {
    email: normalizeEmail(p.email ?? ""),
    password: password.trim(),
    full_name: p.name?.trim(),
    phone: p.phone ? onlyDigits(p.phone) : undefined,
    role: "paciente",
    create_patient_record: createPatientRecord,
    cpf: p.cpf ? onlyDigits(p.cpf) : undefined,
    phone_mobile: p.phone ? onlyDigits(p.phone) : undefined,
    birth_date: p.dob || undefined,
    redirect_url: window.location.origin,
  }
}

function createdUserId(response: CreateUserWithPasswordResponse): string {
  return response.user?.id ?? response.user_id ?? ""
}

async function createPatientUser(payload: Record<string, unknown>): Promise<CreateUserWithPasswordResponse> {
  try {
    return await apiRequest<CreateUserWithPasswordResponse>("/functions/v1/create-user-with-password", {
      method: "POST",
      body: payload,
    })
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return apiRequest<CreateUserWithPasswordResponse>("/create-user-with-password", {
    method: "POST",
    body: payload,
  })
}

async function findPatientById(id?: string): Promise<ApiPatient | null> {
  if (!id) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )
  return rows?.[0] ?? null
}

async function findPatientByCpf(cpf: unknown): Promise<ApiPatient | null> {
  if (typeof cpf !== "string" || cpf.length === 0) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?cpf=eq.${encodeURIComponent(cpf)}&select=*&limit=1`,
  )
  return rows?.[0] ?? null
}

async function findPatientByEmail(email?: string): Promise<ApiPatient | null> {
  const normalized = normalizeEmail(email ?? "")
  if (!normalized) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?email=eq.${encodeURIComponent(normalized)}&select=*&limit=1`,
  )
  return rows?.[0] ?? null
}

async function ensurePatientRole(userId: string): Promise<void> {
  if (!userId) return
  const existing = await apiRequest<{ user_id: string; role: string }[]>(
    `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role=eq.paciente&select=user_id,role&limit=1`,
  ).catch(() => [])
  if (existing?.length) return

  await apiRequest("/rest/v1/user_roles", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId, role: "paciente" },
  }).catch((err) => {
    console.warn("[user_roles] sincronização de paciente falhou:", err)
  })
}

async function ensurePatientProfile(userId: string, data: Omit<Patient, "id"> | Patient): Promise<void> {
  if (!userId) return
  await apiRequest("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      id: userId,
      full_name: data.name.trim(),
      email: normalizeEmail(data.email ?? ""),
      phone: data.phone ? onlyDigits(data.phone) : null,
    },
  }).catch((err) => {
    console.warn("[profiles] sincronização de paciente falhou:", err)
  })
}

async function linkPatientToUser(patientId: string, userId: string): Promise<void> {
  if (!patientId || !userId) return
  await apiRequest(`/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId },
  }).catch((err) => {
    console.warn("[patients] vínculo user_id do paciente falhou:", err)
  })
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

  const payload = patientToApi(data)

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

export async function createPatientWithPassword(
  data: Omit<Patient, "id">,
  password: string,
): Promise<Patient> {
  const payload = patientToUserPayload(data, password, true)
  if (!payload.email) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  if (!payload.password) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (String(payload.password).length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const response = await createPatientUser(payload)
  const userId = createdUserId(response)
  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, data)

  const rawById = await findPatientById(response.patient_id)
  if (rawById) {
    await linkPatientToUser(rawById.id, userId)
    return updatePatient({ ...apiToPatient(rawById), ...data, id: rawById.id, userId })
  }

  const cpf = String(patientToApi(data).cpf ?? "")
  let raw = await findPatientByCpf(cpf)
  if (!raw) raw = await findPatientByEmail(data.email)
  if (!raw) {
    const created = await createPatient(data)
    await linkPatientToUser(created.id, userId)
    return { ...created, userId }
  }

  await linkPatientToUser(raw.id, userId)
  return updatePatient({ ...apiToPatient(raw), ...data, id: raw.id, userId })
}

export async function createPatientPortalAccess(
  patient: Patient,
  password: string,
): Promise<Patient> {
  const payload: Record<string, unknown> = {
    ...patientToUserPayload(patient, password, false),
    patient_id: patient.id,
  }
  if (!payload.email) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  if (!payload.password) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (String(payload.password).length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const response = await createPatientUser(payload)
  const userId = createdUserId(response)
  if (!userId) throw new Error(response.message || "Usuário paciente não foi criado pela API.")

  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, patient)
  await linkPatientToUser(patient.id, userId)

  return updatePatient({ ...patient, userId })
}

export async function updatePatient(patient: Patient): Promise<Patient> {
  await apiRequest(`/rest/v1/patients?id=eq.${patient.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: patientToApi(patient),
  })
  return patient
}

export async function deletePatient(id: string): Promise<void> {
  await apiRequest(`/rest/v1/patients?id=eq.${id}`, { method: "DELETE" })
}
