import { apiRequest } from "./api"
import { FINANCIAL_RECORDS } from "../data/mock"
import type { FinancialRecord } from "../types"

export async function getFinancialRecords(): Promise<FinancialRecord[]> {
  if (import.meta.env.VITE_API_URL) {
    return apiRequest<FinancialRecord[]>("/financial")
  }
  return Promise.resolve(FINANCIAL_RECORDS)
}

export async function createFinancialRecord(
  data: Omit<FinancialRecord, "id">,
): Promise<FinancialRecord> {
  if (import.meta.env.VITE_API_URL) {
    return apiRequest<FinancialRecord>("/financial", { method: "POST", body: data })
  }
  const record: FinancialRecord = { ...data, id: Date.now() }
  return Promise.resolve(record)
}

export async function updateFinancialRecord(
  record: FinancialRecord,
): Promise<FinancialRecord> {
  if (import.meta.env.VITE_API_URL) {
    return apiRequest<FinancialRecord>(`/financial/${record.id}`, {
      method: "PUT",
      body: record,
    })
  }
  return Promise.resolve(record)
}

export async function deleteFinancialRecord(id: number): Promise<void> {
  if (import.meta.env.VITE_API_URL) {
    return apiRequest<void>(`/financial/${id}`, { method: "DELETE" })
  }
  return Promise.resolve()
}
