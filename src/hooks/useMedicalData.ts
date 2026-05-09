import { useState, useEffect, useCallback } from "react"
import type { Prescription } from "../types"
import {
  getPrescriptions,
  createPrescription,
} from "../services/domain"

export interface UseMedicalDataReturn {
  prescriptions:     Prescription[]
  isLoading:         boolean
  error:             string | null
  addPrescription:   (p: Omit<Prescription, "id">) => Promise<void>
  reload:            () => Promise<void>
}

export function useMedicalData(): UseMedicalDataReturn {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setPrescriptions(await getPrescriptions())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados médicos")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addPrescription = useCallback(async (p: Omit<Prescription, "id">) => {
    const created = await createPrescription(p)
    setPrescriptions((prev) => [...prev, created])
  }, [])

  return {
    prescriptions,
    isLoading,
    error,
    addPrescription,
    reload: load,
  }
}
