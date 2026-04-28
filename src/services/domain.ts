import { apiRequest, getApiUserId } from "./api"
import { MEDICAL_RECORDS, PRESCRIPTIONS, MESSAGES, MESSAGE_TEMPLATES } from "../data/mock"
import type {
  MedicalRecord, Prescription, Report, ReportStatus,
  Message, MessageTemplate, StaffMember, StaffRole, StaffStatus,
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
  patients?:      { full_name: string } | null
  profiles?:      { full_name: string } | null
}

function statusToFrontend(s?: string): ReportStatus {
  if (s === "finalized") return "Finalized"
  if (s === "sent")      return "Sent"
  return "Draft"
}
function statusToApi(s: ReportStatus): string {
  if (s === "Finalized") return "finalized"
  if (s === "Sent")      return "sent"
  return "draft"
}

function apiToReport(api: ApiReport): Report {
  return {
    id:            api.id,
    patientId:     api.patient_id,
    patientName:   api.patients?.full_name  ?? "",
    doctorId:      api.created_by           ?? "",
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
function reportToApi(r: Partial<Report> & { patientId: string }): Record<string, unknown> {
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
  }
}

const REPORT_SELECT = "select=*,patients(full_name)"

export async function getReports(): Promise<Report[]> {
  const data = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?${REPORT_SELECT}&order=created_at.desc`,
  )
  return (data ?? []).map(apiToReport)
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
  const full = await apiRequest<ApiReport[]>(
    `/rest/v1/reports?id=eq.${raw.id}&${REPORT_SELECT}`,
  )
  return apiToReport(full[0] ?? raw)
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
  id: string; full_name: string; email?: string; phone?: string
  crm?: string; crm_state?: string; specialty?: string
  active?: boolean; created_at?: string
}
interface ApiProfile {
  id: string; full_name: string; email?: string
  phone?: string; role?: string; created_at?: string
}

function apiDoctorToStaff(api: ApiDoctor): StaffMember {
  return {
    id:        api.id,
    name:      api.full_name,
    role:      "doctor" as StaffRole,
    email:     api.email   ?? "",
    phone:     api.phone   ?? "",
    status:    (api.active !== false ? "Active" : "Inactive") as StaffStatus,
    crm:       api.crm ? `${api.crm}-${api.crm_state ?? ""}` : undefined,
    specialty: api.specialty,
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}
function apiProfileToStaff(api: ApiProfile): StaffMember {
  const roleMap: Record<string, StaffRole> = {
    medico: "doctor", gestor: "manager", secretaria: "secretary",
  }
  return {
    id:        api.id,
    name:      api.full_name,
    role:      roleMap[api.role ?? ""] ?? "secretary",
    email:     api.email ?? "",
    phone:     api.phone ?? "",
    status:    "Active",
    createdAt: api.created_at ?? new Date().toISOString().slice(0, 10),
  }
}

export async function getStaff(): Promise<StaffMember[]> {
  const [doctors, profiles] = await Promise.all([
    apiRequest<ApiDoctor[]>("/rest/v1/doctors?select=*&active=eq.true&order=full_name.asc"),
    apiRequest<ApiProfile[]>("/rest/v1/profiles?select=*&order=full_name.asc"),
  ])
  const doctorStaff  = (doctors  ?? []).map(apiDoctorToStaff)
  const profileStaff = (profiles ?? [])
    .filter((p) => p.role !== "paciente" && p.role !== "admin")
    .map(apiProfileToStaff)

  const ids = new Set(doctorStaff.map((d) => d.id))
  return [...doctorStaff, ...profileStaff.filter((p) => !ids.has(p.id))]
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
  email: data.email.trim(),
  password: password.trim(),
  full_name: data.name.trim(),
  phone: data.phone?.trim(),
  role: roleMap[data.role] ?? "secretaria",
  cpf: (doctorExtra?.cpf || data.cpf || "")
    .replace(/\D/g, "")
    .trim(),
}

console.log(
  "PAYLOAD JSON:",
  JSON.stringify(payload, null, 2)
)

if (!payload.email) throw new Error("E-mail obrigatório")
if (!payload.password) throw new Error("Senha obrigatória")
if (!payload.full_name) throw new Error("Nome obrigatório")
if (!payload.phone) throw new Error("Telefone obrigatório")
if (!payload.cpf) throw new Error("CPF obrigatório")

// ─── VALIDAÇÃO OBRIGATÓRIA ─────────────────────

if (!payload.email) {
  throw new Error("E-mail obrigatório")
}

if (!payload.password) {
  throw new Error("Senha obrigatória")
}

if (!payload.full_name) {
  throw new Error("Nome obrigatório")
}

if (!payload.phone) {
  throw new Error("Telefone obrigatório")
}

if (!payload.cpf) {
  throw new Error("CPF obrigatório")
}

console.log(
  "PAYLOAD JSON:",
  JSON.stringify(payload, null, 2)
)

// ─── CHAMADA DA API  // Passo 1: criar usuário auth com senha

const res = await apiRequest<{
  success?: boolean
  user?: {
    id: string
    email: string
    full_name: string
    roles: string[]
    email_confirmed_at: string | null
  }
  message?: string
}>("/functions/v1/create-user-with-password", {
  method: "POST",
  body: payload,
})

  if (!res?.user?.id) {
  throw new Error(
    res?.message || "Erro ao criar usuário na API"
  )
}

  const userId = res?.user?.id ?? ""

  // Passo 2: se médico, criar registro na tabela doctors
  if (data.role === "doctor" && doctorExtra) {
    try {
      await apiRequest("/functions/v1/create-doctor", {
        method: "POST",
        body: {
          email:        data.email,
          full_name:    data.name,
          cpf:          doctorExtra.cpf.replace(/\D/g, ""),
          crm:          doctorExtra.crmNum,
          crm_uf:       doctorExtra.crmUf.toUpperCase(),
          specialty:    doctorExtra.specialty,
          phone_mobile: data.phone || undefined,
        },
      })
    } catch (e) {
      // Usuário auth já foi criado — loga o erro mas não falha
      console.warn("[create-doctor] falhou após create-user-with-password:", e)
    }
  }

  return {
    ...data,
    id:        userId || crypto.randomUUID(),
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
    body: { full_name: member.name, email: member.email, phone: member.phone },
  })
  return member
}

export async function deleteStaffMember(id: string): Promise<void> {
  await apiRequest(`/rest/v1/profiles?id=eq.${id}`, { method: "DELETE" })
}

// ─── MOCK — módulos sem API ────────────────────────────────────────
export async function getMedicalRecords(): Promise<MedicalRecord[]> { return MEDICAL_RECORDS }
export async function createMedicalRecord(d: Omit<MedicalRecord, "id">): Promise<MedicalRecord> { return { ...d, id: Date.now() } }
export async function updateMedicalRecord(r: MedicalRecord): Promise<MedicalRecord> { return r }
export async function getPrescriptions(): Promise<Prescription[]> { return PRESCRIPTIONS }
export async function createPrescription(d: Omit<Prescription, "id">): Promise<Prescription> { return { ...d, id: Date.now() } }
export async function getMessages(): Promise<Message[]> { return MESSAGES }
export async function getMessageTemplates(): Promise<MessageTemplate[]> { return MESSAGE_TEMPLATES }
export async function sendMessage(d: Omit<Message, "id">): Promise<Message> { return { ...d, id: Date.now() } }
