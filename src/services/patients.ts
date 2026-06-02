import { ApiError, apiRequest, getApiUserId } from "./api"
import { requestPasswordReset, verifyPatientCredentials } from "./auth"
import { isMissingColumnError } from "./schemaSafe"
import { isRemovedPatientPlaceholder, REMOVED_PATIENT_CPF, REMOVED_PATIENT_EMAIL, REMOVED_PATIENT_NAME } from "../utils/removedPatient"
import {
  isDataUrl,
  isRemotePhotoUrl,
  resolveAvatarPhotoUrl,
  attachPatientPhotos,
  attachPatientPhoto,
  deleteAvatarFromStorage,
} from "./patientPhoto"
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
  sex?:                     string
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

/** Cadastro clínico ok, mas o teste de login com a senha informada falhou. */
export class PatientPortalVerifyError extends Error {
  readonly patient: Patient

  constructor(message: string, patient: Patient) {
    super(message)
    this.name = "PatientPortalVerifyError"
    this.patient = patient
  }
}

function mapSexFromApi(sex?: string): Gender | undefined {
  if (!sex?.trim()) return undefined
  const normalized = sex.trim().toLowerCase()
  if (
    normalized.startsWith("masc") ||
    normalized === "male" ||
    normalized === "m" ||
    normalized === "masculino"
  ) {
    return "Male"
  }
  if (
    normalized.startsWith("fem") ||
    normalized === "female" ||
    normalized === "f" ||
    normalized === "feminino"
  ) {
    return "Female"
  }
  if (normalized.startsWith("out") || normalized === "outro" || normalized === "other") {
    return "Other"
  }
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
    gender:                 (api.gender as Gender | undefined) ?? mapSexFromApi(api.sex),
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
    sex:          mapGenderToSex(p.gender),
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
  const minimal = compactPayload({
    full_name:    payload.full_name,
    cpf:          payload.cpf,
    email:        payload.email,
    phone_mobile: payload.phone_mobile,
    birth_date:   payload.birth_date,
  })
  return minimal
}

function mapGenderToSex(gender?: Gender): string | undefined {
  if (!gender) return undefined
  const map: Record<Gender, string> = {
    Male: "Masculino",
    Female: "Feminino",
    Other: "Outro",
  }
  return map[gender]
}

function mapMaritalStatusToApi(status?: MaritalStatus): string | undefined {
  if (!status) return undefined
  const map: Record<MaritalStatus, string> = {
    Single: "Solteiro(a)",
    Married: "Casado(a)",
    Divorced: "Divorciado(a)",
    Widowed: "Viúvo(a)",
    StableUnion: "União Estável",
  }
  return map[status]
}

