import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { MedicalRecord, Prescription } from "../types"
import { useAuth } from "../contexts/authStore"
import {
  createMedicalRecord,
  createPrescription,
  getPrescriptions,
} from "../services/domain"
import { medicalKeys, reportKeys } from "./query/queryKeys"

export interface UseMedicalDataReturn {
  prescriptions:     Prescription[]
  isLoading:         boolean
  error:             string | null
  addPrescription:   (p: Omit<Prescription, "id">) => Promise<Prescription>
  addMedicalRecord:  (r: Omit<MedicalRecord, "id">) => Promise<MedicalRecord>
  reload:            () => Promise<void>
}

export function useMedicalData(options?: { enabled?: boolean }): UseMedicalDataReturn {
  const enabled = options?.enabled ?? true
  const { clinicId } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: medicalKeys.prescriptions(clinicId),
    queryFn: getPrescriptions,
    enabled,
    staleTime: 60_000,
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: medicalKeys.all(clinicId) }),
      queryClient.invalidateQueries({ queryKey: reportKeys.all(clinicId) }),
    ])

  const addPrescriptionMutation = useMutation({
    mutationFn: createPrescription,
    onSuccess: async () => { await invalidate() },
  })

  const addMedicalRecordMutation = useMutation({
    mutationFn: createMedicalRecord,
    onSuccess: async () => { await invalidate() },
  })

  return {
    prescriptions: query.data ?? [],
    isLoading: enabled && query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    addPrescription: (p) => addPrescriptionMutation.mutateAsync(p),
    addMedicalRecord: (r) => addMedicalRecordMutation.mutateAsync(r),
    reload: async () => { await query.refetch() },
  }
}
