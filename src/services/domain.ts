import { apiRequest, ApiError, getApiUserId } from "./api"
import { formatSpecialtyLabel } from "../utils"
import type {
  MedicalRecord, Prescription, Report, ReportStatus,
  Message, StaffMember, StaffRole, StaffStatus,
  MedicalRecordStatus, PrescriptionMedication, PrescriptionType,
} from "../types"

// ─────────────────────────────────────────────────────────────────
// REPORTS — campos exatos conforme Schema da API
// ─────────────────────────────────────────────────────────────────
interface ApiReport {
  id:             string
  order_number?:  string
  patient_id:     string
  // enum report_status na API atual: "draft" | "delivered".
  // Aceitamos legados "completed", "finalized" e "sent" apenas na leitura.
  status?:        string
  exam?:          string
  requested_by?:  string
  cid_code?:      string
  diagnosis?:     string
  conclusion?:    string
  content_html?:  string
  content_json?:  unknown
  hide_date?:     boolean
  hide_signature?: boolean
  due_at?:        string
  created_by?:    string
  updated_by?:    string
  created_at?:    string
  updated_at?:    string
  // joins opcionais
  patients?:      { full_name: string } | null
  profiles?:      { full_name: string } | null
}

function statusToFrontend(s?: string): ReportStatus {
  // "delivered" e o valor canonico do enum atual; demais nomes ficam como fallback de leitura.
  if (s === "delivered") return "Finalized"
  if (s === "completed") return "Finalized"
  if (s === "finalized") return "Finalized"
  if (s === "sent")      return "Sent"
  return "Draft"
}
function statusToApi(s: ReportStatus): string {
  // Alinhado com prontuarios, receitas e financeiro (que ja gravam em reports usando "delivered").
  if (s === "Finalized") return "delivered"
  if (s === "Sent")      return "delivered"
  return "draft"
}

function apiToReport(api: ApiReport): Report {
  return {
    id:            api.id,
    patientId:     api.patient_id,
    patientName:   api.patients?.full_name  ?? "",
    doctorId:      api.created_by           ?? api.requested_by ?? "",
    doctorName:    api.profiles?.full_name  ?? "",  // populated when available
    type:          api.exam                 ?? "Laudo Médico",
    exam:          api.exam,
    diagnosis:     api.diagnosis,
    conclusion:    api.conclusion,
    content:       api.content_html         ?? "",
    contentHtml:   api.content_html         ?? "",
    cid10:         api.cid_code             ?? "",
    date:          api.created_at ? api.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    status:        statusToFrontend(api.status),
    hideDate:      api.hide_date            ?? false,
    hideSignature: api.hide_signature       ?? false,
    orderNumber:   api.order_number,
    requestedBy:   api.requested_by,
  }
}

// ReportInput exato conforme schema da API
function reportToApi(
  r: Partial<Report> & { patientId: string },
): Record<string, unknown> {
  const uid = getApiUserId()
  return {
    patient_id:     r.patientId,
    status:         statusToApi(r.status ?? "Draft"),
    exam:           r.type   ?? r.exam ?? "Laudo Médico",
    requested_by:   uid ?? r.requestedBy ?? undefined,
    cid_code:       r.cid10  ?? "",
    diagnosis:      r.diagnosis ?? r.content ?? "",
    conclusion:     r.conclusion ?? "",
    content_html:   r.contentHtml ?? r.content ?? "",
    content_json:   {},
    hide_date:      r.hideDate      ?? false,
    hide_signature: r.hideSignature ?? false,
  };
}

export async function getReports(): Promise<Report[]> {
  const [reports, patients, doctors, profiles] = await Promise.all([
    apiRequest<ApiReport[]>("/rest/v1/reports?select=*&order=created_at.desc"),
    apiRequest<ApiPatientName[]>("/rest/v1/patients?select=id,full_name"),
    apiRequest<ApiDoctorName[]>("/rest/v1/doctors?select=id,full_name"),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=id,full_name"),
  ])

  const patientMap = new Map((patients ?? []).map((p) => [p.id, p.full_name]))
  const doctorMap = new Map([
    ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
    ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
  ])

  return (reports ?? [])
    .filter((report) =>
      report.exam !== MEDICAL_RECORD_EXAM &&
      report.exam !== PRESCRIPTION_EXAM &&
      report.exam !== FINANCIAL_RECORD_EXAM)
    .map((report) => ({
      ...apiToReport(report),
      patientName: patientMap.get(report.patient_id) ?? "",
      doctorName: doctorMap.get(report.created_by ?? report.requested_by ?? "") ?? "",
    }))
}

export async function createReport(
  data: Partial<Report> & { patientId: string },
): Promise<Report> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: reportToApi(data),
  })

  const raw  = Array.isArray(created) ? created[0] : (created as ApiReport)
  return {
    ...apiToReport(raw),
    patientName: data.patientName ?? "",
    doctorName: data.doctorName ?? "",
  }
}

