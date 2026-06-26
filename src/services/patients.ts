import { ApiError, apiRequest, getApiUserId } from "./api"
import { requestPasswordReset, verifyPatientCredentials } from "./auth"
import {
  fetchUserInfo,
  isUuid,
  patientFromUserInfo,
  resolvePatientIdFromApi,
} from "./userInfo"
import { isRemovedPatientPlaceholder, REMOVED_PATIENT_CPF, REMOVED_PATIENT_EMAIL, REMOVED_PATIENT_NAME } from "../utils/removedPatient"
import { isDataUrl, isRemotePhotoUrl, resolvePatientPhotoUrl, attachPatientPhotos, attachPatientPhoto, deletePatientPhotoFromStorage } from "./patientPhoto"
import { rememberPatientLink, getAllRememberedPatientIds, resolveRememberedPatientId } from "./patientLinks"
import { getStaffCreatedPatientIds, getStaffCreatedPatientSnapshots } from "./staffCreatedPatients"
import type {
  Patient, Gender, PatientStatus, MaritalStatus,
  Ethnicity, CommunicationChannel, CommunicationFrequency,
  EmergencyContact, Address,
} from "../types"

interface ApiPatient {
  id:                       string
  user_id?:                  string
  created_by?:              string
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
  landline?:                string
  alternative_phone?:       string
  mother_name?:             string
  mother_occupation?:       string
  father_name?:             string
  father_occupation?:       string
  guardian_name?:           string
  guardian_cpf?:            string
  spouse_name?:             string
  legacy_code?:             string
}

interface CreateUserWithPasswordResponse {
  success?: boolean
  id?: string
  user?: {
    id: string
    email: string
    full_name: string
    roles: string[]
    email_confirmed_at?: string | null
  }
  user_id?: string
  patient_id?: string
  profile?: unknown
  role?: string
  message?: string
}

interface ApiProfile {
  id: string
  email?: string
  full_name?: string
  patient_id?: string
  phone?: string
  cpf?: string
  birth_date?: string
}

export interface PatientIdentity {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

/** Cadastro clínico ok, mas o teste de login com a senha informada falhou. */
export class PatientPortalVerifyError extends Error {
  readonly patient: Patient

  constructor(message: string, patient: Patient) {
    super(message)
    this.name = "PatientPortalVerifyError"
    this.patient = patient
  }
}

function normalizeGenderFromApi(raw?: string | null): Gender | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower === "male")   return "Male"
  if (lower === "female") return "Female"
  if (lower === "other")  return "Other"
  return undefined
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
    gender:                 normalizeGenderFromApi(api.gender),
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
    landline:               api.landline,
    alternativePhone:       api.alternative_phone,
    motherName:             api.mother_name,
    motherOccupation:       api.mother_occupation,
    fatherName:             api.father_name,
    fatherOccupation:       api.father_occupation,
    guardianName:           api.guardian_name,
    guardianCpf:            api.guardian_cpf,
    spouseName:             api.spouse_name,
    legacyCode:             api.legacy_code,
    createdBy:              api.created_by,
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

function normalizeGenderToApi(g?: string): string | undefined {
  if (!g) return undefined
  const lower = g.toLowerCase()
  if (lower === "male"   || lower === "masculino") return "male"
  if (lower === "female" || lower === "feminino")  return "female"
  if (lower === "other"  || lower === "outro")     return "other"
  return lower
}

function patientToFullApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  return compactPayload({
    full_name:    p.name?.trim(),
    cpf:          onlyDigits(p.cpf),
    email:        p.email?.trim(),
    phone_mobile: onlyDigits(p.phone),
    birth_date:   p.dob,
    gender:       normalizeGenderToApi(p.gender),
    status:       p.status ?? "Active",

    social_name:             p.socialName,
    rg:                      p.rg,
    marital_status:          p.maritalStatus,
    occupation:              p.occupation,
    nationality:             p.nationality,
    birthplace:              p.birthplace,
    ethnicity:               p.ethnicity,
    health_insurance:        p.healthInsurance,
    health_insurance_number: p.healthInsuranceNumber,
    is_vip:                  p.isVip,
    emergency_contact:       p.emergencyContact,
    address:                 p.address,
    preferred_channel:       p.preferredChannel,
    communication_frequency: p.communicationFrequency,
    opt_in:                  p.optIn,
    behavior_score:          p.behaviorScore,
    landline:                onlyDigits(p.landline),
    alternative_phone:       onlyDigits(p.alternativePhone),
    mother_name:             p.motherName,
    mother_occupation:       p.motherOccupation,
    father_name:             p.fatherName,
    father_occupation:       p.fatherOccupation,
    guardian_name:           p.guardianName,
    guardian_cpf:            onlyDigits(p.guardianCpf),
    spouse_name:             p.spouseName,
    legacy_code:             p.legacyCode,
    user_id:                 "userId" in p ? p.userId : undefined,
    created_by:              "createdBy" in p && p.createdBy ? p.createdBy : undefined,
  })
}

function patientToCoreApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  const full = patientToFullApi(p)
  return compactPayload({
    full_name:         full.full_name,
    cpf:               full.cpf,
    email:             full.email,
    phone_mobile:      full.phone_mobile,
    birth_date:        full.birth_date,
    gender:            full.gender,
    status:            full.status,
    emergency_contact: full.emergency_contact,
    address:           full.address,
    health_insurance:  full.health_insurance,
    marital_status:    full.marital_status,
    ethnicity:         full.ethnicity,
    social_name:       full.social_name,
    user_id:           full.user_id,
  })
}

function patientToApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  const payload = patientToFullApi(p)
  const minimal = compactPayload({
    full_name:    payload.full_name,
    cpf:          payload.cpf,
    email:        payload.email,
    phone_mobile: payload.phone_mobile,
    birth_date:   payload.birth_date,
  })
  return minimal
}

function extractMissingColumn(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  const match = err.message.match(/column patients\.(\w+) does not exist/i)
  return match?.[1] ?? null
}

