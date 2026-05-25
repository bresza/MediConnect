import { apiRequest, getApiUserId } from "./api"
import type { FinancialRecord, PaymentMethod, PaymentStatus } from "../types"

const FINANCIAL_RECORD_EXAM = "Registro Financeiro"

interface ApiReport {
  id: string
  patient_id: string
  status?: string
  exam?: string
  requested_by?: string
  cid_code?: string
  diagnosis?: string
  conclusion?: string
  content_html?: string
  content_json?: unknown
  created_at?: string
  updated_at?: string
}

interface ApiPatientName {
  id: string
  full_name: string
}

interface FinancialJson {
  patient_name?: string
  appointment_id?: string
  value?: number
  discount?: number
  payment_method?: PaymentMethod
  health_insurance?: string
  due_date?: string
  status?: PaymentStatus
  observations?: string
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

function asFinancialJson(value: unknown): FinancialJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as FinancialJson
}

function apiToFinancialRecord(api: ApiReport, patientName = ""): FinancialRecord {
  const json = asFinancialJson(api.content_json)
  return {
    id: String(api.id),
    patientId: api.patient_id,
    patientName: json.patient_name ?? patientName,
    appointmentId: json.appointment_id,
    value: Number(json.value ?? 0),
    discount: json.discount,
    paymentMethod: (json.payment_method ?? "Pix") as PaymentMethod,
    healthInsurance: json.health_insurance,
    dueDate: json.due_date ?? api.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    status: (json.status ?? (api.status === "delivered" ? "Paid" : "Pending")) as PaymentStatus,
    observations: json.observations ?? api.conclusion,
  }
}

function financialRecordContent(record: Omit<FinancialRecord, "id">): string {
  return [
    `Paciente: ${record.patientName}`,
    `Valor: R$ ${record.value.toFixed(2)}`,
    record.discount ? `Desconto: R$ ${record.discount.toFixed(2)}` : "",
    `Método: ${record.paymentMethod}`,
    record.healthInsurance ? `Convênio: ${record.healthInsurance}` : "",
    `Vencimento: ${record.dueDate}`,
    `Status: ${record.status}`,
    record.observations ? `Observações: ${record.observations}` : "",
  ].filter(Boolean).join("\n")
}

function financialRecordToReport(record: Omit<FinancialRecord, "id">): Record<string, unknown> {
  const uid = getApiUserId()
  return compactPayload({
    patient_id: record.patientId,
    status: record.status === "Paid" ? "delivered" : "draft",
    exam: FINANCIAL_RECORD_EXAM,
    requested_by: uid ?? undefined,
    diagnosis: "Lançamento financeiro",
    conclusion: record.observations,
    content_html: financialRecordContent(record),
    content_json: compactPayload({
      patient_name: record.patientName,
      appointment_id: record.appointmentId,
      value: record.value,
      discount: record.discount,
      payment_method: record.paymentMethod,
      health_insurance: record.healthInsurance,
      due_date: record.dueDate,
      status: record.status,
      observations: record.observations,
    }),
    hide_date: true,
    hide_signature: true,
  })
}

export async function getFinancialRecords(): Promise<FinancialRecord[]> {
  const [records, patients] = await Promise.all([
    apiRequest<ApiReport[]>(`/rest/v1/reports?select=*&exam=eq.${encodeURIComponent(FINANCIAL_RECORD_EXAM)}&order=created_at.desc`),
    apiRequest<ApiPatientName[]>("/rest/v1/patients?select=id,full_name"),
  ])
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p.full_name]))
  return (records ?? []).map((record) =>
    apiToFinancialRecord(record, patientMap.get(record.patient_id) ?? ""),
  )
}

export async function createFinancialRecord(
  data: Omit<FinancialRecord, "id">,
): Promise<FinancialRecord> {
  const created = await apiRequest<ApiReport[]>("/rest/v1/reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: financialRecordToReport(data),
  })
  const raw = Array.isArray(created) ? created[0] : (created as ApiReport)
  return apiToFinancialRecord(raw, data.patientName)
}

export async function updateFinancialRecord(
  record: FinancialRecord,
): Promise<FinancialRecord> {
  await apiRequest(`/rest/v1/reports?id=eq.${record.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: financialRecordToReport(record),
  })
  return record
}

export async function deleteFinancialRecord(id: string): Promise<void> {
  await apiRequest<void>(`/rest/v1/reports?id=eq.${id}`, { method: "DELETE" })
}

interface PatientLookup {
  patientId?: string
  userId?: string
  name?: string
  email?: string
  cpf?: string
}

function recordMatchesPatient(record: FinancialRecord, identity: PatientLookup): boolean {
  if (identity.patientId && record.patientId === identity.patientId) return true
  if (identity.name && record.patientName.trim().toLowerCase() === identity.name.trim().toLowerCase()) return true
  return false
}

export async function getPatientFinancialRecordsByIdentity(
  identity: PatientLookup,
): Promise<FinancialRecord[]> {
  const records = await getFinancialRecords()
  return records.filter((record) => recordMatchesPatient(record, identity))
}