export async function updateReport(report: Report): Promise<Report> {
  await apiRequest(`/rest/v1/reports?id=eq.${report.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: reportToApi(report),
  })
  return report
}

// ─────────────────────────────────────────────────────────────────
// STAFF — criação via endpoint correto da API
// ─────────────────────────────────────────────────────────────────
interface ApiDoctor {
  id: string; full_name: string; email?: string; phone?: string; phone_mobile?: string
  cpf?: string; crm?: string; crm_uf?: string; crm_state?: string; specialty?: string
  active?: boolean; created_at?: string
}
interface ApiProfile {
  id: string; full_name: string; email?: string
  /** Na tabela `profiles` do projeto atual o telefone vem em `phone`. */
  phone?: string
  cpf?: string
  disabled?: boolean; created_at?: string
}

/** Tabela operacional `public.secretaries` (user_id = auth.users.id). */
interface ApiSecretary {
  id?: string
  user_id?: string
  full_name: string
  email?: string
  phone?: string
  cpf?: string
  department?: string
  active?: boolean
  created_at?: string
}

/** Tabela operacional `public.managers`. */
interface ApiManager {
  id?: string
  user_id?: string
  full_name: string
  email?: string
  phone?: string
  cpf?: string
  department?: string
  active?: boolean
  created_at?: string
}

function staffPhoneFromApi(api: { phone?: string | null; phone_mobile?: string | null }): string {
  const mobile = api.phone_mobile?.trim()
  const main = api.phone?.trim()
  return main || mobile || ""
}
interface ApiUserRole {
  user_id: string; role: string
}
interface CreateUserWithPasswordResponse {
  success?: boolean
  user?: {
    id: string
    email: string
    full_name: string
    roles: string[]
    email_confirmed_at: string | null
  }
  user_id?: string
  message?: string
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) =>
      value !== undefined &&
      value !== null &&
      value !== "",
    ),
  )
}

function addressToDoctorApi(address?: StaffMember["address"]): Record<string, unknown> {
  if (!address) return {}
  return compactPayload({
    cep: address.zipCode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
  })
}

async function deleteAuthUserAt(
  path: string,
  userId: string,
): Promise<void> {
  await apiRequest(path, {
    method: "POST",
    body: { userId },
    logErrors: false,
  })
}

const MEDICAL_RECORD_EXAM = "Registro Clínico"
const PRESCRIPTION_EXAM = "Receita Médica"
const FINANCIAL_RECORD_EXAM = "Registro Financeiro"

function apiDoctorToStaff(api: ApiDoctor): StaffMember {
  const cpfDigits = api.cpf?.replace(/\D/g, "") ?? ""
  return {
    id:        api.id,
    name:      api.full_name,
    role:      "doctor" as StaffRole,
    email:     api.email   ?? "",
    phone:     staffPhoneFromApi(api),
    cpf:       cpfDigits || undefined,
    status:    (api.active !== false ? "Active" : "Inactive") as StaffStatus,
    crm:       api.crm ? `${api.crm}-${api.crm_uf ?? api.crm_state ?? ""}` : undefined,
    specialty: api.specialty ? formatSpecialtyLabel(api.specialty) : undefined,
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}
function roleToStaffRole(role?: string | null): StaffRole | null {
  const normalized = (role ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  const roleMap: Record<string, StaffRole> = {
    admin: "manager", administrador: "manager",
    medico: "doctor", doctor: "doctor",
    gestor: "manager", manager: "manager",
    secretaria: "secretary", secretary: "secretary",
  }
  return roleMap[normalized] ?? null
}

function apiProfileToStaff(api: ApiProfile, role: StaffRole): StaffMember {
  const cpfDigits = api.cpf?.replace(/\D/g, "")
  return {
    id:        api.id,
    name:      api.full_name,
    role,
    email:     api.email ?? "",
    phone:     staffPhoneFromApi(api),
    cpf:       cpfDigits ? cpfDigits : undefined,
    status:    (api.disabled ? "Inactive" : "Active") as StaffStatus,
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

function operationalUserId(api: { id?: string; user_id?: string }): string {
  return api.user_id ?? api.id ?? ""
}

function apiSecretaryToStaff(api: ApiSecretary): StaffMember {
  const id = operationalUserId(api)
  const cpfDigits = api.cpf?.replace(/\D/g, "") ?? ""
  return {
    id,
    name:       api.full_name,
    role:       "secretary",
    email:      api.email ?? "",
    phone:      staffPhoneFromApi(api),
    cpf:        cpfDigits || undefined,
    department: api.department?.trim() || undefined,
    status:     (api.active !== false ? "Active" : "Inactive") as StaffStatus,
    createdAt:  api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

function apiManagerToStaff(api: ApiManager): StaffMember {
  const id = operationalUserId(api)
  const cpfDigits = api.cpf?.replace(/\D/g, "") ?? ""
  return {
    id,
    name:       api.full_name,
    role:       "manager",
    email:      api.email ?? "",
    phone:      staffPhoneFromApi(api),
    cpf:        cpfDigits || undefined,
    department: api.department?.trim() || undefined,
    status:     (api.active !== false ? "Active" : "Inactive") as StaffStatus,
    createdAt:  api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

function normalizeStaffText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function staffIdentityKeys(member: StaffMember): string[] {
  const email = normalizeStaffText(member.email)
  const name = normalizeStaffText(member.name)
  return [
    member.id ? `id:${member.id}` : "",
    email ? `email:${email}` : "",
    name ? `role-name:${member.role}:${name}` : "",
  ].filter(Boolean)
}

/** Erros de query PostgREST em GET de lista (coluna/order) — tenta variante seguinte. */
function isRetryableStaffListError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 400 || err.status === 406)
}

/** Medicos da equipe: tenta varias queries para evitar 400 (coluna/order incompativel). */
async function loadDoctorsForStaff(): Promise<ApiDoctor[]> {
  const paths = [
    "/rest/v1/doctors?select=*&order=full_name.asc",
    "/rest/v1/doctors?select=*",
    "/rest/v1/doctors?select=id,full_name,email,cpf,crm,crm_uf,specialty,phone,phone_mobile,active,created_at&order=full_name.asc",
    "/rest/v1/doctors?select=id,full_name,email,cpf,crm,crm_uf,specialty,phone,phone_mobile,active,created_at",
    "/rest/v1/doctors?select=id,full_name,email,crm,crm_uf,specialty&order=full_name.asc",
    "/rest/v1/doctors?select=id,full_name,email,crm,crm_uf,specialty",
  ]
  let lastErr: unknown
  for (const path of paths) {
    try {
      return await apiRequest<ApiDoctor[]>(path, { logErrors: false })
    } catch (err) {
      lastErr = err
      if (isRetryableStaffListError(err)) continue
      throw err
    }
  }
  console.warn("[getStaff] nao foi possivel carregar doctors com nenhuma variante de query:", lastErr)
  return []
}

/** Perfis da equipe: comeca pelo select minimo para evitar 400 no console (F12). */
async function loadProfilesForStaff(): Promise<ApiProfile[]> {
  const paths = [
    "/rest/v1/profiles?select=id,full_name,email&order=full_name.asc",
    "/rest/v1/profiles?select=id,full_name,email",
    "/rest/v1/profiles?select=id,full_name,email,created_at&order=full_name.asc",
    "/rest/v1/profiles?select=id,full_name,email,created_at",
    "/rest/v1/profiles?select=id,full_name,email,phone,created_at&order=full_name.asc",
    "/rest/v1/profiles?select=id,full_name,email,phone,created_at",
    "/rest/v1/profiles?select=*&order=full_name.asc",
    "/rest/v1/profiles?select=*",
  ]
  let lastErr: unknown
  for (const path of paths) {
    try {
      return await apiRequest<ApiProfile[]>(path, { logErrors: false })
    } catch (err) {
      lastErr = err
      if (isRetryableStaffListError(err)) continue
      throw err
    }
  }
  console.warn("[getStaff] nao foi possivel carregar profiles com nenhuma variante de query:", lastErr)
  return []
}

async function loadSecretariesForStaff(): Promise<ApiSecretary[]> {
  const paths = [
    "/rest/v1/secretaries?select=*&order=full_name.asc",
    "/rest/v1/secretaries?select=*",
    "/rest/v1/secretaries?select=user_id,full_name,email,cpf,phone,department,active,created_at&order=full_name.asc",
    "/rest/v1/secretaries?select=user_id,full_name,email,cpf,phone,department,active,created_at",
  ]
  let lastErr: unknown
  for (const path of paths) {
    try {
      return await apiRequest<ApiSecretary[]>(path, { logErrors: false })
    } catch (err) {
      lastErr = err
      if (isRetryableStaffListError(err)) continue
      if (err instanceof ApiError && err.status === 404) return []
      throw err
    }
  }
  console.warn("[getStaff] nao foi possivel carregar secretaries:", lastErr)
  return []
}

async function loadManagersForStaff(): Promise<ApiManager[]> {
  const paths = [
    "/rest/v1/managers?select=*&order=full_name.asc",
    "/rest/v1/managers?select=*",
    "/rest/v1/managers?select=user_id,full_name,email,cpf,phone,department,active,created_at&order=full_name.asc",
    "/rest/v1/managers?select=user_id,full_name,email,cpf,phone,department,active,created_at",
  ]
  let lastErr: unknown
  for (const path of paths) {
    try {
      return await apiRequest<ApiManager[]>(path, { logErrors: false })
    } catch (err) {
      lastErr = err
      if (isRetryableStaffListError(err)) continue
      if (err instanceof ApiError && err.status === 404) return []
      throw err
    }
  }
  console.warn("[getStaff] nao foi possivel carregar managers:", lastErr)
  return []
}

export async function getStaff(): Promise<StaffMember[]> {
  const [doctors, secretaries, managers, profiles, userRoles] = await Promise.all([
    loadDoctorsForStaff(),
    loadSecretariesForStaff(),
    loadManagersForStaff(),
    loadProfilesForStaff(),
    apiRequest<ApiUserRole[]>("/rest/v1/user_roles?select=user_id,role", { logErrors: false }).catch(() => []),
  ])
  const doctorStaff     = (doctors ?? []).map(apiDoctorToStaff)
  const secretaryStaff  = (secretaries ?? []).map(apiSecretaryToStaff).filter((m) => m.id)
  const managerStaff    = (managers ?? []).map(apiManagerToStaff).filter((m) => m.id)
  const roleByUserId = new Map(
    (userRoles ?? [])
      .map((item) => [item.user_id, roleToStaffRole(item.role)] as const)
      .filter(([, role]) => role !== null) as Array<[string, StaffRole]>,
  )
  const profileStaff = (profiles ?? [])
    .map((profile) => {
      const role = roleByUserId.get(profile.id)
      return role ? apiProfileToStaff(profile, role) : null
    })
    .filter((member): member is StaffMember => member !== null)

  const seen = new Set<string>()
  const addUnique = (members: StaffMember[]) => members.filter((member) => {
    const keys = staffIdentityKeys(member)
    if (keys.some((key) => seen.has(key))) return false
    keys.forEach((key) => seen.add(key))
    return true
  })

  return [
    ...addUnique(doctorStaff),
    ...addUnique(secretaryStaff),
    ...addUnique(managerStaff),
    ...addUnique(profileStaff),
  ].sort((a, b) => a.name.localeCompare(b.name))
}

export interface DoctorExtra {
  cpf: string; crmNum: string; crmUf: string; specialty: string
}

const STAFF_ROLE_API: Record<StaffRole, string> = {
  doctor: "medico",
  manager: "gestor",
  secretary: "secretaria",
}

function assertStaffCreateFields(
  data: Omit<StaffMember, "id" | "createdAt">,
  password: string,
  doctorExtra?: DoctorExtra,
): string {
  const cpf = (doctorExtra?.cpf || data.cpf || "").replace(/\D/g, "")
  if (!data.email.trim()) throw new Error("E-mail obrigatório")
  if (!password.trim()) throw new Error("Senha obrigatória")
  if (password.trim().length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres")
  if (!data.name.trim()) throw new Error("Nome obrigatório")
  if (!data.phone?.trim()) throw new Error("Telefone obrigatório")
  if (!cpf || cpf.length !== 11) throw new Error("CPF obrigatório (11 dígitos)")
  if (data.role === "secretary" || data.role === "manager") {
    if (!data.department?.trim()) throw new Error("Departamento obrigatório")
  }
  if (data.role === "doctor") {
    if (!doctorExtra) throw new Error("Dados do médico incompletos")
    if (!doctorExtra.crmNum.trim()) throw new Error("CRM obrigatório")
    if (!doctorExtra.crmUf.trim()) throw new Error("UF do CRM obrigatória")
    if (!doctorExtra.specialty.trim()) throw new Error("Especialidade obrigatória")
  }
  return cpf
}

function staffCreationPermissionError(err: ApiError): Error {
  if (err.status === 401) {
    return new Error("Sessão expirada. Saia, entre novamente e tente outra vez.")
  }
  if (err.status === 403) {
    return new Error(
      "Sem permissão para criar usuários. Apenas administrador, gestor e secretária podem cadastrar a equipe.",
    )
  }
  return err
}

async function postCreateUserWithPassword(
  body: Record<string, unknown>,
): Promise<CreateUserWithPasswordResponse> {
  try {
    return await apiRequest<CreateUserWithPasswordResponse>(
      "/functions/v1/create-user-with-password",
      { method: "POST", body: compactPayload(body), logErrors: false },
    )
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        return apiRequest<CreateUserWithPasswordResponse>("/create-user-with-password", {
          method: "POST",
          body: compactPayload(body),
        })
      }
      throw staffCreationPermissionError(err)
    }
    throw err
  }
}

async function postCreateDoctor(
  body: Record<string, unknown>,
): Promise<CreateUserWithPasswordResponse> {
  try {
    return await apiRequest<CreateUserWithPasswordResponse>("/functions/v1/create-doctor", {
      method: "POST",
      body: compactPayload(body),
      logErrors: false,
    })
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        return apiRequest<CreateUserWithPasswordResponse>("/create-doctor", {
          method: "POST",
          body: compactPayload(body),
        })
      }
      throw staffCreationPermissionError(err)
    }
    throw err
  }
}

function createdStaffUserId(res: CreateUserWithPasswordResponse): string {
  const id = res?.user?.id ?? res?.user_id ?? ""
  if (!id) throw new Error(res?.message || "Erro ao criar usuário na API")
  return id
}

/**
 * Cadastro de equipe conforme mapa da API RiseUP:
 * - médico → create-doctor (auth + profiles + user_roles + doctors)
 * - gestor/secretária/admin → create-user-with-password (+ managers/secretaries)
 */
export async function createStaffMember(
  data:         Omit<StaffMember, "id" | "createdAt">,
  password:     string,
  doctorExtra?: DoctorExtra,
): Promise<StaffMember> {
  const cpf = assertStaffCreateFields(data, password, doctorExtra)

  if (data.role === "doctor") {
    const extra = doctorExtra!
    const doctorPayload = compactPayload({
      email:         data.email.trim(),
      password:      password.trim(),
      full_name:     data.name.trim(),
      cpf,
      crm:           extra.crmNum.trim(),
      crm_uf:        extra.crmUf.trim().toUpperCase(),
      specialty:     extra.specialty.trim(),
      phone:         data.phone || undefined,
      phone_mobile:  data.phone || undefined,
      phone2:        data.phone2 || undefined,
      rg:            data.rg || undefined,
      active:        data.status !== "Inactive",
      temp_password: data.tempPassword || password.trim(),
      ...addressToDoctorApi(data.address),
    })
    const res = await postCreateDoctor(doctorPayload)
    const userId = createdStaffUserId(res)
    return {
      ...data,
      id:        userId,
      cpf,
      crm:       `${extra.crmNum}-${extra.crmUf.toUpperCase()}`,
      specialty: extra.specialty,
      createdAt: new Date().toISOString().slice(0, 10),
    }
  }

  const payload = compactPayload({
    email:      data.email.trim(),
    password:   password.trim(),
    full_name:  data.name.trim(),
    cpf,
    phone:      data.phone?.trim() || undefined,
    role:       STAFF_ROLE_API[data.role] ?? "secretaria",
    department:
      data.role === "secretary" || data.role === "manager"
        ? data.department?.trim()
        : undefined,
  })

  const res = await postCreateUserWithPassword(payload)
  const userId = createdStaffUserId(res)

  return {
    ...data,
    id:        userId,
    cpf,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

export async function updateStaffMember(member: StaffMember): Promise<StaffMember> {
  await apiRequest(`/rest/v1/profiles?id=eq.${member.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: compactPayload({
      full_name: member.name,
      phone:     member.phone,
      cpf:       member.cpf?.replace(/\D/g, "") || undefined,
    }),
    logErrors: false,
  }).catch((err) => {
    console.warn("[profiles] sincronizacao de equipe falhou:", err)
  })

  const operationalBody = compactPayload({
    full_name:  member.name,
    email:      member.email,
    phone:      member.phone,
    cpf:        member.cpf?.replace(/\D/g, "") || undefined,
    active:     member.status !== "Inactive",
    department: member.department?.trim() || undefined,
  })

  if (member.role === "doctor") {
    const [crm = "", crmUf = ""] = (member.crm ?? "").split("-")
    try {
      await apiRequest(`/rest/v1/doctors?user_id=eq.${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          ...operationalBody,
          crm: crm || undefined,
          crm_uf: crmUf || undefined,
          specialty: member.specialty,
        },
        logErrors: false,
      })
    } catch {
      try {
        await apiRequest(`/rest/v1/doctors?id=eq.${encodeURIComponent(member.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: {
            ...operationalBody,
            crm: crm || undefined,
            crm_uf: crmUf || undefined,
            specialty: member.specialty,
          },
          logErrors: false,
        })
      } catch (err) {
        console.warn("[doctors] sincronizacao de medico falhou:", err)
      }
    }
  } else if (member.role === "secretary") {
    try {
      await apiRequest(`/rest/v1/secretaries?user_id=eq.${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: operationalBody,
        logErrors: false,
      })
    } catch (err) {
      console.warn("[secretaries] sincronizacao falhou:", err)
    }
  } else if (member.role === "manager") {
    try {
      await apiRequest(`/rest/v1/managers?user_id=eq.${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: operationalBody,
        logErrors: false,
      })
    } catch (err) {
      console.warn("[managers] sincronizacao falhou:", err)
    }
  }
  return member
}