async function patchPatientWithFallback(id: string, patient: Patient): Promise<void> {
  const tiers: Array<() => Record<string, unknown>> = [
    () => patientToFullApi(patient),
    () => patientToCoreApi(patient),
    () => patientToApi(patient),
  ]

  let lastErr: unknown = null
  for (const buildPayload of tiers) {
    let body = buildPayload()
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await apiRequest(`/rest/v1/patients?id=eq.${id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body,
          logErrors: false,
        })
        return
      } catch (err) {
        lastErr = err
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          try {
            await updatePatientViaEdgeFunction(id, body)
            return
          } catch (edgeErr) {
            lastErr = edgeErr
            if (!(edgeErr instanceof ApiError && edgeErr.status === 404)) throw edgeErr
          }
        }
        if (!isSchemaMismatch(err)) throw err
        const missing = extractMissingColumn(err)
        if (missing && missing in body) {
          const next = { ...body }
          delete next[missing]
          body = next
          continue
        }
        break
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Não foi possível atualizar o paciente.")
}

async function updatePatientViaEdgeFunction(
  patientId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = compactPayload({ patient_id: patientId, id: patientId, ...payload })
  const paths = ["/functions/v1/update-patient", "/update-patient"] as const

  let lastErr: unknown
  for (const path of paths) {
    try {
      await apiRequest(path, { method: "POST", body, logErrors: false })
      return
    } catch (err) {
      lastErr = err
      if (err instanceof ApiError && err.status === 404) continue
      throw err
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Endpoint update-patient não encontrado no Supabase.")
}

function patientToDirectApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  return compactPayload({
    ...patientToFullApi(p),
    created_by: getApiUserId() ?? undefined,
  })
}

function isSchemaMismatch(err: unknown): boolean {
  return err instanceof ApiError &&
    err.status === 400 &&
    (
      /schema cache|could not find|column|PGRST204|unexpected|unknown/i.test(err.message) ||
      /invalid input value.*(gender|status|marital_status|ethnicity|preferred_channel|communication_frequency)/i.test(err.message)
    )
}

function extractCreatedPatient(data: unknown): ApiPatient | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] as ApiPatient | undefined) ?? null
  if (typeof data !== "object") return null

  const obj = data as Partial<ApiPatient> & {
    patient?: ApiPatient
    data?: ApiPatient
  }

  return obj.patient ?? obj.data ?? (obj.id && obj.full_name ? obj as ApiPatient : null)
}

function stampPatientCreator(patient: Patient): Patient {
  return {
    ...patient,
    createdBy: patient.createdBy ?? getApiUserId() ?? undefined,
  }
}

async function findPatientByCpf(cpf: unknown): Promise<ApiPatient | null> {
  if (typeof cpf !== "string" || cpf.length === 0) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?cpf=eq.${encodeURIComponent(cpf)}&select=*&limit=1`,
  )
  return rows?.[0] ?? null
}

async function createPatientValidated(
  path: string,
  payload: Record<string, unknown>,
): Promise<ApiPatient[] | ApiPatient | undefined> {
  return apiRequest<ApiPatient[] | ApiPatient | undefined>(
    path,
    {
      method: "POST",
      body: payload,
      logErrors: false,
    },
  )
}

async function createPatientDirect(
  data: Omit<Patient, "id">,
): Promise<Patient> {
  const payload = patientToDirectApi(data)
  const minimalPayload = compactPayload({
    ...patientToApi(data),
    created_by: payload.created_by,
  })

  if (!payload.created_by) {
    throw new Error("Sessão inválida. Faça login novamente para cadastrar pacientes.")
  }

  let created: ApiPatient[] | ApiPatient | undefined
  try {
    created = await apiRequest<ApiPatient[] | ApiPatient | undefined>(
      "/rest/v1/patients",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: payload,
        logErrors: false,
      },
    )
  } catch (err) {
    if (!isSchemaMismatch(err)) throw formatPatientCreateError(err)
    created = await apiRequest<ApiPatient[] | ApiPatient | undefined>(
      "/rest/v1/patients",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: minimalPayload,
      },
    )
  }

  const raw = extractCreatedPatient(created) ?? await findPatientByCpf(minimalPayload.cpf)
  if (!raw) throw new Error("Paciente criado, mas a API não retornou o registro cadastrado.")
  const patient = apiToPatient(raw)
  rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
  const creatorId = patient.createdBy ?? getApiUserId() ?? undefined
  const saved = await updatePatient({
    ...patient,
    ...data,
    id: patient.id,
    ...(creatorId ? { createdBy: creatorId } : {}),
  })
  return stampPatientCreator(saved)
}

async function createPatientUserWithPassword(
  path: string,
  payload: Record<string, unknown>,
): Promise<CreateUserWithPasswordResponse> {
  return apiRequest<CreateUserWithPasswordResponse>(path, {
    method: "POST",
    body: payload,
    logErrors: false,
  })
}

async function createPatientUser(payload: Record<string, unknown>): Promise<CreateUserWithPasswordResponse> {
  try {
    return await createPatientUserWithPassword("/functions/v1/create-user-with-password", payload)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return createPatientUserWithPassword("/create-user-with-password", payload)
}

function createdUserId(response: CreateUserWithPasswordResponse): string {
  return response.user?.id ?? response.user_id ?? response.id ?? ""
}

/** E-mail da credencial Auth (perfil pode divergir da ficha). */
async function authEmailForPortal(patient: Patient, formEmail: string): Promise<string> {
  const userId = patient.userId?.trim()
  if (!userId) return formEmail
  const rows = await apiRequest<Array<{ email?: string }>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=email&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0]?.email?.trim().toLowerCase() || formEmail
}

async function finalizePatientPortalAccess(
  patient: Patient,
  userId: string,
  email: string,
): Promise<void> {
  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, patient)
  await linkPatientToUser(patient.id, userId, email)
  await syncProfilePatientLink(userId, patient.id)
  rememberPatientLink({
    authUserId: userId,
    patientId: patient.id,
    name: patient.name,
    email,
    cpf: patient.cpf,
  })
}

async function resolvePortalAuthUserId(
  email: string,
  patient: Patient,
  response: CreateUserWithPasswordResponse | null,
): Promise<string> {
  const fromApi = response ? createdUserId(response) : ""
  if (fromApi) return fromApi
  if (patient.userId?.trim()) return patient.userId.trim()
  const profile = await findProfileByEmail(email)
  if (profile?.id) return profile.id
  const row = await findPatientById(patient.id)
  return row?.user_id?.trim() ?? ""
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
    console.warn("[user_roles] sincronizacao de paciente falhou:", err)
  })
}

