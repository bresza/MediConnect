import { ApiError, apiRequest, getApiUserId } from "./api"
import { isRemovedPatientPlaceholder, REMOVED_PATIENT_CPF, REMOVED_PATIENT_EMAIL, REMOVED_PATIENT_NAME } from "../utils/removedPatient"
import { isDataUrl, isRemotePhotoUrl, resolvePatientPhotoUrl, attachPatientPhotos, attachPatientPhoto, deletePatientPhotoFromStorage } from "./patientPhoto"
import { rememberPatientLink } from "./patientLinks"
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
}

export interface PatientIdentity {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
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
    if (!isSchemaMismatch(err)) throw err
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
  return updatePatient({ ...patient, ...data, id: patient.id })
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
  return response.user?.id ?? response.user_id ?? ""
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
  })

  const minimalPayload = compactPayload({
    id: userId,
    full_name: data.name.trim(),
    email: data.email?.trim(),
    phone: onlyDigits(data.phone),
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

async function resolveOrphanUserId(email: string, patient: Patient): Promise<string> {
  if (patient.userId) return patient.userId
  const profile = await findProfileByEmail(email)
  if (profile?.id) return profile.id
  const row = await findPatientByEmail(email)
  if (row?.user_id) return row.user_id
  return ""
}

function isAlreadyRegisteredError(err: unknown): boolean {
  return err instanceof Error &&
    /already been registered|already registered|email.*registered|email.*exists|usu[aá]rio.*existe|e-?mail.*cadastrado/i.test(err.message)
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

async function syncResolvedPatientProfile(userId: string | undefined, patient: ApiPatient): Promise<void> {
  if (!userId) return

  await apiRequest(`/rest/v1/patients?id=eq.${encodeURIComponent(patient.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId },
    logErrors: false,
  }).catch(() => undefined)
}

async function linkPatientToUser(patientId: string, userId: string): Promise<void> {
  if (!patientId || !userId) return
  await apiRequest(`/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId },
    logErrors: false,
  }).catch((err) => {
    console.warn("[patients] vinculo user_id do paciente falhou:", err)
  })
}

export async function getPatientByIdentity(identity: PatientIdentity): Promise<Patient | null> {
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
  await syncResolvedPatientProfile(identity.userId, best)
  return attachPatientPhoto(apiToPatient(best))
}

export async function getPatients(): Promise<Patient[]> {
  // Tenta com `order=full_name.asc`; se o projeto Supabase nao tiver a
  // coluna `full_name` (alguns esquemas usam `name` ou outro layout), o
  // PostgREST devolve 400. Nesse caso refazemos sem o `order` para
  // evitar erro no console e ordenamos client-side por nome.
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
  const patients = (data ?? [])
    .map((row) => {
      const patient = apiToPatient(row)
      rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
      return patient
    })
    .filter((p) => !isRemovedPatientPlaceholder(p))
  return attachPatientPhotos(patients)
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
    return updatePatient({ ...apiToPatient(raw), ...data, id: raw.id })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return createPatientDirect(data)
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
    throw err
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
  const created = await createPatient(data)
  try {
    return await createPatientPortalAccess(created, password)
  } catch (err) {
    // Falha ao criar o acesso: desfaz o paciente recém-criado para não deixar
    // registros órfãos/duplicados, e propaga o erro claro.
    await deletePatient(created.id).catch(() => undefined)
    if (err instanceof OrphanAuthAccountError) {
      throw new Error(
        `${err.message} Você também pode salvar o paciente sem marcar "Criar acesso ao portal".`,
      )
    }
    throw err
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function findPatientByUserId(userId?: string): Promise<ApiPatient | null> {
  if (!userId) return null
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0] ?? null
}

async function createPatientUserWithRetry(
  payload: Record<string, unknown>,
  attempts = 4,
): Promise<string> {
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      return createdUserId(await createPatientUser(payload))
    } catch (err) {
      lastErr = err
      if (!isAlreadyRegisteredError(err)) throw err
      await delay(1000)
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Não foi possível criar o acesso do paciente.")
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

  const email = String(base.email ?? "").trim().toLowerCase()
  const payload = {
    email,
    password:   password.trim(),
    full_name:  String(base.full_name ?? patient.name).trim(),
    cpf,
    phone:      base.phone_mobile,
    role:       "paciente",
    patient_id: patient.id,
  }

  if (!payload.email) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  if (!payload.password) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (payload.password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  let userId = ""
  try {
    userId = createdUserId(await createPatientUser(payload))
  } catch (err) {
    if (!isAlreadyRegisteredError(err)) throw err

    // O e-mail já tem conta de login. Como a unicidade de e-mail entre pacientes
    // é validada antes, essa conta é necessariamente órfã (de um cadastro
    // removido). Para definir a senha escolhida sem depender de e-mail,
    // removemos a conta órfã e a recriamos já com a nova senha.
    const orphanId = await resolveOrphanUserId(email, patient)
    if (!orphanId) throw new OrphanAuthAccountError(email)

    // Segurança: nunca remover uma conta vinculada a OUTRO paciente real.
    const linked = await findPatientByUserId(orphanId)
    if (linked && linked.id !== patient.id) {
      throw new Error(
        `O e-mail ${email} já pertence a outro paciente com acesso ao portal. Use outro e-mail.`,
      )
    }

    try {
      await deletePatientAuthUser(orphanId)
    } catch {
      throw new OrphanAuthAccountError(email)
    }
    await delay(1000)
    userId = await createPatientUserWithRetry(payload)
  }

  if (!userId) throw new Error("Não foi possível criar o acesso do paciente.")

  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, patient)
  await linkPatientToUser(patient.id, userId)

  return updatePatient({ ...patient, userId })
}

function patientToCreatableData(patient: Patient): Omit<Patient, "id"> {
  // Remove campos que não devem ser reenviados na recriação (id/userId/datas
  // de auditoria) preservando todos os dados demográficos do paciente.
  const { id: _id, userId: _userId, ...rest } = patient
  void _id; void _userId
  return { ...rest }
}

/**
 * Define uma nova senha de portal para o paciente SEM depender de e-mail.
 *
 * O backend compartilhado não expõe endpoint admin de "set password" e o
 * `delete-user` remove o paciente junto com a conta de auth. Portanto, para
 * trocar a senha de uma conta já existente, recriamos o registro do paciente
 * (mesmos dados) e a conta de auth já com a nova senha. Isso mantém o paciente
 * visível na lista e com uma senha conhecida.
 *
 * Atenção: como o registro é recriado, ele recebe um novo identificador. Dados
 * históricos vinculados ao identificador antigo (consultas/laudos anteriores)
 * não são transferidos automaticamente.
 */
export async function resetPatientPortalPassword(
  patient: Patient,
  newPassword: string,
): Promise<Patient> {
  const pwd = newPassword.trim()
  if (pwd.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const base = patientToApi(patient)
  const email = String(base.email ?? "").trim().toLowerCase()
  if (!email) throw new Error("E-mail obrigatório para redefinir o acesso do paciente.")
  const cpf = onlyDigits(patient.cpf)
  if (!cpf || cpf.length !== 11) {
    throw new Error("CPF do paciente é obrigatório (11 dígitos) para redefinir o acesso.")
  }

  const existingUserId = await resolveOrphanUserId(email, patient)

  // Snapshot dos dados do paciente ANTES de remover (o delete-user apaga o
  // registro do paciente junto com a conta de auth).
  const snapshot = patientToCreatableData(patient)

  // Remove a conta de auth atual (e, no backend, o paciente vinculado).
  if (existingUserId) {
    try {
      await deletePatientAuthUser(existingUserId)
    } catch {
      throw new Error(
        "Não foi possível remover a conta atual do paciente para redefinir a senha. " +
        "Verifique se você tem permissão de gestor/administrador e tente novamente.",
      )
    }
    // Aguarda a remoção propagar antes de recriar com o mesmo e-mail/CPF.
    await delay(1000)
  }

  // Recria o registro do paciente já com a conta de portal e a nova senha.
  // Tenta algumas vezes enquanto o backend ainda reportar e-mail "registrado".
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await createPatientWithPassword(snapshot, pwd)
    } catch (err) {
      lastErr = err
      // E-mail ainda consta como registrado (remoção não propagou). Tenta de novo.
      if (isAlreadyRegisteredError(err)) {
        await delay(1200)
        continue
      }
      throw err
    }
  }

  throw new Error(
    lastErr instanceof Error
      ? `Não foi possível concluir a redefinição: ${lastErr.message}`
      : "Não foi possível concluir a redefinição da senha. Tente novamente em instantes.",
  )
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
