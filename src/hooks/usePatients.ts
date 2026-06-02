import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Patient } from "../types"
import { useAuth } from "../contexts/authStore"
import {
  getPatients,
  createPatient,
  createPatientWithPassword,
  createPatientPortalAccess,
  updatePatient,
  deletePatient,
} from "../services/patients"
import { invalidateLookupCaches } from "../services/lookups"
import { patientKeys } from "./query/queryKeys"

export interface UsePatientsReturn {
  patients:      Patient[]
  isLoading:     boolean
  isFetching:    boolean
  error:         string | null
  addPatient:    (p: Omit<Patient, "id">) => Promise<Patient>
  addPatientWithPassword: (p: Omit<Patient, "id">, password: string) => Promise<Patient>
  createPatientAccess: (p: Patient, password: string) => Promise<Patient>
  updatePatient: (p: Patient) => Promise<Patient>
  deletePatient: (id: string) => Promise<void>
  reload:        () => Promise<void>
}

export function usePatients(options?: { enabled?: boolean }): UsePatientsReturn {
  const { clinicId } = useAuth()
  const queryClient = useQueryClient()
  const enabled = options?.enabled ?? true

  const query = useQuery({
    queryKey: patientKeys.list(clinicId, {}),
    queryFn: () => getPatients({ skipPhotos: true }),
    enabled,
    staleTime: 120_000,
  })

  const invalidate = () => {
    invalidateLookupCaches()
    return queryClient.invalidateQueries({ queryKey: patientKeys.all(clinicId) })
  }

  const addPatientMutation = useMutation({
    mutationFn: createPatient,
    onSuccess: async () => { await invalidate() },
  })

  const addPatientWithPasswordMutation = useMutation({
    mutationFn: ({ p, password }: { p: Omit<Patient, "id">; password: string }) =>
      createPatientWithPassword(p, password),
    onSuccess: async () => { await invalidate() },
  })

  const createPatientAccessMutation = useMutation({
    mutationFn: ({ p, password }: { p: Patient; password: string }) =>
      createPatientPortalAccess(p, password),
    onSuccess: async () => { await invalidate() },
  })

  const updatePatientMutation = useMutation({
    mutationFn: updatePatient,
    onSuccess: async () => { await invalidate() },
  })

  const deletePatientMutation = useMutation({
    mutationFn: deletePatient,
    onSuccess: async () => { await invalidate() },
  })

  return {
    patients: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    addPatient: (p) => addPatientMutation.mutateAsync(p),
    addPatientWithPassword: (p, password) =>
      addPatientWithPasswordMutation.mutateAsync({ p, password }),
    createPatientAccess: (p, password) =>
      createPatientAccessMutation.mutateAsync({ p, password }),
    updatePatient: (p) => updatePatientMutation.mutateAsync(p),
    deletePatient: async (id) => { await deletePatientMutation.mutateAsync(id) },
    reload: async () => { await query.refetch() },
  }
}