async function ensurePatientProfile(
  userId: string,
  data: Omit<Patient, "id"> | Patient,
): Promise<void> {
  if (!userId) return

  const fullPayload = compactPayload({
    id: userId,
    full_name: data.name.trim(),
    email: data.email?.trim(),
    phone: onlyDigits(data.phone),
    patient_id: "id" in data && data.id ? data.id : undefined,
  })

  const minimalPayload = compactPayload({
    id: userId,
    full_name: data.name.trim(),
    email: data.email?.trim(),
    phone: onlyDigits(data.phone),
    patient_id: "id" in data && data.id ? data.id : undefined,
  })

  try {
    await apiRequest("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: fullPayload,
      logErrors: false,
    })
  } catch (err) {
    if (!isSchemaMismatch(err)) {
      console.warn("[profiles] sincronizacao de perfil paciente falhou:", err)
      return
    }
    await apiRequest("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: minimalPayload,
      logErrors: false,
    }).catch((fallbackErr) => {
      console.warn("[profiles] sincronizacao minima de perfil paciente falhou:", fallbackErr)
    })
  }
}

async function syncProfilePatientLink(userId: string, patientId: string): Promise<void> {
  if (!userId || !patientId) return
  await apiRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { patient_id: patientId },
    logErrors: false,
  }).catch(() => undefined)
}

async function findProfileByEmail(email?: string): Promise<ApiProfile | null> {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  const queries = [
    `/rest/v1/profiles?email=eq.${encodeURIComponent(normalized)}&select=*&limit=1`,
    `/rest/v1/profiles?email=ilike.${encodeURIComponent(normalized)}&select=*&limit=1`,
  ]
  for (const path of queries) {
    const rows = await apiRequest<ApiProfile[]>(path, { logErrors: false }).catch(() => [])
    if (rows?.[0]) return rows[0]
  }
  return null
}


function isAlreadyRegisteredError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 409) return true
    if (err.status === 400) {
      return /already been registered|already registered|usu[aá]rio.*j[aá].*registrad|e-?mail.*j[aá].*cadastrad|e-?mail.*em uso|duplicate.*email/i.test(
        err.message,
      )
    }
    return false
  }
  if (!(err instanceof Error)) return false
  return /already been registered|already registered|usu[aá]rio.*j[aá].*registrad|e-?mail.*j[aá].*cadastrad|e-?mail.*em uso/i.test(
    err.message,
  )
}

function errorMessageText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

function isDuplicateCpfError(err: unknown): boolean {
  const msg = errorMessageText(err)
  return /cpf.*j[aá].*cadastrad|j[aá].*cadastrad.*cpf|duplicate.*cpf|unique.*cpf/i.test(msg)
}

function formatPatientCreateError(err: unknown): Error {
  if (isDuplicateCpfError(err)) {
    return new Error(
      "Este CPF já está cadastrado. Se um cadastro anterior falhou, remova o paciente na lista e tente novamente.",
    )
  }
  if (isAlreadyRegisteredError(err)) {
    return new Error(
      "Este e-mail já tem conta no sistema. Use «Esqueci minha senha» na tela de entrada ou remova o cadastro incompleto na lista.",
    )
  }
  const raw = errorMessageText(err)
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    if (parsed?.error) return new Error(parsed.error)
  } catch {
    /* não é JSON */
  }
  return err instanceof Error ? err : new Error("Não foi possível cadastrar o paciente.")
}

/** Remove ficha clínica incompleta sem exigir permissão de apagar conta Auth (secretária). */
async function rollbackIncompletePatient(patientId: string): Promise<void> {
  if (!patientId) return
  try {
    await apiRequest(`/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { user_id: null },
      logErrors: false,
    })
  } catch {
    /* ignora */
  }
  await deletePatientDependencies(patientId).catch(() => undefined)
  await deletePatientRecord(patientId, false).catch(() => undefined)
}

async function rollbackOrphanFromEdgeFailure(
  cpf: string | undefined,
  email: string | undefined,
): Promise<void> {
  if (!cpf) return
  const row = await findPatientByCpf(cpf).catch(() => null)
  if (!row?.id || row.user_id) return
  const rowEmail = row.email?.trim().toLowerCase()
  const wantedEmail = email?.trim().toLowerCase()
  if (wantedEmail && rowEmail && rowEmail !== wantedEmail) return
  await rollbackIncompletePatient(row.id)
}

async function findPatientById(id?: string): Promise<ApiPatient | null> {
  if (!id) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )
  return rows?.[0] ?? null
}

async function findPatientByEmail(email?: string): Promise<ApiPatient | null> {
  if (!email) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0] ?? null
}

function isBlockedDependencyDelete(err: unknown): boolean {
  return err instanceof Error && /A API não removeu .* vinculados ao paciente/i.test(err.message)
}

function isDeleteBlockedByDependency(err: unknown): boolean {
  return err instanceof ApiError && (
    err.status === 409 ||
    /foreign key|violates|constraint|vinculad|depend/i.test(err.message)
  )
}

function isMissingResource(err: unknown): boolean {
  return err instanceof ApiError &&
    (err.status === 404 || (err.status === 400 && /schema|cache|could not find|not found|relation|table/i.test(err.message)))
}

async function deletePatientAuthUser(userId?: string): Promise<boolean> {
  if (!userId) return false

  await apiRequest("/functions/v1/delete-user", {
    method: "POST",
    body: { userId },
    logErrors: false,
  })
  return true
}

async function getDeletedPatientPlaceholderId(): Promise<string> {
  const email = REMOVED_PATIENT_EMAIL
  const cpf = REMOVED_PATIENT_CPF
  const existing = await findPatientByEmail(email) ?? await findPatientByCpf(cpf)
  if (existing?.id) return existing.id

  const payload = compactPayload({
    full_name: REMOVED_PATIENT_NAME,
    cpf,
    email,
    phone_mobile: "00000000000",
    birth_date: "1900-01-01",
    created_by: getApiUserId() ?? undefined,
  })
  let created: ApiPatient[] | ApiPatient | undefined
  try {
    created = await apiRequest<ApiPatient[] | ApiPatient>("/rest/v1/patients", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: payload,
      logErrors: false,
    })
  } catch (err) {
    if (!isSchemaMismatch(err)) throw err
    created = await apiRequest<ApiPatient[] | ApiPatient>("/rest/v1/patients", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        full_name: REMOVED_PATIENT_NAME,
        cpf,
        email,
        phone_mobile: "00000000000",
        birth_date: "1900-01-01",
      },
      logErrors: false,
    })
  }

  const raw = extractCreatedPatient(created) ?? await findPatientByEmail(email) ?? await findPatientByCpf(cpf)
  if (!raw?.id) throw new Error("A API não permitiu criar o paciente técnico para preservar vínculos antigos.")
  return raw.id
}

function patientIdentityFilters(identity: PatientIdentity): string[] {
  const cpf = onlyDigits(identity.cpf)
  const name = identity.name?.trim()
  return [
    identity.patientId ? `id.eq.${encodeURIComponent(identity.patientId)}` : "",
    identity.userId ? `user_id.eq.${encodeURIComponent(identity.userId)}` : "",
    identity.email ? `email.eq.${encodeURIComponent(identity.email.trim().toLowerCase())}` : "",
    cpf ? `cpf.eq.${encodeURIComponent(cpf)}` : "",
    name ? `full_name.ilike.*${encodeURIComponent(name)}*` : "",
  ].filter(Boolean)
}

function scorePatientMatch(api: ApiPatient, identity: PatientIdentity): number {
  const cpf = onlyDigits(identity.cpf)
  const email = identity.email?.trim().toLowerCase()
  const name = identity.name?.trim().toLowerCase()
  if (identity.patientId && api.id === identity.patientId) return 50
  if (identity.userId && api.user_id === identity.userId) return 45
  if (cpf && onlyDigits(api.cpf) === cpf) return 40
  if (email && api.email?.trim().toLowerCase() === email) return 30
  if (name && api.full_name?.trim().toLowerCase() === name) return 25
  if (name && api.full_name?.trim().toLowerCase().includes(name)) return 15
  return 0
}

async function patchPatientUserId(filter: string, userId: string): Promise<void> {
  await apiRequest(`/rest/v1/patients?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId },
    logErrors: false,
  })
}