type StaffDeleteTarget = Pick<StaffMember, "id" | "email"> & Partial<Pick<StaffMember, "cpf">>

function staffDeleteFilter(member: StaffDeleteTarget, includeCpf = false): string {
  const cpf = member.cpf?.replace(/\D/g, "")
  const filters = [
    member.id ? `id.eq.${encodeURIComponent(member.id)}` : "",
    member.email ? `email.eq.${encodeURIComponent(member.email.trim())}` : "",
    includeCpf && cpf ? `cpf.eq.${encodeURIComponent(cpf)}` : "",
  ].filter(Boolean)

  return filters.length > 1 ? `or=(${filters.join(",")})` : filters[0]
}

function idsFilter(ids: string[]): string {
  const unique = ids.filter((id, index, all) => id && all.indexOf(id) === index)
  return unique.length > 1
    ? `id=in.(${unique.map((id) => encodeURIComponent(id)).join(",")})`
    : `id=eq.${encodeURIComponent(unique[0] ?? "")}`
}

async function deleteAuthUser(target: StaffDeleteTarget, relatedIds: string[]): Promise<boolean> {
  const ids = [target.id, ...relatedIds].filter((id, index, all) => id && all.indexOf(id) === index)
  let removed = false
  let lastError: unknown = null

  for (const id of ids) {
    try {
      await deleteAuthUserAt("/functions/v1/delete-user", id)
      removed = true
    } catch (err) {
      lastError = err
      if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 500)) throw err
    }
  }

  if (!removed && lastError) {
    console.warn("[functions/v1/delete-user] falhou, usando fallback REST:", lastError)
  }
  return removed
}

