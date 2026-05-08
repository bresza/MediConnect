import { useState, useEffect, useCallback } from "react"
import type { Patient } from "../types"
import { getPatients, createPatient, updatePatient, deletePatient } from "../services/patients"

export interface UsePatientsReturn {
  patients:      Patient[]
  isLoading:     boolean
  error:         string | null
  addPatient:    (p: Omit<Patient, "id">) => Promise<Patient>
  updatePatient: (p: Patient) => Promise<void>
  deletePatient: (id: string) => Promise<void>
  reload:        () => Promise<void>
}

export function usePatients(): UsePatientsReturn {
  const [patients,  setPatients]  = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      setPatients(await getPatients())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar pacientes")
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const addPatient = useCallback(async (p: Omit<Patient, "id">) => {
    const created = await createPatient(p)
    setPatients((prev) => [...prev, created])
    return created
  }, [])

  const updatePatientFn = useCallback(async (p: Patient) => {
    const saved = await updatePatient(p)
    setPatients((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }, [])

  const deletePatientFn = useCallback(async (id: string) => {
    await deletePatient(id)
    setPatients((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { patients, isLoading, error, addPatient, updatePatient: updatePatientFn, deletePatient: deletePatientFn, reload: load }
}
