import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { StaffMember } from "../types"
import { useAuth } from "../contexts/authStore"
import { getStaff, createStaffMember, updateStaffMember, deleteStaffMember } from "../services/domain"
import type { DoctorExtra } from "../services/domain"
import { staffKeys } from "./query/queryKeys"

export type { DoctorExtra }

export interface UseStaffReturn {
  staff:       StaffMember[]
  isLoading:   boolean
  error:       string | null
  addStaff:    (member: Omit<StaffMember, "id" | "createdAt">, password?: string, doctorExtra?: DoctorExtra) => Promise<void>
  updateStaff: (member: StaffMember) => Promise<void>
  deleteStaff: (id: string) => Promise<void>
  reload:      () => Promise<void>
}

export function useStaff(options?: { enabled?: boolean }): UseStaffReturn {
  const enabled = options?.enabled ?? true
  const { clinicId } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: staffKeys.all(clinicId),
    queryFn: getStaff,
    enabled,
    staleTime: 120_000,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: staffKeys.all(clinicId) })

  const addMutation = useMutation({
    mutationFn: ({
      member,
      password,
      doctorExtra,
    }: {
      member: Omit<StaffMember, "id" | "createdAt">
      password?: string
      doctorExtra?: DoctorExtra
    }) => createStaffMember(member, password, doctorExtra),
    onSuccess: async () => { await invalidate() },
  })

  const updateMutation = useMutation({
    mutationFn: updateStaffMember,
    onSuccess: async () => { await invalidate() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteStaffMember,
    onSuccess: async () => { await invalidate() },
  })

  const staff = query.data ?? []

  const deleteStaffFn = async (id: string) => {
    const member = staff.find((m) => m.id === id)
    if (!member) throw new Error("Profissional não encontrado.")
    await deleteMutation.mutateAsync(member)
  }

  return {
    staff,
    isLoading: enabled && query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    addStaff: async (member, password, doctorExtra) => {
      await addMutation.mutateAsync({ member, password, doctorExtra })
    },
    updateStaff: async (updated) => { await updateMutation.mutateAsync(updated) },
    deleteStaff: deleteStaffFn,
    reload: async () => { await query.refetch() },
  }
}