export async function deleteStaffMember(member: StaffDeleteTarget): Promise<void> {
  const doctorFilter = staffDeleteFilter(member, true)
  const profileFilter = staffDeleteFilter(member)
  if (!doctorFilter || !profileFilter) throw new Error("Profissional inválido para remoção.")

  const [doctorRows, profileRows] = await Promise.all([
    apiRequest<ApiDoctor[]>(`/rest/v1/doctors?${doctorFilter}&select=id,email,full_name,cpf`).catch(() => []),
    apiRequest<ApiProfile[]>(`/rest/v1/profiles?${profileFilter}&select=id,email,full_name`).catch(() => []),
  ])
  const relatedIds = [
    member.id,
    ...(doctorRows ?? []).map((row) => row.id),
    ...(profileRows ?? []).map((row) => row.id),
  ].filter((id, index, all) => id && all.indexOf(id) === index)

  const authRemoved = await deleteAuthUser(member, relatedIds)
  if (authRemoved) return

  try {
    if (relatedIds.length > 0) {
      await apiRequest(`/rest/v1/user_roles?user_id=in.(${relatedIds.map((id) => encodeURIComponent(id)).join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }
  } catch (err) {
    console.warn("[user_roles] remocao de papeis falhou ou registros inexistentes:", err)
  }

  try {
    await apiRequest(`/rest/v1/doctors?${doctorFilter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    })
  } catch (err) {
    console.warn("[doctors] remocao de medico por filtro falhou ou registro inexistente:", err)
  }

  try {
    if (relatedIds.length > 0) {
      await apiRequest(`/rest/v1/doctors?${idsFilter(relatedIds)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }
  } catch (err) {
    console.warn("[doctors] remocao de medico por id falhou ou registro inexistente:", err)
  }

  try {
    await apiRequest(`/rest/v1/profiles?${profileFilter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    })
  } catch (err) {
    console.warn("[profiles] remocao de perfil por filtro falhou ou registro inexistente:", err)
  }

  if (relatedIds.length > 0) {
    await apiRequest(`/rest/v1/profiles?${idsFilter(relatedIds)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    })
  }

  if (!authRemoved) {
    throw new Error("Registros removidos das tabelas, mas a API não removeu o usuário de autenticação. Verifique a Edge Function delete-user.")
  }
}

// ─── MEDICAL RECORDS ──────────────────────────────────────────────
interface ApiPatientName { id: string; full_name: string }
interface ApiDoctorName { id: string; full_name: string }

type MedicalRecordJson = Partial<{
  doctor_id: string
  appointment_id: string
  record_date: string
  chief_complaint: string
  current_history: string
  allergies: string
  medications: string
  personal_history: string
  family_history: string
  vital_signs: MedicalRecord["vitalSigns"]
  physical_exam: string
  treatment_plan: string
  prescriptions: string
  exam_requests: string
  return_date: string
  observations: string
  status: MedicalRecordStatus
  updated_by: string
}>

function medicalRecordContent(record: Omit<MedicalRecord, "id">): string {
  return [
    `Queixa principal: ${record.chiefComplaint}`,
    record.currentHistory ? `História atual: ${record.currentHistory}` : "",
    record.physicalExam ? `Exame físico: ${record.physicalExam}` : "",
    record.diagnosis ? `Diagnóstico: ${record.diagnosis}` : "",
    record.treatmentPlan ? `Conduta: ${record.treatmentPlan}` : "",
    record.prescriptions ? `Prescrição: ${record.prescriptions}` : "",
    record.examRequests ? `Exames solicitados: ${record.examRequests}` : "",
    record.observations ? `Observações: ${record.observations}` : "",
  ].filter(Boolean).join("\n\n")
}

function medicalRecordJson(record: Omit<MedicalRecord, "id">, uid: string | null): MedicalRecordJson {
  return compactPayload({
    doctor_id: record.doctorId || uid,
    appointment_id: record.appointmentId,
    record_date: record.date,
    chief_complaint: record.chiefComplaint,
    current_history: record.currentHistory,
    allergies: record.allergies,
    medications: record.medications,
    personal_history: record.personalHistory,
    family_history: record.familyHistory,
    vital_signs: record.vitalSigns,
    physical_exam: record.physicalExam,
    treatment_plan: record.treatmentPlan,
    prescriptions: record.prescriptions,
    exam_requests: record.examRequests,
    return_date: record.returnDate,
    observations: record.observations,
    status: record.status,
    updated_by: uid ?? undefined,
  }) as MedicalRecordJson
}

function medicalRecordToReport(record: Omit<MedicalRecord, "id">): Record<string, unknown> {
  const uid = getApiUserId()
  const content = medicalRecordContent(record)
  return compactPayload({
    patient_id: record.patientId,
    status: record.status === "finalized" ? "delivered" : "draft",
    exam: MEDICAL_RECORD_EXAM,
    requested_by: uid ?? record.doctorId,
    cid_code: record.cid10,
    diagnosis: record.diagnosis ?? record.chiefComplaint,
    conclusion: record.treatmentPlan,
    content_html: content,
    content_json: medicalRecordJson(record, uid),
    hide_date: false,
    hide_signature: false,
  })
}

function asMedicalRecordJson(value: unknown): MedicalRecordJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as MedicalRecordJson
}

function reportToMedicalRecord(
  api: ApiReport,
  patientName = "",
  doctorName = "",
): MedicalRecord {
  const json = asMedicalRecordJson(api.content_json)
  const doctorId = json.doctor_id ?? api.created_by ?? api.requested_by ?? ""
  return {
    id: String(api.id),
    patientId: api.patient_id,
    patientName,
    doctorId,
    doctorName,
    appointmentId: json.appointment_id,
    date: json.record_date ?? api.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    chiefComplaint: json.chief_complaint ?? api.diagnosis ?? "Atendimento clínico",
    currentHistory: json.current_history,
    allergies: json.allergies,
    medications: json.medications,
    personalHistory: json.personal_history,
    familyHistory: json.family_history,
    vitalSigns: json.vital_signs,
    physicalExam: json.physical_exam,
    diagnosis: api.diagnosis,
    cid10: api.cid_code,
    treatmentPlan: json.treatment_plan ?? api.conclusion,
    prescriptions: json.prescriptions,
    examRequests: json.exam_requests,
    returnDate: json.return_date,
    observations: json.observations,
    status: json.status ?? (api.status === "delivered" ? "finalized" : "open"),
    createdAt: api.created_at ?? new Date().toISOString(),
    updatedAt: api.updated_at,
    updatedBy: json.updated_by ?? api.updated_by,
  }
}

export async function getMedicalRecords(): Promise<MedicalRecord[]> {
  const [records, patients, doctors, profiles] = await Promise.all([
    apiRequest<ApiReport[]>(`/rest/v1/reports?select=*&exam=eq.${encodeURIComponent(MEDICAL_RECORD_EXAM)}&order=created_at.desc`),
    apiRequest<ApiPatientName[]>("/rest/v1/patients?select=id,full_name"),
    apiRequest<ApiDoctorName[]>("/rest/v1/doctors?select=id,full_name"),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=id,full_name"),
  ])
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p.full_name]))
  const doctorMap = new Map([
    ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
    ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
  ])
  return (records ?? []).map((record) => {
    const json = asMedicalRecordJson(record.content_json)
    const doctorId = json.doctor_id ?? record.created_by ?? record.requested_by ?? ""
    return reportToMedicalRecord(
      record,
      patientMap.get(record.patient_id) ?? "",
      doctorMap.get(doctorId) ?? "",
    )
  })
}

export async function createMedicalRecord(data: Omit<MedicalRecord, "id">): Promise<MedicalRecord> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: medicalRecordToReport(data),
  })
  const raw = Array.isArray(created) ? created[0] : (created as ApiReport)
  return reportToMedicalRecord(raw, data.patientName, data.doctorName)
}

export async function updateMedicalRecord(record: MedicalRecord): Promise<MedicalRecord> {
  await apiRequest(`/rest/v1/reports?id=eq.${record.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: medicalRecordToReport(record),
  })
  return record
}

// ─── PRESCRIPTIONS ────────────────────────────────────────────────
type PrescriptionJson = Partial<{
  patient_name: string
  patient_dob: string
  doctor_id: string
  doctor_name: string
  doctor_crm: string
  doctor_specialty: string
  issued_at: string
  prescription_type: PrescriptionType
  medications: PrescriptionMedication[]
  observations: string
  status: Prescription["status"]
}>

function prescriptionContent(prescription: Omit<Prescription, "id">): string {
  const meds = prescription.medications.map((med, index) => [
    `${index + 1}. ${med.name} ${med.concentration} - ${med.form}`,
    med.posology ? `Posologia: ${med.posology}` : "",
    med.duration ? `Duração: ${med.duration}` : "",
    med.quantity ? `Quantidade: ${med.quantity}` : "",
    med.instructions ? `Obs.: ${med.instructions}` : "",
  ].filter(Boolean).join("\n")).join("\n\n")

  return [
    meds,
    prescription.cid10 ? `CID-10: ${prescription.cid10}` : "",
    prescription.observations ? `Observações: ${prescription.observations}` : "",
  ].filter(Boolean).join("\n\n")
}

function prescriptionJson(prescription: Omit<Prescription, "id">, uid: string | null): PrescriptionJson {
  return compactPayload({
    patient_name: prescription.patientName,
    patient_dob: prescription.patientDob,
    doctor_id: prescription.doctorId || uid,
    doctor_name: prescription.doctorName,
    doctor_crm: prescription.doctorCrm,
    doctor_specialty: prescription.doctorSpecialty,
    issued_at: prescription.date,
    prescription_type: prescription.type,
    medications: prescription.medications,
    observations: prescription.observations,
    status: prescription.status,
  }) as PrescriptionJson
}

function prescriptionToReport(prescription: Omit<Prescription, "id">): Record<string, unknown> {
  const uid = getApiUserId()
  const content = prescriptionContent(prescription)
  return compactPayload({
    patient_id: prescription.patientId,
    status: prescription.status === "emitted" ? "delivered" : "draft",
    exam: PRESCRIPTION_EXAM,
    requested_by: uid ?? prescription.doctorId,
    cid_code: prescription.cid10,
    diagnosis: "Receita médica",
    conclusion: prescription.observations,
    content_html: content,
    content_json: prescriptionJson(prescription, uid),
    hide_date: false,
    hide_signature: false,
  })
}

function asPrescriptionJson(value: unknown): PrescriptionJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as PrescriptionJson
}

function reportToPrescription(api: ApiReport, patientName = "", doctorName = ""): Prescription {
  const json = asPrescriptionJson(api.content_json)
  const doctorId = json.doctor_id ?? api.created_by ?? api.requested_by ?? ""
  return {
    id: String(api.id),
    patientId: api.patient_id,
    patientName: json.patient_name ?? patientName,
    patientDob: json.patient_dob,
    doctorId,
    doctorName: json.doctor_name ?? doctorName,
    doctorCrm: json.doctor_crm,
    doctorSpecialty: json.doctor_specialty,
    date: json.issued_at ?? api.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    type: json.prescription_type ?? "simple",
    medications: json.medications ?? [],
    cid10: api.cid_code,
    observations: json.observations ?? api.conclusion,
    status: json.status ?? (api.status === "delivered" ? "emitted" : "draft"),
  }
}

export async function getPrescriptions(): Promise<Prescription[]> {
  const [prescriptions, patients, doctors, profiles] = await Promise.all([
    apiRequest<ApiReport[]>(`/rest/v1/reports?select=*&exam=eq.${encodeURIComponent(PRESCRIPTION_EXAM)}&order=created_at.desc`),
    apiRequest<ApiPatientName[]>("/rest/v1/patients?select=id,full_name"),
    apiRequest<ApiDoctorName[]>("/rest/v1/doctors?select=id,full_name"),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=id,full_name"),
  ])
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p.full_name]))
  const doctorMap = new Map([
    ...(doctors ?? []).map((d) => [d.id, d.full_name] as const),
    ...(profiles ?? []).map((p) => [p.id, p.full_name] as const),
  ])

  return (prescriptions ?? []).map((prescription) => {
    const json = asPrescriptionJson(prescription.content_json)
    const doctorId = json.doctor_id ?? prescription.created_by ?? prescription.requested_by ?? ""
    return reportToPrescription(
      prescription,
      patientMap.get(prescription.patient_id) ?? "",
      doctorMap.get(doctorId) ?? "",
    )
  })
}