function patientToCreatePatientApi(p: Omit<Patient, "id"> | Patient): Record<string, unknown> {
  return compactPayload({
    full_name: p.name?.trim(),
    social_name: p.socialName?.trim(),
    email: p.email?.trim().toLowerCase(),
    cpf: onlyDigits(p.cpf),
    rg: p.rg?.trim(),
    birth_date: p.dob,
    phone_mobile: onlyDigits(p.phone),
    phone1: onlyDigits(p.landline),
    phone2: onlyDigits(p.alternativePhone),
    sex: mapGenderToSex(p.gender),
    race: p.race?.trim(),
    ethnicity: p.ethnicity,
    nationality: p.nationality?.trim(),
    naturality: p.birthplace?.trim(),
    profession: p.occupation?.trim(),
    marital_status: mapMaritalStatusToApi(p.maritalStatus),
    mother_name: p.motherName?.trim(),
    mother_profession: p.motherOccupation?.trim(),
    father_name: p.fatherName?.trim(),
    father_profession: p.fatherOccupation?.trim(),
    guardian_name: p.guardianName?.trim(),
    guardian_cpf: onlyDigits(p.guardianCpf),
    spouse_name: p.spouseName?.trim(),
    cep: onlyDigits(p.address?.zipCode),
    street: p.address?.street?.trim(),
    number: p.address?.number?.trim(),
    complement: p.address?.complement?.trim(),
    neighborhood: p.address?.neighborhood?.trim(),
    city: p.address?.city?.trim(),
    state: p.address?.state?.trim().toUpperCase(),
    reference: p.address?.reference?.trim(),
    legacy_code: p.legacyCode?.trim(),
    rn_in_insurance: p.isNewbornOnInsurance,
    vip: p.isVip,
    notes: p.observations?.trim(),
  })
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validateCreatePatientPayload(payload: Record<string, unknown>): void {
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : ""
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
  const cpf = typeof payload.cpf === "string" ? payload.cpf : ""
  const phoneMobile = typeof payload.phone_mobile === "string" ? payload.phone_mobile : ""

  if (!fullName) throw new Error("Nome completo é obrigatório para criar paciente.")
  if (!email) throw new Error("E-mail é obrigatório para criar paciente.")
  if (!isValidEmail(email)) throw new Error("E-mail inválido para criar paciente.")
  if (!/^\d{11}$/.test(cpf)) throw new Error("CPF deve conter exatamente 11 dígitos numéricos.")
  if (!phoneMobile) throw new Error("Celular é obrigatório para criar paciente.")
}

function validateCreatePatientFunctionPayload(payload: Record<string, unknown>): void {
  validateCreatePatientPayload(payload)
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : ""
  const phoneMobile = typeof payload.phone_mobile === "string" ? payload.phone_mobile : ""
  if (fullName.length < 3) {
    throw new Error("Nome completo deve ter ao menos 3 caracteres.")
  }
  if (!/^\d{10,11}$/.test(phoneMobile)) {
    throw new Error("Celular deve conter 10 ou 11 dígitos numéricos.")
  }
}

function patientToPatchApi(p: Patient): Record<string, unknown> {
  return compactPayload({
    full_name: p.name?.trim(),
    email: p.email?.trim(),
    phone_mobile: onlyDigits(p.phone),
    birth_date: p.dob,
    sex: mapGenderToSex(p.gender),
  })
}

/** Mesmos campos do POST `create-patient` / Edge `update-patient` (contrato RiseUP). */
function patientToExtendedPatchApi(p: Patient): Record<string, unknown> {
  return patientToCreatePatientApi(p)
}

function uniquePayloadAttempts(payloads: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  return payloads.filter((payload) => {
    if (Object.keys(payload).length === 0) return false
    const key = JSON.stringify(payload)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildPatientPatchPayloads(patient: Patient): Record<string, unknown>[] {
  return uniquePayloadAttempts([
    patientToExtendedPatchApi(patient),
    patientToPatchApi(patient),
    patientToFullApi(patient),
    patientToApi(patient),
  ])
}

function isSchemaMismatch(err: unknown): boolean {
  return err instanceof ApiError &&
    err.status === 400 &&
    (
      /schema cache|could not find|column|PGRST204|unexpected|unknown/i.test(err.message) ||
      /invalid input value.*(gender|sex|status|marital_status|ethnicity|preferred_channel|communication_frequency)/i.test(err.message)
    )
}

function sexFieldPayloads(gender?: Gender): Record<string, unknown>[] {
  if (!gender) return []
  const label = mapGenderToSex(gender)
  const attempts: Record<string, unknown>[] = []
  if (label) attempts.push({ sex: label })
  attempts.push({ gender })
  if (gender === "Male") {
    attempts.push({ sex: "M" }, { sex: "male" }, { sex: "Masculino" })
  }
  if (gender === "Female") {
    attempts.push({ sex: "F" }, { sex: "female" }, { sex: "Feminino" })
  }
  if (gender === "Other") {
    attempts.push({ sex: "Outro" }, { sex: "other" })
  }
  return attempts.map((body) => compactPayload(body)).filter((body) => Object.keys(body).length > 0)
}

function isAuthDenied(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

function patientUpdateDeniedMessage(err: unknown): Error {
  if (isAuthDenied(err)) {
    return new Error(
      "Sem permissão para atualizar este paciente. Saia e entre novamente; se o erro continuar, " +
      "peça ao gestor para liberar a edição de pacientes (RLS) ou publicar a Edge Function update-patient.",
    )
  }
  return err instanceof Error ? err : new Error("Não foi possível atualizar o paciente.")
}

async function patchPatientOnRest(patientId: string, body: Record<string, unknown>): Promise<void> {
  if (Object.keys(body).length === 0) {
    throw new Error("Nenhum dado válido para atualizar.")
  }

  await apiRequest<void>(
    `/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body,
      logErrors: false,
    },
  )
}

/** Atualização via Edge Function (contorna RLS do PostgREST para secretaria/recepção). */
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

async function tryPersistWithFallbacks(
  patientId: string,
  payloads: Record<string, unknown>[],
): Promise<void> {
  let lastErr: unknown

  for (const body of payloads) {
    if (Object.keys(body).length === 0) continue

    try {
      await patchPatientOnRest(patientId, body)
      return
    } catch (err) {
      lastErr = err
      const denied = isAuthDenied(err) ||
        (err instanceof ApiError && err.status === 403)

      if (denied || isSchemaMismatch(err)) {
        try {
          await updatePatientViaEdgeFunction(patientId, body)
          return
        } catch (edgeErr) {
          lastErr = edgeErr
          if (edgeErr instanceof ApiError && edgeErr.status === 404) {
            if (denied) throw patientUpdateDeniedMessage(err)
            continue
          }
          if (denied) throw patientUpdateDeniedMessage(edgeErr)
        }
        continue
      }
      throw err
    }
  }

  console.warn("[patients] atualização falhou após todas as tentativas:", lastErr)
  throw patientUpdateDeniedMessage(lastErr)
}

async function persistPatientGender(patientId: string, gender?: Gender): Promise<void> {
  if (!gender) return

  const current = await findPatientById(patientId)
  if (current && apiToPatient(current).gender === gender) return

  for (const body of sexFieldPayloads(gender)) {
    try {
      await patchPatientOnRest(patientId, body)
      return
    } catch (err) {
      if (isSchemaMismatch(err) || isAuthDenied(err)) {
        try {
          await updatePatientViaEdgeFunction(patientId, body)
          return
        } catch (edgeErr) {
          if (!(edgeErr instanceof ApiError && edgeErr.status === 404)) continue
        }
        continue
      }
    }
  }

  throw new Error(
    "Não foi possível gravar o sexo biológico no servidor. O time da API precisa liberar o campo sex/gender em patients ou publicar update-patient.",
  )
}

async function assertPatientGenderPersisted(patientId: string, gender?: Gender): Promise<void> {
  if (!gender) return
  const row = await findPatientById(patientId)
  if (row && apiToPatient(row).gender === gender) return
  throw new Error(
    "O sexo biológico não foi confirmado após salvar. Tente novamente; se persistir, peça ao time da API revisar o campo sex na tabela patients.",
  )
}

async function persistPatientRecord(
  patientId: string,
  patient: Patient,
): Promise<void> {
  const extended = patientToExtendedPatchApi(patient)

  if (getApiUserId()) {
    try {
      await updatePatientViaEdgeFunction(patientId, extended)
      if (patient.gender) {
        await persistPatientGender(patientId, patient.gender)
        await assertPatientGenderPersisted(patientId, patient.gender)
      }
      return
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        console.warn("[patients] update-patient edge falhou, tentando REST:", err)
      }
    }
  }

  await tryPersistWithFallbacks(patientId, buildPatientPatchPayloads(patient))
  if (patient.gender) {
    await persistPatientGender(patientId, patient.gender)
    await assertPatientGenderPersisted(patientId, patient.gender)
  }
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
  const createdBy = getApiUserId() ?? undefined
  if (!createdBy) {
    throw new Error("Sessão inválida. Faça login novamente para cadastrar pacientes.")
  }

  const required = compactPayload({
    full_name: data.name?.trim(),
    cpf: onlyDigits(data.cpf),
    email: data.email?.trim(),
    phone_mobile: onlyDigits(data.phone),
  })
  if (!required.full_name || !required.cpf || !required.email || !required.phone_mobile) {
    throw new Error("Nome, CPF, e-mail e celular são obrigatórios para criar paciente diretamente pela API.")
  }

  const payloadAttempts = uniquePayloadAttempts([
    compactPayload({ ...patientToFullApi(data), created_by: createdBy }),
    compactPayload({ ...patientToApi(data), created_by: createdBy }),
    compactPayload({ ...required, birth_date: data.dob || undefined, created_by: createdBy }),
    compactPayload({ ...required, created_by: createdBy }),
  ])

  let created: ApiPatient[] | ApiPatient | undefined
  let lastErr: unknown
  for (const payload of payloadAttempts) {
    try {
      created = await apiRequest<ApiPatient[] | ApiPatient | undefined>(
        "/rest/v1/patients",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: payload,
          logErrors: false,
        },
      )
      break
    } catch (err) {
      lastErr = err
      if (isSchemaMismatch(err)) continue
      throw err
    }
  }

  if (!created) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Não foi possível criar o paciente pela API.")
  }

  const raw = extractCreatedPatient(created) ?? await findPatientByCpf(String(required.cpf))
  if (!raw) throw new Error("Paciente criado, mas a API não retornou o registro cadastrado.")
  const patient = apiToPatient(raw)
  rememberOwnPatientLink(patient)
  return updatePatient({ ...patient, ...data, id: patient.id })
}

async function ensurePatientRole(userId: string): Promise<void> {
  if (!userId) return

  const existing = await apiRequest<{ user_id: string; role: string }[]>(
    `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role=eq.paciente&select=user_id,role&limit=1`,
  ).catch(() => [])
  if (existing?.length) return

  try {
    await apiRequest("/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { user_id: userId, role: "paciente" },
      logErrors: false,
    })
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
      return
    }
    const detail = err instanceof ApiError ? err.message : ""
    console.warn("[user_roles] sincronizacao de paciente falhou:", detail || err)
  }
}

async function ensurePatientProfile(
  userId: string,
  data: Omit<Patient, "id"> | Patient,
): Promise<void> {
  if (!userId) return

  const profileEmail = data.email?.trim().toLowerCase()
  const fullPayload = compactPayload({
    id: userId,
    full_name: data.name.trim(),
    email: profileEmail,
    phone: onlyDigits(data.phone),
    role: "paciente",
  })

  const minimalPayload = compactPayload({
    id: userId,
    full_name: data.name.trim(),
    email: profileEmail,
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
  const rows = await apiRequest<ApiProfile[]>(
    `/rest/v1/profiles?email=eq.${encodeURIComponent(normalized)}&select=id,email,full_name,patient_id&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0] ?? null
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
  const normalized = email.trim().toLowerCase()
  const rows = await apiRequest<ApiPatient[]>(
    `/rest/v1/patients?email=eq.${encodeURIComponent(normalized)}&select=*&limit=1`,
    { logErrors: false },
  ).catch(() => [])
  return rows?.[0] ?? null
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

/** Celular válido (10–11 dígitos) — a API rejeita 00000000000 no paciente técnico. */
const DELETED_PATIENT_PLACEHOLDER_PHONE = "11999990001"

async function deletePatientAuthUser(userId?: string): Promise<boolean> {
  if (!userId) return false

  try {
    await apiRequest("/delete-user", {
      method: "POST",
      body: { userId },
      logErrors: false,
    })
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) return false
    if (!(err instanceof ApiError) || err.status !== 404) return false
  }

  try {
    await apiRequest("/functions/v1/delete-user", {
      method: "POST",
      body: { userId },
      logErrors: false,
    })
    return true
  } catch {
    return false
  }
}

async function ensurePlaceholderPatientPhone(patientId: string): Promise<void> {
  await apiRequest(`/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { phone_mobile: DELETED_PATIENT_PLACEHOLDER_PHONE },
    logErrors: false,
  }).catch(() => undefined)
}

async function getDeletedPatientPlaceholderId(): Promise<string> {
  const email = REMOVED_PATIENT_EMAIL
  const cpf = REMOVED_PATIENT_CPF
  const existing = await findPatientByEmail(email) ?? await findPatientByCpf(cpf)
  if (existing?.id) {
    const phone = onlyDigits(existing.phone_mobile)
    if (!phone || phone === "00000000000" || !/^\d{10,11}$/.test(phone)) {
      await ensurePlaceholderPatientPhone(existing.id)
    }
    return existing.id
  }

  const payload = compactPayload({
    full_name: REMOVED_PATIENT_NAME,
    cpf,
    email,
    phone_mobile: DELETED_PATIENT_PLACEHOLDER_PHONE,
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
        phone_mobile: DELETED_PATIENT_PLACEHOLDER_PHONE,
        birth_date: "1900-01-01",
      },
      logErrors: false,
    })
  }

  const raw = extractCreatedPatient(created) ?? await findPatientByEmail(email) ?? await findPatientByCpf(cpf)
  if (!raw?.id) throw new Error("A API não permitiu criar o paciente técnico para preservar vínculos antigos.")
  return raw.id
}

/** Cache local só para o próprio login de paciente (não ao listar todos como staff). */
function rememberOwnPatientLink(patient: Patient): void {
  const sessionUserId = getApiUserId()
  if (!sessionUserId) return
  const ownerId = patient.userId ?? sessionUserId
  if (ownerId !== sessionUserId) return
  rememberPatientLink({
    authUserId: sessionUserId,
    patientId: patient.id,
    name: patient.name,
    email: patient.email,
    cpf: patient.cpf,
  })
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

  // Só grava user_id no paciente quando o vínculo é forte (evita “colar” admin em paciente alheio).
  const matchScore = scorePatientMatch(best, identity)
  if (identity.userId && matchScore >= 40) {
    await syncResolvedPatientProfile(identity.userId, best)
  }

  const resolved = apiToPatient(best)
  rememberOwnPatientLink(resolved)
  return attachPatientPhoto(resolved)
}

export interface GetPatientsOptions {
  search?: string
  limit?: number
  offset?: number
  /** Skip storage photo batch on list views (load on profile). */
  skipPhotos?: boolean
  /** Full row for detail views. */
  fullSelect?: boolean
}

/**
 * Contrato da API de listagem de pacientes:
 * GET /rest/v1/patients?select&limit&offset&order&full_name&cpf
 * Response base: id, full_name, cpf, email, phone_mobile
 */
const CORE_PATIENT_SELECT =
  "id,user_id,full_name,cpf,email,phone_mobile,birth_date"

function pickLatestDate(a?: string, b?: string): string | undefined {
  if (!a?.trim()) return b?.trim()?.slice(0, 10) || undefined
  if (!b?.trim()) return a.trim().slice(0, 10)
  const dayA = a.trim().slice(0, 10)
  const dayB = b.trim().slice(0, 10)
  return dayA >= dayB ? dayA : dayB
}

/** Última consulta passada (não cancelada) por paciente, a partir de `appointments`. */
async function fetchLastVisitByPatientId(): Promise<Map<string, string>> {
  const now = new Date().toISOString()
  try {
    const rows = await apiRequest<Array<{ patient_id: string; scheduled_at: string }>>(
      `/rest/v1/appointments?select=patient_id,scheduled_at&status=neq.cancelled&scheduled_at=lte.${encodeURIComponent(now)}&order=scheduled_at.desc`,
      { logErrors: false },
    )
    const map = new Map<string, string>()
    for (const row of rows ?? []) {
      if (!row.patient_id || !row.scheduled_at) continue
      if (map.has(row.patient_id)) continue
      map.set(row.patient_id, row.scheduled_at.slice(0, 10))
    }
    return map
  } catch {
    return new Map()
  }
}

async function enrichPatientsWithLastVisit(patients: Patient[]): Promise<Patient[]> {
  if (patients.length === 0) return patients
  const fromAppointments = await fetchLastVisitByPatientId()
  return patients.map((patient) => {
    const merged = pickLatestDate(patient.lastVisit, fromAppointments.get(patient.id))
    if (!merged || merged === patient.lastVisit) return patient
    return { ...patient, lastVisit: merged }
  })
}

function buildPatientsListPath(
  select: string,
  options: Pick<GetPatientsOptions, "search" | "limit" | "offset">,
): string {
  const params = new URLSearchParams()
  params.set("select", select)
  params.set("order", "full_name.asc")
  if (options.search?.trim()) {
    const rawSearch = options.search.trim()
    const cpf = onlyDigits(rawSearch)
    if (cpf && cpf.length >= 11) {
      params.set("cpf", `eq.${cpf}`)
    } else {
      params.set("full_name", `ilike.*${rawSearch}*`)
    }
  }
  if (options.limit != null) params.set("limit", String(options.limit))
  if (options.offset != null) params.set("offset", String(options.offset))
  return `/rest/v1/patients?${params.toString()}`
}

export async function getPatients(options: GetPatientsOptions = {}): Promise<Patient[]> {
  const {
    search,
    limit,
    offset,
    skipPhotos = false,
    fullSelect = false,
  } = options

  const selectAttempts = fullSelect ? ["*"] : [CORE_PATIENT_SELECT, "*"]
  let data: ApiPatient[] | null = null
  let lastError: unknown

  for (const select of selectAttempts) {
    try {
      data = await apiRequest<ApiPatient[]>(
        buildPatientsListPath(select, { search, limit, offset }),
        { logErrors: false },
      )
      break
    } catch (err) {
      lastError = err
      if (isMissingColumnError(err) && select !== "*") continue
      throw err
    }
  }
  if (!data) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Não foi possível carregar pacientes da API.")
  }
  const patients = (data ?? [])
    .map((row) => {
      const patient = apiToPatient(row)
      rememberPatientLink({ patientId: patient.id, name: patient.name, email: patient.email, cpf: patient.cpf })
      return patient
    })
    .filter((p) => !isRemovedPatientPlaceholder(p))
  const withLastVisit = await enrichPatientsWithLastVisit(patients)
  if (skipPhotos || !fullSelect) return withLastVisit
  return attachPatientPhotos(withLastVisit)
}

export async function getPatientById(id: string): Promise<Patient | null> {
  if (!id) return null
  const selects = ["*", CORE_PATIENT_SELECT]
  for (const select of selects) {
    try {
      const data = await apiRequest<ApiPatient[]>(
        `/rest/v1/patients?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`,
        { logErrors: false },
      )
      const row = data?.[0]
      if (!row) continue
      const patient = apiToPatient(row)
      const withPhoto = select === "*" ? await attachPatientPhoto(patient) : patient
      if (select === "*" || row.sex || row.gender) return withPhoto
      continue
    } catch (err) {
      if (isMissingColumnError(err) && select !== "*") continue
      if (select === "*") return null
    }
  }
  return null
}

export async function getPatientsForReports(): Promise<Patient[]> {
  const data = await apiRequest<ApiPatient[]>(
    "/rest/v1/patients?select=id,full_name,cpf,email,phone_mobile&order=full_name.asc",
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
  const payload = patientToCreatePatientApi(data)
  validateCreatePatientFunctionPayload(payload)

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
  const normalizedPassword = password.trim()
  if (!normalizedPassword) throw new Error("Senha obrigatória para criar acesso do paciente.")
  if (normalizedPassword.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  const base = patientToApi(data)
  const formEmail = String(base.email ?? data.email ?? "").trim().toLowerCase()
  if (!formEmail) throw new Error("E-mail obrigatório para criar acesso do paciente.")

  const cpf = onlyDigits(data.cpf)
  if (!cpf || cpf.length !== 11) {
    throw new Error("CPF do paciente é obrigatório (11 dígitos) para criar o acesso ao portal.")
  }

  const phoneMobile = onlyDigits(data.phone) || String(base.phone_mobile ?? "")
  if (!/^\d{10,11}$/.test(phoneMobile)) {
    throw new Error("Celular é obrigatório (10 ou 11 dígitos) para criar o acesso do portal.")
  }

  const payload: Record<string, unknown> = {
    ...base,
    email: formEmail,
    password: normalizedPassword,
    role: "paciente",
    create_patient_record: true,
    phone: phoneMobile,
    phone_mobile: phoneMobile,
  }
  if (typeof window !== "undefined") {
    payload.redirect_url = window.location.origin
  }

  const response = await createPatientUser(payload)
  const userId = createdPatientUserId(response)
  if (!userId) {
    throw new Error(response.message || "Usuário paciente não foi criado pela API.")
  }

  let raw =
    (response.patient_id ? await findPatientById(response.patient_id) : null) ??
    (await findPatientByCpf(cpf)) ??
    (await findPatientByEmail(formEmail))
  if (!raw) {
    throw new Error(response.message || "Usuário criado, mas o paciente não foi retornado pela API.")
  }

  await linkPatientToUser(raw.id, userId)
  rememberPatientLink({
    authUserId: userId,
    patientId: raw.id,
    name: data.name,
    email: formEmail,
    cpf: data.cpf,
  })

  const patient = await updatePatient({ ...apiToPatient(raw), ...data, id: raw.id, userId })
  await assertPortalPasswordWorks(patient, formEmail, userId, normalizedPassword, false)
  return patient
}

async function finalizePatientPortalAccess(
  patient: Patient,
  userId: string,
  email: string,
): Promise<void> {
  await ensurePatientRole(userId)
  await ensurePatientProfile(userId, patient)
  await linkPatientToUser(patient.id, userId)
  rememberPatientLink({
    authUserId: userId,
    patientId: patient.id,
    name: patient.name,
    email,
    cpf: patient.cpf,
  })
}

interface CreateUserWithPasswordResponse {
  success?: boolean
  id?: string
  user?: { id?: string; email?: string }
  user_id?: string
  message?: string
  patient_id?: string
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

function createdPatientUserId(response: CreateUserWithPasswordResponse): string {
  return response.user?.id ?? response.user_id ?? response.id ?? ""
}

async function resolvePortalAuthUserId(
  email: string,
  patient: Patient,
  response: CreateUserWithPasswordResponse | null,
): Promise<string> {
  const fromApi = response ? createdPatientUserId(response) : ""
  if (fromApi) return fromApi
  if (patient.userId?.trim()) return patient.userId.trim()
  const profile = await findProfileByEmail(email)
  if (profile?.id) return profile.id
  const row = await findPatientById(patient.id)
  return row?.user_id?.trim() ?? ""
}

async function emailsForPortalLoginCheck(
  patient: Patient,
  formEmail: string,
  userId: string,
): Promise<string[]> {
  const out = new Set<string>()
  out.add(formEmail)
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

/**
 * Acesso ao portal pela secretária/gestor/admin — `create-user-with-password` + teste de login.
 */
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

  const userId = createdPatientUserId(response) || (await resolvePortalAuthUserId(formEmail, patient, response))
  if (!userId) {
    throw new Error(response.message || "Usuário paciente não foi criado pela API.")
  }

  await finalizePatientPortalAccess(patient, userId, formEmail)
  await assertPortalPasswordWorks(patient, formEmail, userId, normalizedPassword, hadExistingAccount)

  return updatePatient({ ...patient, userId })
}

async function persistPatientPhoto(patient: Patient): Promise<Patient> {
  const storageUserId = patient.userId?.trim()
  try {
    const clearing = patient.photoUrl === "" || patient.photoUrl === null
    if (clearing) {
      if (storageUserId) {
        await deleteAvatarFromStorage(storageUserId).catch(() => undefined)
      }
      return { ...patient, photoUrl: undefined }
    }
    if (!patient.photoUrl) return patient
    if (!isDataUrl(patient.photoUrl) && isRemotePhotoUrl(patient.photoUrl)) {
      return patient
    }
    if (!storageUserId) {
      console.warn("[patients] foto ignorada: paciente sem user_id vinculado (Storage exige id do usuário auth).")
      return { ...patient, photoUrl: undefined }
    }

    const photoUrl = await resolveAvatarPhotoUrl(storageUserId, patient.photoUrl)
    return { ...patient, photoUrl }
  } catch (err) {
    console.warn("[patients] foto não salva; cadastro segue sem alterar a imagem:", err)
    const keepRemote = patient.photoUrl && isRemotePhotoUrl(patient.photoUrl) ? patient.photoUrl : undefined
    return { ...patient, photoUrl: keepRemote }
  }
}

export async function updatePatient(patient: Patient): Promise<Patient> {
  if (isRemovedPatientPlaceholder(patient)) {
    throw new Error("Paciente removido não pode ser editado.")
  }
  const linkedProfile = patient.userId ? null : await findProfileByEmail(patient.email)
  const patientWithUser = linkedProfile?.id ? { ...patient, userId: linkedProfile.id } : patient
  const patientWithPhoto = await persistPatientPhoto(patientWithUser)

  await persistPatientRecord(patientWithPhoto.id, patientWithPhoto)

  const fresh = await getPatientById(patientWithPhoto.id)
  const result = fresh
    ? {
        ...fresh,
        userId: patientWithPhoto.userId ?? fresh.userId,
        photoUrl: patientWithPhoto.photoUrl ?? fresh.photoUrl,
        gender: fresh.gender ?? patientWithPhoto.gender,
      }
    : patientWithPhoto

  rememberOwnPatientLink(result)
  return result
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
      await apiRequest(`/rest/v1/appointments?patient_id=eq.${patientId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
        logErrors: false,
      }).catch((err) => {
        if (!isMissingResource(err)) {
          console.warn("[patients] exclusao em massa de agendamentos falhou, tentando desvincular:", err)
        }
      })

      let remaining = await listDependencyRows(table, required)
      if (remaining.length === 0) return

      try {
        const placeholderPatientId = await getDeletedPatientPlaceholderId()
        await apiRequest(`/rest/v1/appointments?patient_id=eq.${patientId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: {
            patient_id: placeholderPatientId,
            status: "cancelled",
          },
          logErrors: false,
        })
        remaining = await listDependencyRows(table, required)
        if (remaining.length === 0) return
      } catch (err) {
        if (!isMissingResource(err)) {
          console.warn("[patients] nao foi possivel desvincular agendamentos para paciente tecnico:", err)
        }
      }

      await Promise.all(remaining.map((row) =>
        deleteRow(table, row.id, false).catch((err) => {
          if (!isMissingResource(err)) {
            console.warn("[patients] exclusao de agendamento vinculado falhou:", err)
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
          `Ainda há ${remaining.length} agendamento(s) vinculados a este paciente. ` +
          "A API precisa permitir excluir ou transferir esses registros (perfil admin/gestor).",
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

    if (remaining.length > 0 && required) {
      throw new Error(
        `Ainda há ${remaining.length} registro(s) em ${table} vinculados ao paciente. ` +
        "Verifique permissões de exclusão na API para admin/gestor.",
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
    await deletePatientAuthUser(userId).catch((err) => {
      console.warn("[patients] nao foi possivel remover usuario auth vinculado:", err)
    })
  }

  try {
    // Fluxo principal documentado na API: DELETE /rest/v1/patients?id=eq.{id}
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
