import { ApiError, apiRequest, getApiUserId } from "./api"
import { rememberPatientLink } from "./patientLinks"
import type {
  Patient, Gender, PatientStatus, MaritalStatus,
  Ethnicity, CommunicationChannel, CommunicationFrequency,
  EmergencyContact, Address,
} from "../types"

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

interface PatientIdentity {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
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
    gender:                 api.gender as Gender | undefined,
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

function patientToFullApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  return compactPayload({
    full_name:    p.name?.trim(),
    cpf:          onlyDigits(p.cpf),
    email:        p.email?.trim(),
    phone_mobile: onlyDigits(p.phone),
    birth_date:   p.dob,
    gender:       p.gender,
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
    observations:            p.observations,
    preferred_channel:       p.preferredChannel,
    communication_frequency: p.communicationFrequency,
    opt_in:                  p.optIn,
    behavior_score:          p.behaviorScore,
    photo_url:               p.photoUrl,
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

function patientToApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  const payload = patientToFullApi(p)
  return compactPayload({
    full_name:    payload.full_name,
    cpf:          payload.cpf,
    email:        payload.email,
    phone_mobile: payload.phone_mobile,
    birth_date:   payload.birth_date,
  })
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
  return patient
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
    return await createPatientUserWithPassword("/create-user-with-password", payload)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return createPatientUserWithPassword("/functions/v1/create-user-with-password", payload)
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
  const rows = await apiRequest<ApiProfile[]>(
    `/rest/v1/profiles?email=eq.${encodeURIComponent(email.trim())}&select=*&limit=1`,
  ).catch(() => [])
  return rows?.[0] ?? null
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
  const email = "paciente.removido@mediconnect.local"
  const cpf = "52998224725"
  const existing = await findPatientByEmail(email) ?? await findPatientByCpf(cpf)
  if (existing?.id) return existing.id

  const payload = compactPayload({
    full_name: "Paciente removido",
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
        full_name: "Paciente removido",
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
  return apiToPatient(best)
}

export async function getPatients(): Promise<Patient[]> {
  const data = await apiRequest<ApiPatient[]>(
    "/rest/v1/patients?select=*&order=full_name.asc",
  )
  return (data ?? []).map((row) => {
    const patient = apiToPatient(row)
    rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
    return patient
  })
}

export async function getPatientsForReports(): Promise<Patient[]> {
  const data = await apiRequest<ApiPatient[]>(
    "/rest/v1/patients?select=id,user_id,full_name,cpf,email,phone_mobile,birth_date&order=full_name.asc",
    { logErrors: false },
  )
  return (data ?? []).map((row) => {
    const patient = apiToPatient(row)
    rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
    return patient
  })
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
    throw err
  }
}

export async function createPatientWithPassword(
  data: Omit<Patient, "id">,
  password: string,
): Promise<Patient> {
  const base = patientToApi(data)
  const payload = {
    ...base,
    password: password.trim(),
    role: "paciente",
    create_patient_record: true,
    phone: base.phone_mobile,
    phone_mobile: base.phone_mobile,
    redirect_url: window.location.origin,
  }

  if (!base.email) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  if (!payload.password) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (payload.password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const response = await createPatientUser(payload)
  const userId = createdUserId(response)
  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, data)

  const rawById = await findPatientById(response.patient_id)
  if (rawById) {
    await linkPatientToUser(rawById.id, userId)
    return updatePatient({ ...apiToPatient(rawById), ...data, id: rawById.id, userId })
  }

  let raw = await findPatientByCpf(base.cpf)
  if (!raw) {
    const created = await createPatientDirect(data)
    await linkPatientToUser(created.id, userId)
    raw = await findPatientById(created.id)
    if (!raw) return { ...created, userId }
  }
  if (!raw) throw new Error(response.message || "Usuário criado, mas o paciente não foi retornado pela API.")
  await linkPatientToUser(raw.id, userId)
  return updatePatient({ ...apiToPatient(raw), ...data, id: raw.id, userId })
}

export async function createPatientPortalAccess(
  patient: Patient,
  password: string,
): Promise<Patient> {
  const base = patientToApi(patient)
  const payload = {
    ...base,
    patient_id: patient.id,
    password: password.trim(),
    role: "paciente",
    create_patient_record: false,
    phone: base.phone_mobile,
    phone_mobile: base.phone_mobile,
    redirect_url: window.location.origin,
  }

  if (!base.email) throw new Error("E-mail obrigatório para criar acesso do paciente.")
  if (!payload.password) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (payload.password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  let response: CreateUserWithPasswordResponse | null = null
  let userId = ""
  try {
    response = await createPatientUser(payload)
    userId = createdUserId(response)
  } catch (err) {
    if (!isAlreadyRegisteredError(err)) throw err
    userId = (await findProfileByEmail(String(base.email ?? "")))?.id ?? ""
  }

  if (!userId) throw new Error(response?.message || "Usuário paciente não foi criado pela API.")

  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, patient)
  await linkPatientToUser(patient.id, userId)

  return updatePatient({ ...patient, userId })
}

export async function updatePatient(patient: Patient): Promise<Patient> {
  const linkedProfile = patient.userId ? null : await findProfileByEmail(patient.email)
  const patientWithUser = linkedProfile?.id ? { ...patient, userId: linkedProfile.id } : patient

  try {
    await apiRequest(`/rest/v1/patients?id=eq.${patientWithUser.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: patientToFullApi(patientWithUser),
      logErrors: false,
    })
  } catch (err) {
    if (!isSchemaMismatch(err)) throw err
    await apiRequest(`/rest/v1/patients?id=eq.${patientWithUser.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: patientToApi(patientWithUser),
    })
  }
  rememberPatientLink({ patientId: patientWithUser.id, name: patientWithUser.name, email: patientWithUser.email, cpf: patientWithUser.cpf })
  return patientWithUser
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
