import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { FinancialRecord } from "../types"
import { useAuth } from "../contexts/authStore"
import {
  getFinancialRecords,
  createFinancialRecord,
  updateFinancialRecord,
  deleteFinancialRecord,
} from "../services/financial"
import { financialKeys } from "./query/queryKeys"

export interface UseFinancialReturn {
  records:       FinancialRecord[]
  isLoading:     boolean
  error:         string | null
  addRecord:     (r: Omit<FinancialRecord, "id">) => Promise<FinancialRecord>
  updateRecord:  (r: FinancialRecord) => Promise<void>
  deleteRecord:  (id: string) => Promise<void>
  reload:        () => Promise<void>
}

export function useFinancial(options?: { enabled?: boolean }): UseFinancialReturn {
  const enabled = options?.enabled ?? true
  const { clinicId } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: financialKeys.all(clinicId),
    queryFn: getFinancialRecords,
    enabled,
    staleTime: 60_000,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: financialKeys.all(clinicId) })

  const addMutation = useMutation({
    mutationFn: createFinancialRecord,
    onSuccess: async () => { await invalidate() },
  })

  const updateMutation = useMutation({
    mutationFn: updateFinancialRecord,
    onSuccess: async () => { await invalidate() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFinancialRecord,
    onSuccess: async () => { await invalidate() },
  })

  return {
    records: query.data ?? [],
    isLoading: enabled && query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    addRecord: (r) => addMutation.mutateAsync(r),
    updateRecord: async (r) => { await updateMutation.mutateAsync(r) },
    deleteRecord: async (id) => { await deleteMutation.mutateAsync(id) },
    reload: async () => { await query.refetch() },
  }
}