/**
 * Garante `patients.user_id = auth.uid()` para o portal passar na RLS de agendamentos.
 * Tenta RPC (SECURITY DEFINER), depois PATCH por id e por e-mail do JWT.
 * Retorna o patient_id confirmado.
 */
export async function syncPatientAuthLink(
  patientId: string,
  userId: string,
  email?: string,
): Promise<string | null> {
  if (!patientId || !userId) return null

  const currentUid = getApiUserId()
  if (currentUid && currentUid === userId) {
    const rpcId = await apiRequest<string | null>(
      "/rest/v1/rpc/link_my_patient_record",
      { method: "POST", body: {}, logErrors: false },
    ).catch(() => null)
    if (isUuid(rpcId)) return rpcId
  }

  const filters = [`id=eq.${encodeURIComponent(patientId)}`]
  const normalizedEmail = email?.trim().toLowerCase()
  if (normalizedEmail) {
    filters.push(`email=eq.${encodeURIComponent(normalizedEmail)}`)
  }

  for (const filter of filters) {
    try {
      await patchPatientUserId(filter, userId)
      return patientId
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        try {
          await updatePatientViaEdgeFunction(patientId, { user_id: userId })
          return patientId
        } catch (edgeErr) {
          if (!(edgeErr instanceof ApiError && edgeErr.status === 404)) throw edgeErr
        }
      }
    }
  }

  return null
}

async function syncResolvedPatientProfile(
  userId: string | undefined,
  patient: ApiPatient,
  email?: string,
): Promise<void> {
  if (!userId) return
  await syncPatientAuthLink(patient.id, userId, email ?? patient.email).catch(() => undefined)
}

async function linkPatientToUser(patientId: string, userId: string, email?: string): Promise<void> {
  if (!patientId || !userId) return
  await syncPatientAuthLink(patientId, userId, email).catch((err) => {
    console.warn("[patients] vinculo user_id do paciente falhou:", err)
  })
}

/**
 * @deprecated Use resolvePatientIdFromApi (POST /user-info). Mantido como alias.
 */
export async function ensurePatientAuthLink(token?: string | null): Promise<string | null> {
  return resolvePatientIdFromApi(token)
}

async function resolveTrustedPatientId(identity: PatientIdentity): Promise<string | null> {
  const fromApi = await resolvePatientIdFromApi().catch(() => null)
  const remembered = resolveRememberedPatientId(identity)
  const fromIdentity = identity.patientId
  const identityLooksLikeAuthUser = Boolean(
    fromIdentity && identity.userId && fromIdentity === identity.userId,
  )

  const candidates = [
    fromApi,
    remembered,
    identityLooksLikeAuthUser ? null : fromIdentity,
  ].filter(isUuid)

  return candidates[0] ?? null
}

function fallbackPatientFromIdentity(identity: PatientIdentity, patientId: string): Patient {
  return {
    id: patientId,
    userId: identity.userId,
    name: identity.name ?? "",
    cpf: identity.cpf ?? "",
    email: identity.email ?? "",
    phone: "",
    dob: "",
    status: "Active",
  }
}

function finalizeResolvedPatient(patient: Patient): Promise<Patient> {
  rememberPatientLink({
    patientId: patient.id,
    name: patient.name,
    email: patient.email,
    cpf: patient.cpf,
  })
  return attachPatientPhoto(patient)
}

async function loadPatientRecordById(patientId: string): Promise<Patient | null> {
  return getPatientById(patientId)
}

async function loadPatientFromTrustedId(
  identity: PatientIdentity,
  patientId: string,
): Promise<Patient | null> {
  const fromRest = await loadPatientRecordById(patientId)
  if (fromRest) {
    if (identity.userId) {
      await syncPatientAuthLink(fromRest.id, identity.userId, identity.email ?? fromRest.email)
    }
    return fromRest
  }

  const info = await fetchUserInfo().catch(() => null)
  const officialId = info?.patient?.id ?? info?.profile?.patient_id
  if (info && officialId === patientId) {
    const built = patientFromUserInfo(info, patientId, identity)
    if (identity.userId) {
      await syncPatientAuthLink(patientId, identity.userId, identity.email ?? built.email)
    }
    return built
  }

  const fallback = fallbackPatientFromIdentity(identity, patientId)
  if (identity.userId) {
    await syncPatientAuthLink(patientId, identity.userId, identity.email ?? fallback.email)
  }
  return fallback
}

