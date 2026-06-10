import { useState, useEffect, useCallback } from "react"
import type { Patient } from "../types"
import {
  getPatients,
  createPatient,
  createPatientWithPassword,
  createPatientPortalAccess,
  resetPatientPortalPassword,
  updatePatient,
  deletePatient,
} from "../services/patients"

export interface UsePatientsReturn {
  patients:      Patient[]
  isLoading:     boolean
  error:         string | null
  addPatient:    (p: Omit<Patient, "id">) => Promise<Patient>
  addPatientWithPassword: (p: Omit<Patient, "id">, password: string) => Promise<Patient>
  createPatientAccess: (p: Patient, password: string) => Promise<Patient>
  resetPatientAccess: (p: Patient, password: string) => Promise<Patient>
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

  const addPatientWithPassword = useCallback(async (p: Omit<Patient, "id">, password: string) => {
    const created = await createPatientWithPassword(p, password)
    setPatients((prev) => [...prev, created])
    return created
  }, [])

  const createPatientAccess = useCallback(async (p: Patient, password: string) => {
    const saved = await createPatientPortalAccess(p, password)
    setPatients((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
    return saved
  }, [])

  const resetPatientAccess = useCallback(async (p: Patient, password: string) => {
    const saved = await resetPatientPortalPassword(p, password)
    // A recriação gera um novo id de paciente, então recarregamos a lista do
    // servidor para refletir o registro atualizado (remove o id antigo).
    await load()
    return saved
  }, [load])

  const updatePatientFn = useCallback(async (p: Patient) => {
    const saved = await updatePatient(p)
    setPatients((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }, [])

  const deletePatientFn = useCallback(async (id: string) => {
    await deletePatient(id)
    setPatients((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return {
    patients,
    isLoading,
    error,
    addPatient,
    addPatientWithPassword,
    createPatientAccess,
    resetPatientAccess,
    updatePatient: updatePatientFn,
    deletePatient: deletePatientFn,
    reload: load,
  }
}