export async function createPrescription(data: Omit<Prescription, "id">): Promise<Prescription> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: prescriptionToReport(data),
  })
  const raw = Array.isArray(created) ? created[0] : (created as ApiReport)
  return reportToPrescription(raw, data.patientName, data.doctorName)
}

// ─── MENSAGENS (SMS via Edge Function `send-sms`) ─────────────────
// Nao existe endpoint de listagem de mensagens persistidas no projeto. O
// histórico exibido na UI fica em memória da sessão atual ate que uma
// tabela `messages` seja criada e exposta via PostgREST/Edge Function.
export async function getMessages(): Promise<Message[]> { return [] }

function toE164BR(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("55")) return `+${digits}`
  return `+55${digits}`
}

/**
 * Envia SMS via Edge Function `/functions/v1/send-sms` do Supabase.
 *
 * Contrato exato do endpoint:
 *   { message: string; phone_number: string; patient_id?: string }
 *
 * O retorno desta função reflete o que foi enviado (id local da sessão,
 * status "Delivered" quando o gateway aceitou a requisição). A confirmação
 * de entrega real depende de webhook do provedor (Twilio) e não está
 * implementada aqui.
 */
interface SendSmsResponse {
  success?: boolean
  message_sid?: string
  sid?: string
  id?: string | number
  status?: string
  error?: string
  message?: string
}