export async function getPatientByIdentity(identity: PatientIdentity): Promise<Patient | null> {
  const trustedId = await resolveTrustedPatientId(identity)
  if (trustedId) {
    const trustedPatient = await loadPatientFromTrustedId(identity, trustedId)
    if (trustedPatient) return finalizeResolvedPatient(trustedPatient)
  }

  const filters = patientIdentityFilters(identity)
  if (filters.length === 0) return null

  let rows: ApiPatient[] = []
  const orFilter = filters.length > 1 ? `or=(${filters.join(",")})` : filters[0]
  rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?${orFilter}&select=*&limit=10`,
    { logErrors: false },
  ).catch(() => [])

  if (rows.length === 0 && filters.length > 1) {
    const results = await Promise.all(
      filters.map((filter) =>
        apiRequest<ApiPatient[]>(`/rest/v1/patients?${filter}&select=*&limit=10`, { logErrors: false })
          .catch(() => []),
      ),
    )
    rows = results.flat()
  }

  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values())
  const best = uniqueRows
    .map((row) => ({ row, score: scorePatientMatch(row, identity) }))
    .sort((a, b) => b.score - a.score)[0]?.row

  if (!best) return null

  if (identity.userId) {
    await syncResolvedPatientProfile(identity.userId, best, identity.email)
  }

  const patient = apiToPatient({
    ...best,
    user_id: identity.userId ?? best.user_id,
  })
  return finalizeResolvedPatient(patient)
}

function mapApiPatients(rows: ApiPatient[]): Patient[] {
  return rows
    .map((row) => {
      const patient = apiToPatient(row)
      rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
      return patient
    })
    .filter((p) => !isRemovedPatientPlaceholder(p))
}

function mergePatientsById(primary: Patient[], extra: Patient[]): Patient[] {
  const map = new Map(primary.map((p) => [p.id, p]))
  for (const patient of extra) {
    if (!map.has(patient.id)) map.set(patient.id, patient)
  }
  return [...map.values()]
}

async function fetchPatientsCreatedBy(userId: string): Promise<Patient[]> {
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?created_by=eq.${encodeURIComponent(userId)}&select=*`,
    { logErrors: false },
  ).catch(() => []) ?? []
  return mapApiPatients(rows)
}

async function fetchTrackedStaffPatients(userId: string): Promise<Patient[]> {
  const ids = getStaffCreatedPatientIds(userId)
  if (ids.length === 0) return []

  const fetched = await Promise.all(
    ids.map((id) => getPatientById(id).catch(() => null)),
  )
  const fromApi = fetched.filter((p): p is Patient => Boolean(p))
  const snapshots = getStaffCreatedPatientSnapshots(userId)
  return mergePatientsById(snapshots, fromApi)
}

async function fetchPatientsList(): Promise<Patient[]> {
  let data: ApiPatient[] | null = null
  try {
    data = await apiRequest<ApiPatient[]>(
      "/rest/v1/patients?select=*&order=full_name.asc",
      { logErrors: false },
    )
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 406)) {
      data = await apiRequest<ApiPatient[]>("/rest/v1/patients?select=*", { logErrors: false })
    } else {
      throw err
    }
  }
  return mapApiPatients(data ?? [])
}

async function fetchLinkedPatientFallback(existing: Patient[]): Promise<Patient[]> {
  const existingIds = new Set(existing.map((p) => p.id))
  const missingIds = getAllRememberedPatientIds()
    .filter((id) => !existingIds.has(id))
    .slice(0, 40)
  if (missingIds.length === 0) return []

  const fetched = await Promise.all(
    missingIds.map((id) => getPatientById(id).catch(() => null)),
  )
  return fetched.filter((p): p is Patient => Boolean(p))
}

async function fetchProfilesByUserIds(userIds: string[]): Promise<ApiProfile[]> {
  if (userIds.length === 0) return []
  const batchSize = 25
  const profiles: ApiProfile[] = []

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize)
    const rows = await apiRequest<ApiProfile[]>(
      `/rest/v1/profiles?id=in.(${batch.map(encodeURIComponent).join(",")})&select=id,full_name,email,phone,cpf,patient_id,birth_date`,
      { logErrors: false },
    ).catch(() => []) ?? []
    profiles.push(...rows)
  }

  return profiles
}

async function fetchPatientRoleUserIds(): Promise<string[]> {
  const queries = [
    "/rest/v1/user_roles?role=eq.paciente&select=user_id",
    "/rest/v1/user_roles?role=eq.patient&select=user_id",
    "/rest/v1/user_roles?role=eq.Paciente&select=user_id",
  ]
  const ids = new Set<string>()
  for (const path of queries) {
    const rows = await apiRequest<Array<{ user_id: string }>>(path, { logErrors: false }).catch(() => []) ?? []
    for (const row of rows) {
      if (row.user_id) ids.add(row.user_id)
    }
  }
  return [...ids]
}

function profileToPatientEntry(profile: ApiProfile, patientId: string): Patient {
  return {
    id: patientId,
    userId: profile.id,
    name: (profile.full_name ?? "").trim() || profile.email || "Paciente",
    email: profile.email,
    phone: profile.phone ?? "",
    cpf: onlyDigits(profile.cpf) ?? "",
    dob: profile.birth_date ?? "",
    status: "Active",
  }
}

