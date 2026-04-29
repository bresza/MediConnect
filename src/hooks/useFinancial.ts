import { useState, useEffect, useCallback } from "react"
import type { FinancialRecord } from "../types"
import {
  getFinancialRecords,
  createFinancialRecord,
  updateFinancialRecord,
  deleteFinancialRecord,
} from "../services/financial"

export interface UseFinancialReturn {
  records:       FinancialRecord[]
  isLoading:     boolean
  error:         string | null
  addRecord:     (r: Omit<FinancialRecord, "id">) => Promise<FinancialRecord>
  updateRecord:  (r: FinancialRecord) => Promise<void>
  deleteRecord:  (id: string) => Promise<void>
  reload:        () => Promise<void>
}

export function useFinancial(): UseFinancialReturn {
  const [records,   setRecords]   = useState<FinancialRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getFinancialRecords()
      setRecords(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar registros financeiros")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRecord = useCallback(async (r: Omit<FinancialRecord, "id">) => {
    const created = await createFinancialRecord(r)
    setRecords((prev) => [...prev, created])
    return created
  }, [])

  const updateRecord = useCallback(async (r: FinancialRecord) => {
    const saved = await updateFinancialRecord(r)
    setRecords((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }, [])

  const deleteRecord = useCallback(async (id: string) => {
    await deleteFinancialRecord(id)
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { records, isLoading, error, addRecord, updateRecord, deleteRecord, reload: load }
}
