import { apiRequest, ApiError, getApiUserId } from "./api"
import { MESSAGES, MESSAGE_TEMPLATES } from "../data/mock"
import type {
  MedicalRecord, Prescription, Report, ReportStatus,
  Message, MessageTemplate, StaffMember, StaffRole, StaffStatus,
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
    specialty: api.specialty,
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

/** Perfis da equipe: colunas válidas no Supabase deste projeto (sem `phone_mobile` em `profiles`). */
async function loadProfilesForStaff(): Promise<ApiProfile[]> {
  const selects = [
    "id,full_name,email,phone,cpf,disabled,created_at",
    "id,full_name,email,phone,disabled,created_at",
  ]
  let lastErr: unknown
  for (const sel of selects) {
    try {
      return await apiRequest<ApiProfile[]>(
        `/rest/v1/profiles?select=${sel}&order=full_name.asc`,
      )
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const isBadColumn =
        err instanceof ApiError &&
        err.status === 400 &&
        /column\s+[\w.]+\s+does not exist|Could not find/i.test(msg)
      if (isBadColumn) continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Falha ao carregar perfis.")
}

export async function getStaff(): Promise<StaffMember[]> {
  const [doctors, profiles, userRoles] = await Promise.all([
    apiRequest<ApiDoctor[]>("/rest/v1/doctors?select=*&order=full_name.asc"),
    loadProfilesForStaff(),
    apiRequest<ApiUserRole[]>("/rest/v1/user_roles?select=user_id,role"),
  ])
  const doctorStaff  = (doctors  ?? []).map(apiDoctorToStaff)
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

  // Doctors carrega CRM/especialidade; quando existir profile com o mesmo email/nome,
  // mantemos o registro medico mais completo e ocultamos o duplicado de profiles.
  return [...addUnique(doctorStaff), ...addUnique(profileStaff)]
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface DoctorExtra {
  cpf: string; crmNum: string; crmUf: string; specialty: string
}

// ─── Payload exato conforme spec da API fornecida pelo usuário ────
// {
//   email: string          — obrigatório
//   password: string       — obrigatório (endpoint with-password)
//   full_name: string      — obrigatório
//   phone?: string         — opcional
//   role: Role             — obrigatório: admin|gestor|medico|secretaria|paciente
//   cpf?: string           — obrigatório se create_patient_record=true
//   create_patient_record?: boolean
//   phone_mobile?: string  — obrigatório se create_patient_record=true
// }
export async function createStaffMember(
  data:         Omit<StaffMember, "id" | "createdAt">,
  password:     string,
  doctorExtra?: DoctorExtra,
): Promise<StaffMember> {
  const roleMap: Record<StaffRole, string> = {
    doctor: "medico", manager: "gestor", secretary: "secretaria",
  }

  // Payload exato conforme curl da API fornecido
  const payload = {
    email:     data.email.trim(),
    password:  password.trim(),
    full_name: data.name.trim(),
    phone:     data.phone?.trim() || undefined,
    phone_mobile: data.phone?.trim() || undefined,
    role:      roleMap[data.role] ?? "secretaria",
    cpf:       (doctorExtra?.cpf || data.cpf || "").replace(/\D/g, "") || undefined,
    create_patient_record: false,
    crm:       data.role === "doctor" ? doctorExtra?.crmNum?.trim() : undefined,
    crm_uf:    data.role === "doctor" ? doctorExtra?.crmUf?.trim().toUpperCase() : undefined,
    specialty: data.role === "doctor" ? doctorExtra?.specialty?.trim() : undefined,
  }

  if (!payload.email)     throw new Error("E-mail obrigatório")
  if (!payload.password)  throw new Error("Senha obrigatória")
  if (payload.password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres")
  if (!payload.full_name) throw new Error("Nome obrigatório")
  if (!payload.phone)     throw new Error("Telefone obrigatório")
  if (!payload.cpf)       throw new Error("CPF obrigatório")
  if (payload.role === "medico") {
    if (!payload.crm)       throw new Error("CRM obrigatório")
    if (!payload.crm_uf)    throw new Error("UF do CRM obrigatória")
    if (!payload.specialty) throw new Error("Especialidade obrigatória")
  }

  // Passo 1: criar usuário auth com senha/role pela Edge Function da API.
  // O caminho oficial e /functions/v1/create-user-with-password.
  // O caminho curto (/create-user-with-password) e mantido apenas como
  // fallback defensivo para projetos antigos.
  let res: CreateUserWithPasswordResponse
  try {
    res = await apiRequest<CreateUserWithPasswordResponse>("/functions/v1/create-user-with-password", {
      method: "POST",
      body: compactPayload(payload),
      logErrors: false,
    })
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        res = await apiRequest<CreateUserWithPasswordResponse>("/create-user-with-password", {
          method: "POST",
          body: compactPayload(payload),
        })
      } else if (err.status === 401 || err.status === 403) {
        throw new Error(
          "Sua sessão expirou ou você não tem permissão para criar usuários. " +
          "Faça login novamente como gestor e tente outra vez.",
        )
      } else {
        throw err
      }
    } else {
      throw err
    }
  }

  if (!res?.user?.id && !res?.user_id) {
    throw new Error(res?.message || "Erro ao criar usuário na API")
  }

  const userId = res?.user?.id ?? res?.user_id ?? ""

  // Passo 2: se médico, criar registro na tabela doctors
  if (data.role === "doctor" && doctorExtra) {
    const doctorPayload = compactPayload({
      email:        data.email,
      full_name:    data.name,
      cpf:          doctorExtra.cpf.replace(/\D/g, ""),
      crm:          doctorExtra.crmNum,
      crm_uf:       doctorExtra.crmUf.toUpperCase(),
      specialty:    doctorExtra.specialty,
      phone:        data.phone || undefined,
      phone_mobile: data.phone || undefined,
      phone2:       data.phone2 || undefined,
      rg:           data.rg || undefined,
      active:       data.status !== "Inactive",
      temp_password: data.tempPassword || password.trim(),
      ...addressToDoctorApi(data.address),
    })

    try {
      await apiRequest("/functions/v1/create-doctor", {
        method: "POST",
        body: doctorPayload,
        logErrors: false,
      })
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err
      await apiRequest("/create-doctor", {
        method: "POST",
        body: doctorPayload,
      })
    }
  }

  return {
    ...data,
    id:        userId,
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
    body: { full_name: member.name, phone: member.phone },
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
          phone: member.phone,
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

// ─── MOCK — módulos ainda sem contrato de persistência ────────────
export async function getMessages(): Promise<Message[]> { return MESSAGES }
export async function getMessageTemplates(): Promise<MessageTemplate[]> { return MESSAGE_TEMPLATES }

function toE164BR(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("55")) return `+${digits}`
  return `+55${digits}`
}

export async function sendMessage(
  d: Omit<Message, "id"> & { phoneNumber: string },
): Promise<Message> {
  const body = {
    phone_number: toE164BR(d.phoneNumber),
    message: d.content,
    patient_id: String(d.patientId),
  }

  try {
    await apiRequest<{ success?: boolean; message_sid?: string }>("/functions/v1/send-sms", {
      method: "POST",
      body,
      logErrors: false,
    })
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
    await apiRequest<{ success?: boolean; message_sid?: string }>("/send-sms", {
      method: "POST",
      body,
    })
  }

  return {
    ...d,
    id: Date.now(),
    channel: "SMS",
    status: "Delivered",
  }
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

function sameLookupText(a?: string, b?: string): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase())
}

function recordMatchesPatient(
  item: { patientId: string; patientName: string },
  identity: PatientLookup,
): boolean {
  return Boolean(
    (identity.patientId && item.patientId === identity.patientId) ||
    sameLookupText(item.patientName, identity.name),
  )
}

export async function getPatientReportsByIdentity(identity: PatientLookup): Promise<Report[]> {
  const reports = await getReports()
  return reports.filter((report) => recordMatchesPatient(report, identity))
}

export async function getPatientMedicalRecordsByIdentity(identity: PatientLookup): Promise<MedicalRecord[]> {
  const records = await getMedicalRecords()
  return records.filter((record) => recordMatchesPatient(record, identity))
}

export async function getPatientPrescriptionsByIdentity(identity: PatientLookup): Promise<Prescription[]> {
  const prescriptions = await getPrescriptions()
  return prescriptions.filter((prescription) => recordMatchesPatient(prescription, identity))
}