function findPatientInList(list: Patient[], profile: ApiProfile): Patient | undefined {
  const email = profile.email?.trim().toLowerCase()
  if (email) {
    const byEmail = list.find((p) => p.email?.trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const byUser = list.find((p) => p.userId === profile.id)
  if (byUser) return byUser
  if (profile.patient_id) {
    return list.find((p) => p.id === profile.patient_id)
  }
  return undefined
}

async function resolvePatientIdFromProfile(profile: ApiProfile): Promise<string | null> {
  if (profile.patient_id) return profile.patient_id

  const remembered = resolveRememberedPatientId({
    email: profile.email,
    name: profile.full_name,
    cpf: profile.cpf,
  })
  if (remembered) return remembered

  const byEmail = profile.email ? await findPatientByEmail(profile.email).catch(() => null) : null
  if (byEmail?.id) return byEmail.id

  const byUser = await findPatientByUserId(profile.id)
  if (byUser?.id) return byUser.id

  return null
}

/** Mescla/enriquece a lista com contas de portal (profiles + user_roles). */
async function mergePatientsWithPortalProfiles(list: Patient[]): Promise<Patient[]> {
  const roleUserIds = await fetchPatientRoleUserIds()
  if (roleUserIds.length === 0) return list

  const profiles = await fetchProfilesByUserIds(roleUserIds)
  if (profiles.length === 0) return list

  const merged = list.map((p) => ({ ...p }))
  const knownIds = () => new Set(merged.map((p) => p.id))

  for (const profile of profiles) {
    const profileName = (profile.full_name ?? "").trim()
    const existing = findPatientInList(merged, profile)

    if (existing) {
      const idx = merged.findIndex((p) => p.id === existing.id)
      if (idx < 0) continue
      const current = merged[idx]
      const nextName = profileName || current.name
      merged[idx] = {
        ...current,
        name: nextName,
        userId: current.userId ?? profile.id,
        email: current.email ?? profile.email,
        phone: current.phone || profile.phone || "",
        cpf: current.cpf || onlyDigits(profile.cpf) || "",
        dob: current.dob || profile.birth_date || "",
      }
      if (profileName) {
        rememberPatientLink({
          patientId: current.id,
          name: nextName,
          email: current.email ?? profile.email,
          cpf: current.cpf,
        })
      }
      if (!profile.patient_id) void syncProfilePatientLink(profile.id, current.id)
      continue
    }

    const resolvedId = await resolvePatientIdFromProfile(profile)
    const patientId = resolvedId ?? profile.id
    if (knownIds().has(patientId)) continue

    const row = resolvedId ? await findPatientById(resolvedId).catch(() => null) : null
    if (row) {
      merged.push(apiToPatient(row))
    } else {
      merged.push(profileToPatientEntry(profile, patientId))
    }

    rememberPatientLink({
      patientId,
      name: profileName || profile.email || "Paciente",
      email: profile.email,
      cpf: profile.cpf,
    })
    if (resolvedId && !profile.patient_id) void syncProfilePatientLink(profile.id, resolvedId)
  }

  return merged.filter((p) => !isRemovedPatientPlaceholder(p))
}

export async function getPatients(): Promise<Patient[]> {
  const primary = await fetchPatientsList()
  const userId = getApiUserId()

  let merged = primary
  if (userId) {
    const [createdByMe, tracked, linkedFallback] = await Promise.all([
      fetchPatientsCreatedBy(userId).catch(() => [] as Patient[]),
      fetchTrackedStaffPatients(userId),
      fetchLinkedPatientFallback(primary).catch(() => [] as Patient[]),
    ])
    merged = mergePatientsById(primary, [...createdByMe, ...tracked, ...linkedFallback])
  }

  merged = await mergePatientsWithPortalProfiles(merged).catch(() => merged)
  return attachPatientPhotos(merged)
}

export async function getPatientById(id: string): Promise<Patient | null> {
  if (!id) return null
  try {
    const data = await apiRequest<ApiPatient[]>(
      `/rest/v1/patients?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { logErrors: false },
    )
    const row = data?.[0]
    if (!row) return null
    return attachPatientPhoto(apiToPatient(row))
  } catch {
    return null
  }
}

export async function getPatientsForReports(): Promise<Patient[]> {
  const data = await apiRequest<ApiPatient[]>(
    "/rest/v1/patients?select=id,user_id,full_name,cpf,email,phone_mobile,birth_date&order=full_name.asc",
    { logErrors: false },
  )
  return (data ?? [])
    .map((row) => {
      const patient = apiToPatient(row)
      rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
      return patient
    })
    .filter((p) => !isRemovedPatientPlaceholder(p))
}

export async function createPatient(
  data: Omit<Patient, "id">
): Promise<Patient> {
  const payload = patientToApi(data)

  try {
    let created: ApiPatient[] | ApiPatient | undefined
    try {
      created = await createPatientValidated("/functions/v1/create-patient", payload)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err
      created = await createPatientValidated("/create-patient", payload)
    }

    const raw = extractCreatedPatient(created) ?? await findPatientByCpf(payload.cpf)
    if (!raw) throw new Error("Paciente criado, mas a API não retornou o registro cadastrado.")
    const mapped = apiToPatient(raw)
    const creatorId = mapped.createdBy ?? getApiUserId() ?? undefined
    const saved = await updatePatient({
      ...mapped,
      ...data,
      id: raw.id,
      ...(creatorId ? { createdBy: creatorId } : {}),
    })
    return stampPatientCreator(saved)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return createPatientDirect(data)
    }
    // create-patient pode gravar a ficha e falhar ao criar a conta Auth (500/400).
    // Remove o registro órfão para não poluir a lista nem bloquear nova tentativa.
    if (err instanceof ApiError && (err.status === 500 || err.status === 400 || err.status === 409)) {
      await rollbackOrphanFromEdgeFailure(
        typeof payload.cpf === "string" ? payload.cpf : onlyDigits(data.cpf),
        typeof payload.email === "string" ? payload.email : data.email,
      )
    }
    // O endpoint create-patient também tenta criar a conta de auth e falha
    // quando o e-mail já possui login (inclusive contas órfãs de cadastros
    // removidos). Nesse caso criamos apenas o registro do paciente via REST.
    if (isAlreadyRegisteredError(err)) {
      const existing = await findPatientByCpf(payload.cpf).catch(() => null)
      if (existing) {
        return updatePatient({ ...apiToPatient(existing), ...data, id: existing.id })
      }
      return createPatientDirect(data)
    }
    throw formatPatientCreateError(err)
  }
}

/**
 * Lançado quando o e-mail informado já possui uma conta de login no Supabase
 * Auth que não está vinculada a nenhum paciente (tipicamente uma conta órfã de
 * um cadastro removido). Não conseguimos recuperá-la pelos endpoints
 * disponíveis, então orientamos a usar outro e-mail ou removê-la no painel.
 */
export class OrphanAuthAccountError extends Error {
  readonly email: string
  constructor(email: string) {
    super(
      `O e-mail ${email} já possui uma conta de login órfã (sem paciente vinculado). ` +
      `Opções: (1) use outro e-mail; (2) cadastre sem marcar "Criar acesso ao portal"; ` +
      `(3) peça ao gestor para redefinir a senha pela lista de pacientes (ícone de chave); ` +
      `(4) remova a conta em Supabase → Authentication → Users e tente novamente.`,
    )
    this.name = "OrphanAuthAccountError"
    this.email = email
  }
}

export async function createPatientWithPassword(
  data: Omit<Patient, "id">,
  password: string,
): Promise<Patient> {
  if (!password.trim()) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (password.trim().length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")
  // Só a ficha clínica via REST — o endpoint create-patient também cria Auth e,
  // se falhar no meio, deixa pacientes órfãos na lista (e-mail/CPF já existentes).
  let created: Patient
  try {
    created = await createPatientDirect(data)
  } catch (err) {
    throw formatPatientCreateError(err)
  }
  try {
    return await createPatientPortalAccess(created, password)
  } catch (err) {
    // Falha ao criar o acesso: remove a ficha recém-criada (sem delete-user / gestor).
    await rollbackIncompletePatient(created.id)
    if (err instanceof OrphanAuthAccountError) {
      throw new Error(
        `${err.message} Você também pode salvar o paciente sem marcar "Criar acesso ao portal".`,
      )
    }
    if (err instanceof PatientPortalVerifyError) throw err
    throw formatPatientCreateError(err)
  }
}


async function findPatientByUserId(userId?: string): Promise<ApiPatient | null> {
  if (!userId) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0] ?? null
}


async function emailsForPortalLoginCheck(
  patient: Patient,
  formEmail: string,
  userId: string,
): Promise<string[]> {
  const out = new Set<string>()
  if (formEmail) out.add(formEmail.trim().toLowerCase())
  if (userId) {
    const rows = await apiRequest<Array<{ email?: string }>>(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=email&limit=1`,
      { logErrors: false },
    ).catch(() => [])
    const profileEmail = rows?.[0]?.email?.trim().toLowerCase()
    if (profileEmail) out.add(profileEmail)
  }
  const profile = await findProfileByEmail(formEmail)
  if (profile?.email) out.add(profile.email.trim().toLowerCase())
  const row = await findPatientById(patient.id)
  if (row?.email) out.add(row.email.trim().toLowerCase())
  return [...out]
}

async function sendPortalPasswordRecovery(emails: string[]): Promise<string> {
  const primary = emails[0]?.trim()
  if (primary) {
    try {
      await requestPasswordReset(primary)
      return `Enviamos um link para ${primary} redefinir a senha (verifique spam).`
    } catch {
      /* evita várias chamadas (429) */
    }
  }
  return "Use «Esqueci minha senha» na tela de entrada para redefinir o acesso."
}

async function assertPortalPasswordWorks(
  patient: Patient,
  formEmail: string,
  userId: string,
  password: string,
  hadExistingAccount: boolean,
): Promise<void> {
  const emails = await emailsForPortalLoginCheck(patient, formEmail, userId)
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const addr of emails) {
      if (await verifyPatientCredentials(addr, password)) return
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500))
  }

  const recovery = await sendPortalPasswordRecovery(emails)
  const message = hadExistingAccount
    ? "Este e-mail já tem conta e a senha não pôde ser definida da secretária. " + recovery
    : "Paciente salvo na clínica, mas o login com esta senha não foi confirmado. " + recovery
  throw new PatientPortalVerifyError(message, patient)
}

