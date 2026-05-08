import { ApiError, apiRequest, getApiUserId } from "./api"
import { rememberPatientLink } from "./patientLinks"
import { MESSAGES, MESSAGE_TEMPLATES } from "../data/mock"
import type {
  MedicalRecord, Prescription, Report, ReportStatus,
  Message, MessageTemplate, StaffMember, StaffRole, StaffStatus,
  MedicalRecordStatus, PrescriptionMedication, PrescriptionType, Address,
} from "../types"

// ─────────────────────────────────────────────────────────────────
// REPORTS — campos exatos conforme Schema da API
// ─────────────────────────────────────────────────────────────────
interface ApiReport {
  id:             string
  order_number?:  string
  patient_id:     string
  status?:        string        // "draft" | "finalized" | "sent"
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
  patients?:      { id?: string; user_id?: string; full_name: string; email?: string; cpf?: string } | null
  profiles?:      { full_name: string } | null
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

function onlyDigits(value?: string): string {
  return value?.replace(/\D/g, "") ?? ""
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
}

function mergeReports(rows: ApiReport[][]): ApiReport[] {
  return Array.from(new Map(rows.flat().map((row) => [row.id, row])).values())
}

async function getReportsByPatientIdentity(
  identity: PatientLookup,
  exam?: string,
): Promise<ApiReport[]> {
  const ids = uniqueValues([identity.patientId])
  const userId = identity.userId?.trim()
  const email = identity.email?.trim().toLowerCase()
  const cpf = onlyDigits(identity.cpf)
  const name = identity.name?.trim()
  const examFilter = exam ? `&exam=eq.${encodeURIComponent(exam)}` : ""
  const queries: Array<Promise<ApiReport[]>> = []

  if (ids.length > 0) {
    const filter = ids.length === 1
      ? `patient_id=eq.${encodeURIComponent(ids[0])}`
      : `patient_id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`
    queries.push(apiRequest<ApiReport[]>(
      `/rest/v1/reports?${filter}${examFilter}&select=*,patients(id,full_name,email,cpf)&order=created_at.desc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (email) {
    queries.push(apiRequest<ApiReport[]>(
      `/rest/v1/reports?select=*,patients!inner(id,full_name,email,cpf)&patients.email=eq.${encodeURIComponent(email)}${examFilter}&order=created_at.desc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (userId) {
    queries.push(apiRequest<ApiReport[]>(
      `/rest/v1/reports?select=*,patients!inner(id,full_name,email,cpf,user_id)&patients.user_id=eq.${encodeURIComponent(userId)}${examFilter}&order=created_at.desc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (cpf) {
    queries.push(apiRequest<ApiReport[]>(
      `/rest/v1/reports?select=*,patients!inner(id,full_name,email,cpf)&patients.cpf=eq.${encodeURIComponent(cpf)}${examFilter}&order=created_at.desc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (name) {
    queries.push(apiRequest<ApiReport[]>(
      `/rest/v1/reports?select=*,patients!inner(id,full_name,email,cpf)&patients.full_name=ilike.*${encodeURIComponent(name)}*${examFilter}&order=created_at.desc`,
      { logErrors: false },
    ).catch(() => []))
  }

  if (queries.length === 0) return []
  return Promise.all(queries).then(mergeReports)
}

function contentJsonStatus(value: unknown): ReportStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const status = (value as { frontend_status?: unknown; report_status?: unknown }).frontend_status ??
    (value as { frontend_status?: unknown; report_status?: unknown }).report_status
  if (status === "Sent" || status === "sent" || status === "enviado") return "Sent"
  if (status === "Finalized" || status === "finalized" || status === "finalizado") return "Finalized"
  if (status === "Draft" || status === "draft" || status === "rascunho") return "Draft"
  return null
}

function reportContentJson(status: ReportStatus): Record<string, unknown> {
  return { frontend_status: status }
}

function statusToFrontend(s?: string, contentJson?: unknown): ReportStatus {
  const contentStatus = contentJsonStatus(contentJson)
  if (contentStatus) return contentStatus
  if (s === "sent" || s === "enviado") return "Sent"
  if (s === "finalized" || s === "finalizado" || s === "delivered") return "Finalized"
  return "Draft"
}
function statusToApi(s: ReportStatus): string {
  void s
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
    status:        statusToFrontend(api.status, api.content_json),
    hideDate:      api.hide_date            ?? false,
    hideSignature: api.hide_signature       ?? false,
    orderNumber:   api.order_number,
    requestedBy:   api.requested_by,
  }
}

// ReportInput exato conforme schema da API
function firstText(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean)
}

function reportToApi(r: Partial<Report> & { patientId: string }): Record<string, unknown> {
  const exam = firstText(r.type, r.exam) ?? "Laudo Médico"
  const contentHtml = firstText(r.contentHtml, r.content, r.conclusion, r.diagnosis, exam) ?? exam
  const diagnosis = firstText(r.diagnosis, r.content, r.contentHtml, exam) ?? exam
  const conclusion = firstText(r.conclusion, r.diagnosis, r.content, r.contentHtml, exam) ?? diagnosis

  return compactPayload({
    patient_id:     r.patientId,
    exam,
    diagnosis,
    conclusion,
    content_html:   contentHtml,
    content_json:   reportContentJson(r.status ?? "Draft"),
    cid_code:       firstText(r.cid10),
    status:         statusToApi(r.status ?? "Draft"),
  })
}

function reportUpdateToApi(r: Partial<Report>): Record<string, unknown> {
  const exam = firstText(r.type, r.exam) ?? "Laudo Médico"
  const contentHtml = firstText(r.contentHtml, r.content, r.conclusion, r.diagnosis, exam) ?? exam
  const diagnosis = firstText(r.diagnosis, r.content, r.contentHtml, exam) ?? exam
  const conclusion = firstText(r.conclusion, r.diagnosis, r.content, r.contentHtml, exam) ?? diagnosis

  return compactPayload({
    exam,
    diagnosis,
    conclusion,
    content_html:   contentHtml,
    content_json:   reportContentJson(r.status ?? "Draft"),
    cid_code:       firstText(r.cid10),
    status:         statusToApi(r.status ?? "Draft"),
  })
}

function reportStatusToApi(status: ReportStatus): Record<string, unknown> {
  return {
    status: statusToApi(status),
    content_json: reportContentJson(status),
  }
}

function isReportStatusEnumError(err: unknown): boolean {
  return err instanceof ApiError &&
    err.status === 400 &&
    /invalid input value.*report_status|enum.*report_status/i.test(err.message)
}

function fallbackStatusToApi(status: ReportStatus): string {
  void status
  return "draft"
}

function withReportStatusPayloadFallback(
  payload: Record<string, unknown>,
  status?: ReportStatus,
): Record<string, unknown> {
  if (!status || !("status" in payload)) return payload
  return { ...payload, status: fallbackStatusToApi(status) }
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

export async function getPatientReports(patientId: string): Promise<Report[]> {
  if (!patientId) return []

  const reports = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?patient_id=eq.${encodeURIComponent(patientId)}&select=*&order=created_at.desc`,
  )

  return (reports ?? [])
    .filter((report) =>
      report.exam !== MEDICAL_RECORD_EXAM &&
      report.exam !== PRESCRIPTION_EXAM &&
      report.exam !== FINANCIAL_RECORD_EXAM)
    .map((report) => ({
      ...apiToReport(report),
      patientName: "",
      doctorName: "",
    }))
}

export async function getPatientReportsByIdentity(identity: PatientLookup): Promise<Report[]> {
  const reports = await getReportsByPatientIdentity(identity)

  return reports
    .filter((report) =>
      report.exam !== MEDICAL_RECORD_EXAM &&
      report.exam !== PRESCRIPTION_EXAM &&
      report.exam !== FINANCIAL_RECORD_EXAM)
    .map((report) => apiToReport(report))
}

export async function createReport(
  data: Partial<Report> & { patientId: string },
): Promise<Report> {
  const payload = reportToApi(data)
  let created: ApiReport[]
  try {
    created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: payload,
      logErrors: false,
    })
  } catch (err) {
    if (!isReportStatusEnumError(err)) throw err
    created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: withReportStatusPayloadFallback(payload, data.status),
    })
  }
  const raw  = Array.isArray(created) ? created[0] : (created as ApiReport)
  const report = {
    ...apiToReport(raw),
    patientName: data.patientName ?? "",
    doctorName: data.doctorName ?? "",
  }
  rememberPatientLink({ patientId: data.patientId, name: data.patientName })
  return report
}

export async function updateReport(report: Report): Promise<Report> {
  const payload = reportUpdateToApi(report)
  try {
    await apiRequest(`/rest/v1/reports?id=eq.${report.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: payload,
      logErrors: false,
    })
  } catch (err) {
    if (!isReportStatusEnumError(err)) throw err
    await apiRequest(`/rest/v1/reports?id=eq.${report.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: withReportStatusPayloadFallback(payload, report.status),
    })
  }
  rememberPatientLink({ patientId: report.patientId, name: report.patientName })
  return report
}

export async function updateReportStatus(
  id: string,
  status: ReportStatus,
): Promise<void> {
  const payload = reportStatusToApi(status)
  try {
    await apiRequest(`/rest/v1/reports?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: payload,
      logErrors: false,
    })
  } catch (err) {
    if (!isReportStatusEnumError(err)) throw err
    await apiRequest(`/rest/v1/reports?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: withReportStatusPayloadFallback(payload, status),
    })
  }
}

// ─────────────────────────────────────────────────────────────────
// STAFF — criação via endpoint correto da API
// ─────────────────────────────────────────────────────────────────
interface ApiDoctor {
  id: string; full_name: string; email?: string; cpf?: string
  crm?: string; crm_uf?: string; crm_state?: string; specialty?: string
  active?: boolean; created_at?: string
}
interface ApiProfile {
  id: string; full_name: string; email?: string
  phone?: string; role?: string; created_at?: string
}
interface ApiUserRole {
  id?: string; user_id: string; role: string; created_at?: string
}
interface ApiStaffPatient {
  id: string; email?: string
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

async function createUserWithPassword(
  payload: Record<string, unknown>,
): Promise<{
  success?: boolean
  user?: {
    id: string
    email: string
    full_name: string
    roles: string[]
    email_confirmed_at: string | null
  }
  message?: string
}> {
  try {
    return await apiRequest("/functions/v1/create-user-with-password", {
      method: "POST",
      body: payload,
      logErrors: false,
    })
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return apiRequest("/create-user-with-password", {
    method: "POST",
    body: payload,
  })
}

async function ensureUserRole(userId: string, role: string): Promise<void> {
  const existing = await apiRequest<ApiUserRole[]>(
    `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role=eq.${encodeURIComponent(role)}&select=user_id,role&limit=1`,
  ).catch(() => [])
  if (existing?.length) return

  await apiRequest("/rest/v1/user_roles", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { user_id: userId, role },
  }).catch((err) => {
    console.warn("[user_roles] sincronizacao de papel falhou:", err)
  })
}

function extractDoctor(data: unknown): ApiDoctor | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] as ApiDoctor | undefined) ?? null
  if (typeof data !== "object") return null

  const obj = data as Partial<ApiDoctor> & {
    doctor?: ApiDoctor
    data?: ApiDoctor
  }

  return obj.doctor ?? obj.data ?? (obj.id && obj.full_name ? obj as ApiDoctor : null)
}

async function findDoctorRecord(
  userId: string,
  email: string,
  cpf?: unknown,
): Promise<ApiDoctor | null> {
  const cpfDigits = typeof cpf === "string" ? cpf.replace(/\D/g, "") : ""
  const filters = [
    userId ? `id.eq.${encodeURIComponent(userId)}` : "",
    email ? `email.eq.${encodeURIComponent(email)}` : "",
    cpfDigits ? `cpf.eq.${encodeURIComponent(cpfDigits)}` : "",
  ].filter(Boolean)

  if (filters.length === 0) return null

  const query = filters.length > 1 ? `or=(${filters.join(",")})` : filters[0]
  const rows = await apiRequest<ApiDoctor[]>(`/rest/v1/doctors?${query}&select=*&limit=1`).catch(() => [])
  return rows?.[0] ?? null
}

async function createDoctorValidated(
  payload: Record<string, unknown>,
): Promise<ApiDoctor | null> {
  let created: ApiDoctor[] | ApiDoctor | undefined
  try {
    created = await apiRequest<ApiDoctor[] | ApiDoctor | undefined>(
      "/functions/v1/create-doctor",
      {
        method: "POST",
        body: payload,
        logErrors: false,
      },
    )
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
    created = await apiRequest<ApiDoctor[] | ApiDoctor | undefined>("/create-doctor", {
      method: "POST",
      body: payload,
      logErrors: false,
    })
  }
  return extractDoctor(created)
}

async function ensureDoctorRecord(
  userId: string,
  payload: Record<string, unknown>,
): Promise<ApiDoctor> {
  const email = String(payload.email ?? "").trim()
  const existing = await findDoctorRecord(userId, email, payload.cpf)
  if (existing) return existing

  try {
    const createdByFunction = await createDoctorValidated(payload)
    const created = createdByFunction ?? await findDoctorRecord(userId, email, payload.cpf)
    if (created) return created
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  const created = await apiRequest<ApiDoctor[]>("/rest/v1/doctors", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: compactPayload({
      id:           userId,
      full_name:    payload.full_name,
      email:        payload.email,
      cpf:          payload.cpf,
      crm:          payload.crm,
      crm_uf:       payload.crm_uf,
      specialty:    payload.specialty,
      phone_mobile: payload.phone_mobile,
      phone2:       payload.phone2,
      rg:           payload.rg,
      active:       payload.active ?? true,
      temp_password: payload.temp_password,
      cep:          payload.cep,
      street:       payload.street,
      number:       payload.number,
      complement:   payload.complement,
      neighborhood: payload.neighborhood,
      city:         payload.city,
      state:        payload.state,
    }),
  })

  const doctor = Array.isArray(created) ? created[0] : (created as ApiDoctor)
  if (!doctor) throw new Error("Usuário criado, mas o registro médico não foi salvo em doctors pela API.")
  return doctor
}

async function createDoctorUserWithPassword(
  basePayload: Record<string, unknown>,
  doctorPayload: Record<string, unknown>,
  data: Omit<StaffMember, "id" | "createdAt">,
  doctorExtra: DoctorExtra,
): Promise<StaffMember> {
  const res = await createUserWithPassword({
    ...basePayload,
    ...doctorPayload,
    role: "medico",
  })
  const userId = res?.user?.id
  if (!userId) throw new Error(res?.message || "Usuário médico não foi criado pela API.")

  await ensureUserRole(userId, "medico")
  const doctor = await ensureDoctorRecord(userId, doctorPayload)
  return {
    ...data,
    id: doctor.id,
    cpf: doctor.cpf ?? doctorExtra.cpf.replace(/\D/g, ""),
    crm: formatCrm(
      doctor.crm ?? doctorExtra.crmNum,
      doctor.crm_uf ?? doctor.crm_state ?? doctorExtra.crmUf.toUpperCase(),
    ),
    specialty: doctor.specialty ?? doctorExtra.specialty,
    createdAt: doctor.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

async function cleanupExistingAuthUserByEmail(email: string): Promise<boolean> {
  if (!email) return false
  try {
    await apiRequest("/functions/v1/delete-user", {
      method: "POST",
      body: { email },
      logErrors: false,
    })
    return true
  } catch (err) {
    console.warn("[delete-user] limpeza por e-mail antes de recriar falhou:", err)
    return false
  }
}

async function deleteAuthUserAt(
  path: string,
  userId: string,
  email?: string,
): Promise<void> {
  await apiRequest(path, {
    method: "POST",
    body: {
      userId,
      user_id: userId,
      email: email || undefined,
    },
    logErrors: false,
  })
}

const MEDICAL_RECORD_EXAM = "Prontuário Médico"
const PRESCRIPTION_EXAM = "Receita Médica"
const FINANCIAL_RECORD_EXAM = "Registro Financeiro"

function formatCrm(crm?: string | null, crmUf?: string | null): string | undefined {
  if (!crm) return undefined
  return crmUf ? `${crm}-${crmUf}` : crm
}

function apiDoctorToStaff(api: ApiDoctor): StaffMember {
  const crmUf = api.crm_uf ?? api.crm_state
  return {
    id:        api.id,
    name:      api.full_name,
    role:      "doctor" as StaffRole,
    email:     api.email   ?? "",
    phone:     "",
    status:    (api.active !== false ? "Active" : "Inactive") as StaffStatus,
    cpf:       api.cpf,
    crm:       formatCrm(api.crm, crmUf),
    specialty: api.specialty,
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

function normalizeRole(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizeEmail(value?: string | null): string {
  return (value ?? "").toLowerCase().trim()
}

function normalizePersonName(value?: string | null): string {
  return normalizeRole(value)
    .replace(/^(dr|dra|doutor|doutora)\.?\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function hasDoctorTitle(value?: string | null): boolean {
  return /^(dr|dra|doutor|doutora)\.?\s+/i.test(normalizeRole(value))
}

function roleToStaffRole(roleValue?: string | null): StaffRole | null {
  const roleMap: Record<string, StaffRole> = {
    medico: "doctor", doctor: "doctor",
    gestor: "manager", manager: "manager",
    secretaria: "secretary", secretary: "secretary",
  }
  return roleMap[normalizeRole(roleValue)] ?? null
}

function profileRoleToStaffRole(api: ApiProfile, roleValue?: string | null): StaffRole | null {
  return roleToStaffRole(roleValue ?? api.role) ?? (hasDoctorTitle(api.full_name) ? "doctor" : null)
}

function apiProfileToStaff(api: ApiProfile, role: StaffRole): StaffMember {
  return {
    id:        api.id,
    name:      api.full_name,
    role,
    email:     api.email ?? "",
    phone:     api.phone ?? "",
    status:    "Active",
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

export async function getStaff(): Promise<StaffMember[]> {
  const [doctors, profiles, patients, userRoles] = await Promise.all([
    apiRequest<ApiDoctor[]>("/rest/v1/doctors?select=*&order=full_name.asc"),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=*&order=full_name.asc"),
    apiRequest<ApiStaffPatient[]>("/rest/v1/patients?select=id,email"),
    apiRequest<ApiUserRole[]>("/rest/v1/user_roles?select=user_id,role,created_at"),
  ])
  const profilesList = profiles ?? []
  const patientsList = patients ?? []
  const roleByUserId = new Map<string, string>()
  ;(userRoles ?? []).forEach((row) => {
    const current = roleToStaffRole(roleByUserId.get(row.user_id))
    const next = roleToStaffRole(row.role)
    if (!next) return
    if (!current || next === "manager" || (next === "doctor" && current !== "manager")) {
      roleByUserId.set(row.user_id, row.role)
    }
  })
  const profileById = new Map(profilesList.map((profile) => [profile.id, profile]))
  const profileByEmail = new Map<string, ApiProfile>()
  const profileByName = new Map<string, ApiProfile>()
  profilesList.forEach((profile) => {
    const email = normalizeEmail(profile.email)
    const name = normalizePersonName(profile.full_name)
    if (email) profileByEmail.set(email, profile)
    if (name) profileByName.set(name, profile)
  })
  const doctorStaff  = (doctors  ?? []).map((doctor) => {
    const base = apiDoctorToStaff(doctor)
    const profile =
      profileById.get(doctor.id) ??
      profileByEmail.get(normalizeEmail(doctor.email)) ??
      profileByName.get(normalizePersonName(doctor.full_name))
    return {
      ...base,
      phone: profile?.phone ?? base.phone,
    }
  })
  const doctorIds    = new Set(doctorStaff.map((d) => d.id))
  const doctorEmails = new Set(doctorStaff.map((d) => normalizeEmail(d.email)).filter(Boolean))
  const doctorNames  = new Set(doctorStaff.map((d) => normalizePersonName(d.name)).filter(Boolean))
  const patientIds    = new Set(patientsList.map((p) => p.id))
  const patientEmails = new Set(patientsList.map((p) => normalizeEmail(p.email)).filter(Boolean))
  const profileStaff = profilesList
    .filter((p) => {
      const role = normalizeRole(roleByUserId.get(p.id) ?? p.role)
      return role !== "paciente" &&
        role !== "patient" &&
        role !== "admin" &&
        role !== "administrador"
    })
    .filter((p) => {
      if (doctorIds.has(p.id)) return false
      const email = normalizeEmail(p.email)
      const name  = normalizePersonName(p.full_name)
      const matchesPatientTable = Boolean(
        patientIds.has(p.id) ||
        (email && patientEmails.has(email)),
      )
      if (matchesPatientTable) return false
      const matchesDoctorTable = Boolean(
        (email && doctorEmails.has(email)) ||
        (name && doctorNames.has(name)),
      )
      if (matchesDoctorTable) return false
      return true
    })
    .map((profile) => {
      const role = profileRoleToStaffRole(profile, roleByUserId.get(profile.id))
      return role ? apiProfileToStaff(profile, role) : null
    })
    .filter((profile): profile is StaffMember => Boolean(profile))

  return [...doctorStaff, ...profileStaff]
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface DoctorExtra {
  cpf: string
  crmNum: string
  crmUf: string
  specialty: string
  phone2?: string
  rg?: string
  address?: Address
}

export async function createStaffMember(
  data:         Omit<StaffMember, "id" | "createdAt">,
  password:     string,
  doctorExtra?: DoctorExtra,
): Promise<StaffMember> {
  const roleMap: Record<StaffRole, string> = {
    doctor: "medico", manager: "gestor", secretary: "secretaria",
  }

  const payload = {
    email:     data.email.trim(),
    password:  password.trim(),
    full_name: data.name.trim(),
    phone:     data.phone?.trim() || undefined,
    role:      roleMap[data.role] ?? "secretaria",
    cpf:       (doctorExtra?.cpf || data.cpf || "").replace(/\D/g, "") || undefined,
  }

  if (!payload.email)     throw new Error("E-mail obrigatório")
  if (!payload.password)  throw new Error("Senha obrigatória")
  if (payload.password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")
  if (!payload.full_name) throw new Error("Nome obrigatório")
  if (!payload.phone)     throw new Error("Telefone obrigatório")
  if (!payload.cpf)       throw new Error("CPF obrigatório")

  if (data.role === "doctor" && doctorExtra) {
    const doctorPayload = {
      email:        data.email.trim(),
      full_name:    data.name.trim(),
      cpf:          doctorExtra.cpf.replace(/\D/g, ""),
      crm:          doctorExtra.crmNum,
      crm_uf:       doctorExtra.crmUf.toUpperCase(),
      specialty:    doctorExtra.specialty,
      phone_mobile: data.phone || undefined,
      phone2:       doctorExtra.phone2?.replace(/\D/g, "") || undefined,
      rg:           doctorExtra.rg?.trim() || undefined,
      active:       data.status !== "Inactive",
      temp_password: password.trim(),
      cep:          doctorExtra.address?.zipCode?.replace(/\D/g, "") || undefined,
      street:       doctorExtra.address?.street,
      number:       doctorExtra.address?.number,
      complement:   doctorExtra.address?.complement,
      neighborhood: doctorExtra.address?.neighborhood,
      city:         doctorExtra.address?.city,
      state:        doctorExtra.address?.state,
    }
    try {
      return await createDoctorUserWithPassword(payload, doctorPayload, data, doctorExtra)
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      if (!/already been registered|already registered|email.*registered|email.*exists/i.test(message)) throw err
      const removedAuth = await cleanupExistingAuthUserByEmail(data.email.trim())
      if (!removedAuth) {
        throw new Error("Este e-mail ainda existe no Supabase Auth. A API delete-user exige o userId UUID e não permite remover somente por e-mail.")
      }
      return await createDoctorUserWithPassword(payload, doctorPayload, data, doctorExtra)
    }
  }

  const res = await createUserWithPassword(payload)

  if (!res?.user?.id) {
    throw new Error(res?.message || "Erro ao criar usuário na API")
  }

  const userId = res?.user?.id ?? ""

  try {
    await apiRequest("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        id: userId,
        full_name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone?.trim() || null,
      },
    })
  } catch (e) {
    console.warn("[profiles] sincronizacao apos create-user falhou:", e)
  }

  const profileRows = await apiRequest<ApiProfile[]>(
    `/rest/v1/profiles?or=(id.eq.${encodeURIComponent(userId)},email.eq.${encodeURIComponent(data.email.trim())})&select=*&limit=1`,
  )
  const profile = profileRows?.[0]
  if (!profile) {
    throw new Error("Usuário criado, mas o perfil de equipe não foi salvo em profiles pela API.")
  }

  return {
    ...data,
    id:        profile.id,
    name:      profile.full_name ?? data.name,
    email:     profile.email ?? data.email,
    phone:     profile.phone ?? data.phone,
    role:      profileRoleToStaffRole(profile, payload.role as string) ?? data.role,
    crm:       data.role === "doctor" && doctorExtra
      ? `${doctorExtra.crmNum}-${doctorExtra.crmUf}`
      : data.crm,
    specialty: data.role === "doctor" && doctorExtra
      ? doctorExtra.specialty
      : data.specialty,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

export async function updateStaffMember(member: StaffMember): Promise<StaffMember> {
  await apiRequest(`/rest/v1/profiles?id=eq.${member.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      full_name: member.name,
      email: member.email,
      phone: member.phone,
    },
  })
  if (member.role === "doctor") {
    const [crm = "", crmUf = ""] = (member.crm ?? "").split("-")
    try {
      await apiRequest(`/rest/v1/doctors?id=eq.${member.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          full_name: member.name,
          email: member.email,
          cpf: member.cpf?.replace(/\D/g, "") || undefined,
          crm: crm || undefined,
          crm_uf: crmUf || undefined,
          specialty: member.specialty,
          active: member.status !== "Inactive",
        },
      })
    } catch (err) {
      console.warn("[doctors] sincronizacao de medico falhou:", err)
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
      try {
        await deleteAuthUserAt("/functions/v1/delete-user", id, target.email)
      } catch (err) {
        if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 0)) throw err
        await deleteAuthUserAt("/delete-user", id, target.email)
      }
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
    status: record.status === "finalized" ? "finalized" : "draft",
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
    status: json.status ?? (api.status === "finalized" || api.status === "delivered" ? "finalized" : "open"),
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

export async function getPatientMedicalRecords(patientId: string): Promise<MedicalRecord[]> {
  if (!patientId) return []

  const records = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?patient_id=eq.${encodeURIComponent(patientId)}&exam=eq.${encodeURIComponent(MEDICAL_RECORD_EXAM)}&select=*&order=created_at.desc`,
  )

  return (records ?? []).map((record) => reportToMedicalRecord(record, "", ""))
}

export async function getPatientMedicalRecordsByIdentity(identity: PatientLookup): Promise<MedicalRecord[]> {
  const records = await getReportsByPatientIdentity(identity, MEDICAL_RECORD_EXAM)
  return records.map((record) => reportToMedicalRecord(record, "", ""))
}

export async function createMedicalRecord(data: Omit<MedicalRecord, "id">): Promise<MedicalRecord> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: medicalRecordToReport(data),
  })
  const raw = Array.isArray(created) ? created[0] : (created as ApiReport)
  const record = reportToMedicalRecord(raw, data.patientName, data.doctorName)
  rememberPatientLink({ patientId: data.patientId, name: data.patientName })
  return record
}

export async function updateMedicalRecord(record: MedicalRecord): Promise<MedicalRecord> {
  await apiRequest(`/rest/v1/reports?id=eq.${record.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: medicalRecordToReport(record),
  })
  rememberPatientLink({ patientId: record.patientId, name: record.patientName })
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
    status: prescription.status === "emitted" ? "finalized" : "draft",
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
    status: json.status ?? (api.status === "finalized" || api.status === "delivered" ? "emitted" : "draft"),
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

export async function getPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  if (!patientId) return []

  const prescriptions = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?patient_id=eq.${encodeURIComponent(patientId)}&exam=eq.${encodeURIComponent(PRESCRIPTION_EXAM)}&select=*&order=created_at.desc`,
  )

  return (prescriptions ?? []).map((prescription) => reportToPrescription(prescription, "", ""))
}

export async function getPatientPrescriptionsByIdentity(identity: PatientLookup): Promise<Prescription[]> {
  const prescriptions = await getReportsByPatientIdentity(identity, PRESCRIPTION_EXAM)
  return prescriptions.map((prescription) => reportToPrescription(prescription, "", ""))
}

export async function createPrescription(data: Omit<Prescription, "id">): Promise<Prescription> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: prescriptionToReport(data),
  })
  const raw = Array.isArray(created) ? created[0] : (created as ApiReport)
  const prescription = reportToPrescription(raw, data.patientName, data.doctorName)
  rememberPatientLink({ patientId: data.patientId, name: data.patientName })
  return prescription
}

// ─── MOCK — módulos ainda sem contrato de persistência ────────────
export async function getMessages(): Promise<Message[]> { return MESSAGES }
export async function getMessageTemplates(): Promise<MessageTemplate[]> { return MESSAGE_TEMPLATES }

export async function sendMessage(
  d: Omit<Message, "id"> & { phoneNumber: string },
): Promise<Message> {
  void d
  throw new Error("Envio de SMS está desativado na API. O endpoint está documentado, mas não realiza envio no sistema.")
}
