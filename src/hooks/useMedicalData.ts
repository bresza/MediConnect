import { useState, useEffect, useCallback } from "react"
import type { MedicalRecord, Prescription } from "../types"
import {
  getMedicalRecords,
  createMedicalRecord,
  updateMedicalRecord,
  getPrescriptions,
  createPrescription,
} from "../services/domain"

export interface UseMedicalDataReturn {
  records:           MedicalRecord[]
  prescriptions:     Prescription[]
  isLoading:         boolean
  error:             string | null
  addRecord:         (r: Omit<MedicalRecord, "id">) => Promise<void>
  updateRecord:      (r: MedicalRecord) => Promise<void>
  addPrescription:   (p: Omit<Prescription, "id">) => Promise<void>
  reload:            () => Promise<void>
}

export function useMedicalData(): UseMedicalDataReturn {
  const [records,       setRecords]       = useState<MedicalRecord[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [rec, presc] = await Promise.all([getMedicalRecords(), getPrescriptions()])
      setRecords(rec)
      setPrescriptions(presc)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar prontuários")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRecord = useCallback(async (r: Omit<MedicalRecord, "id">) => {
    const created = await createMedicalRecord(r)
    setRecords((prev) => [...prev, created])
  }, [])

  const updateRecord = useCallback(async (r: MedicalRecord) => {
    const saved = await updateMedicalRecord(r)
    setRecords((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }, [])

  const addPrescription = useCallback(async (p: Omit<Prescription, "id">) => {
    const created = await createPrescription(p)
    setPrescriptions((prev) => [...prev, created])
  }, [])

  return {
    records,
    prescriptions,
    isLoading,
    error,
    addRecord,
    updateRecord,
    addPrescription,
    reload: load,
  }
}