export async function createPatientPortalAccess(
  patient: Patient,
  password: string,
): Promise<Patient> {
  const base = patientToApi(patient)
  const cpf = onlyDigits(patient.cpf)
  if (!cpf || cpf.length !== 11) {
    throw new Error("CPF do paciente é obrigatório (11 dígitos) para criar o acesso ao portal.")
  }

  const normalizedPassword = password.trim()
  if (!normalizedPassword) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (normalizedPassword.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const formEmail = String(base.email ?? patient.email ?? "").trim().toLowerCase()
  if (!formEmail) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  const authEmail = await authEmailForPortal(patient, formEmail)

  const phoneMobile = onlyDigits(patient.phone) || String(base.phone_mobile ?? "")
  if (!/^\d{10,11}$/.test(phoneMobile)) {
    throw new Error("Celular é obrigatório (10 ou 11 dígitos) para criar o acesso do portal.")
  }

  const buildPayload = (emailForAuth: string): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      ...base,
      email: emailForAuth,
      patient_id: patient.id,
      password: normalizedPassword,
      role: "paciente",
      create_patient_record: false,
      phone: phoneMobile,
      phone_mobile: phoneMobile,
    }
    if (typeof window !== "undefined") {
      body.redirect_url = window.location.origin
    }
    return body
  }

  let response: CreateUserWithPasswordResponse | null = null
  let hadExistingAccount = false
  try {
    response = await createPatientUser(buildPayload(formEmail))
  } catch (err) {
    if (!isAlreadyRegisteredError(err)) throw err
    hadExistingAccount = true
    if (authEmail !== formEmail) {
      try {
        response = await createPatientUser(buildPayload(authEmail))
        hadExistingAccount = false
      } catch (retryErr) {
        if (!isAlreadyRegisteredError(retryErr)) throw retryErr
      }
    }
    if (!response) {
      try {
        response = await createPatientUser({
          patient_id: patient.id,
          email: authEmail,
          password: normalizedPassword,
          role: "paciente",
          create_patient_record: false,
        })
      } catch {
        /* mantém hadExistingAccount */
      }
    }
  }

  if (!response && hadExistingAccount) {
    throw new Error(
      "Este e-mail já tem conta no sistema. Use «Esqueci minha senha» na tela de entrada para redefinir o acesso.",
    )
  }
  if (!response) {
    throw new Error("Não foi possível criar o acesso do paciente. Verifique os dados e tente novamente.")
  }

  const userId = createdUserId(response) || (await resolvePortalAuthUserId(formEmail, patient, response))
  if (!userId) {
    throw new Error(response.message || "Usuário paciente não foi criado pela API.")
  }

  await finalizePatientPortalAccess(patient, userId, formEmail)
  await assertPortalPasswordWorks(patient, formEmail, userId, normalizedPassword, hadExistingAccount)

  return updatePatient({ ...patient, userId })
}