function normalizeMessageStatus(status?: string): Message["status"] {
  const normalized = status?.trim().toLowerCase()
  if (normalized === "delivered" || normalized === "sent" || normalized === "success") return "Delivered"
  if (normalized === "failed" || normalized === "error") return "Failed"
  return "Pending"
}

export async function sendMessage(
  d: Omit<Message, "id"> & { phoneNumber: string },
): Promise<Message> {
  const message = d.content.trim()
  const phone_number = toE164BR(d.phoneNumber)
  if (!message) throw new Error("Mensagem não pode ser vazia.")
  if (!phone_number) throw new Error("Telefone inválido. Informe DDD + número.")

  const body: {
    message: string
    phone_number: string
    patient_id?: string
    channel?: string
    sent_by?: string
  } = {
    message,
    phone_number,
    channel: "SMS",
    sent_by: getApiUserId() ?? undefined,
  }
  const patientId = d.patientId == null ? "" : String(d.patientId).trim()
  if (patientId) body.patient_id = patientId

  let response: SendSmsResponse | undefined
  try {
    response = await apiRequest<SendSmsResponse>("/functions/v1/send-sms", {
      method: "POST",
      body,
      logErrors: false,
    })
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
    response = await apiRequest<SendSmsResponse>("/send-sms", {
      method: "POST",
      body,
    })
  }

  if (response?.success === false || response?.error) {
    throw new Error(response.error ?? response.message ?? "Não foi possível enviar o SMS.")
  }

  return {
    ...d,
    id: Number(response?.id) || Date.now(),
    channel: "SMS",
    status: normalizeMessageStatus(response?.status),
    sentBy: response?.message_sid ?? response?.sid ?? d.sentBy,
  }
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

function patientIdFilter(identity: PatientLookup): string | null {
  return identity.patientId ? `patient_id=eq.${encodeURIComponent(identity.patientId)}` : null
}

export async function getPatientReportsByIdentity(identity: PatientLookup): Promise<Report[]> {
  const patientFilter = patientIdFilter(identity)
  if (!patientFilter) return []
  const reports = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?select=*&${patientFilter}&exam=neq.${encodeURIComponent(MEDICAL_RECORD_EXAM)}&exam=neq.${encodeURIComponent(PRESCRIPTION_EXAM)}&exam=neq.${encodeURIComponent(FINANCIAL_RECORD_EXAM)}&order=created_at.desc`,
    { logErrors: false },
  )
  return (reports ?? []).map(apiToReport)
}

export async function getPatientMedicalRecordsByIdentity(identity: PatientLookup): Promise<MedicalRecord[]> {
  const patientFilter = patientIdFilter(identity)
  if (!patientFilter) return []
  const records = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?select=*&${patientFilter}&exam=eq.${encodeURIComponent(MEDICAL_RECORD_EXAM)}&order=created_at.desc`,
    { logErrors: false },
  )
  return (records ?? []).map((record) => reportToMedicalRecord(record))
}

export async function getPatientPrescriptionsByIdentity(identity: PatientLookup): Promise<Prescription[]> {
  const patientFilter = patientIdFilter(identity)
  if (!patientFilter) return []
  const prescriptions = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?select=*&${patientFilter}&exam=eq.${encodeURIComponent(PRESCRIPTION_EXAM)}&order=created_at.desc`,
    { logErrors: false },
  )
  return (prescriptions ?? []).map((prescription) => reportToPrescription(prescription))
}