/** Redefine senha e revincula o portal sem apagar o cadastro clínico (secretária pode usar). */
export async function resetPatientPortalPassword(
  patient: Patient,
  newPassword: string,
): Promise<Patient> {
  return createPatientPortalAccess(patient, newPassword)
}

async function persistPatientPhoto(patient: Patient): Promise<Patient> {
  const clearing = patient.photoUrl === "" || patient.photoUrl === null
  if (clearing) {
    await deletePatientPhotoFromStorage(patient.id).catch(() => undefined)
    return { ...patient, photoUrl: undefined }
  }
  if (!patient.photoUrl) return patient
  if (!isDataUrl(patient.photoUrl) && isRemotePhotoUrl(patient.photoUrl)) return patient

  const photoUrl = await resolvePatientPhotoUrl(patient.id, patient.photoUrl)
  return { ...patient, photoUrl }
}

export async function updatePatient(patient: Patient): Promise<Patient> {
  if (isRemovedPatientPlaceholder(patient)) {
    throw new Error("Paciente removido não pode ser editado.")
  }
  const linkedProfile = patient.userId ? null : await findProfileByEmail(patient.email)
  const patientWithUser = linkedProfile?.id ? { ...patient, userId: linkedProfile.id } : patient
  const patientWithPhoto = await persistPatientPhoto(patientWithUser)

  await patchPatientWithFallback(patientWithPhoto.id, patientWithPhoto)

  rememberPatientLink({
    patientId: patientWithPhoto.id,
    name: patientWithPhoto.name,
    email: patientWithPhoto.email,
    cpf: patientWithPhoto.cpf,
  })
  return patientWithPhoto
}

async function deletePatientDependencies(id: string): Promise<void> {
  const patientId = encodeURIComponent(id)

  const ignoreMissing = (err: unknown) => {
    if (isMissingResource(err)) return
    throw err
  }

  async function listDependencyRows(table: string, required = false): Promise<Array<{ id: string }>> {
    try {
      return await apiRequest<Array<{ id: string }>>(
      `/rest/v1/${table}?patient_id=eq.${patientId}&select=id`,
      { logErrors: false },
      )
    } catch (err) {
      if (!required && isMissingResource(err)) return []
      throw err
    }
  }

  async function deleteRow(table: string, rowId: string, required = false): Promise<void> {
    const encodedId = encodeURIComponent(rowId)
    await apiRequest(`/rest/v1/${table}?id=eq.${encodedId}`, {
      method: "DELETE",
      headers: { Prefer: required ? "return=representation" : "return=minimal" },
      logErrors: false,
    }).catch((err) => {
      if (!required) return ignoreMissing(err)
      throw err
    })
  }

  async function deleteRowsByPatient(table: string, required = false): Promise<void> {
    const rows = await listDependencyRows(table, required)

    if (table === "appointments" && rows.length > 0) {
      const placeholderPatientId = await getDeletedPatientPlaceholderId()
      await apiRequest(`/rest/v1/appointments?patient_id=eq.${patientId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          patient_id: placeholderPatientId,
          status: "cancelled",
          notes: "Paciente original removido pelo perfil gestor.",
        },
        logErrors: false,
      }).catch((err) => {
        if (!isMissingResource(err)) {
          console.warn("[patients] nao foi possivel desvincular agendamentos antes da exclusao:", err)
        }
      })

      let remaining = await listDependencyRows(table, required)
      if (remaining.length === 0) return

      await Promise.all(remaining.map((row) =>
        deleteRow(table, row.id, false).catch((err) => {
          if (!isMissingResource(err)) {
            console.warn("[patients] exclusao de agendamento vinculado falhou, mantendo tentativa por paciente_id:", err)
          }
        }),
      ))
      await apiRequest(`/rest/v1/${table}?patient_id=eq.${patientId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
        logErrors: false,
      }).catch(ignoreMissing)

      remaining = await listDependencyRows(table, required)
      if (remaining.length > 0) {
        throw new Error(
          `A API não removeu ${remaining.length} registro(s) de ${table} vinculados ao paciente. ` +
          "O backend precisa permitir mover esses agendamentos para o paciente técnico de exclusão.",
        )
      }
      return
    }

    await Promise.all(rows.map((row) => deleteRow(table, row.id, required)))

    await apiRequest(`/rest/v1/${table}?patient_id=eq.${patientId}`, {
      method: "DELETE",
      headers: { Prefer: required ? "return=representation" : "return=minimal" },
      logErrors: false,
    }).catch((err) => {
      if (!required) return ignoreMissing(err)
      throw err
    })

    const remaining = await listDependencyRows(table, required)

    if (remaining.length > 0) {
      throw new Error(
        `A API não removeu ${remaining.length} registro(s) de ${table} vinculados ao paciente. ` +
        "O perfil gestor precisa ter permissão de DELETE nessa tabela antes de excluir o paciente.",
      )
    }
  }

  await deleteRowsByPatient("appointments", true)
  await deleteRowsByPatient("reports")
  await deleteRowsByPatient("patient_assignments")
}

async function deletePatientRecord(id: string, logErrors = true): Promise<void> {
  const patientId = encodeURIComponent(id)

  await apiRequest(`/rest/v1/patients?id=eq.${patientId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
    logErrors,
  })
}

export async function deletePatient(id: string): Promise<void> {
  const patient = await findPatientById(id).catch(() => null)
  if (patient && isRemovedPatientPlaceholder(apiToPatient(patient))) {
    throw new Error("Este registro técnico não pode ser removido.")
  }
  const userId = patient?.user_id ?? ""

  if (userId) {
    await deletePatientAuthUser(userId)
    return
  }

  try {
    await deletePatientDependencies(id)
  } catch (err) {
    if (!isBlockedDependencyDelete(err)) throw err
    throw err
  }

  try {
    await deletePatientRecord(id, false)
    return
  } catch (err) {
    if (!isDeleteBlockedByDependency(err)) throw err
  }

  await deletePatientDependencies(id)
  try {
    await deletePatientRecord(id)
    return
  } catch (err) {
    if (!isDeleteBlockedByDependency(err)) throw err
  }

  throw new Error("A API bloqueou a exclusão porque ainda existem vínculos com este paciente sem user_id.")
}
