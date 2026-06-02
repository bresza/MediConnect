import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Appointment } from "../types"
import { useAuth } from "../contexts/authStore"
import {
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from "../services/appointments"
import { invalidateLookupCaches } from "../services/lookups"
import { getDefaultAppointmentRange } from "./query/appointmentRange"
import { appointmentKeys } from "./query/queryKeys"

export interface UseAppointmentsReturn {
  appointments:      Appointment[]
  isLoading:         boolean
  isFetching:        boolean
  error:             string | null
  addAppointment:    (a: Omit<Appointment, "id">) => Promise<void>
  updateAppointment: (a: Appointment) => Promise<void>
  deleteAppointment: (id: string) => Promise<void>
  reload:            () => Promise<void>
}

export function useAppointments(options?: { enabled?: boolean }): UseAppointmentsReturn {
  const { clinicId } = useAuth()
  const queryClient = useQueryClient()
  const enabled = options?.enabled ?? true
  const range = getDefaultAppointmentRange()

  const query = useQuery({
    queryKey: appointmentKeys.range(clinicId, range),
    queryFn: () => getAppointments(range),
    enabled,
    staleTime: 30_000,
  })

  const invalidate = () => {
    invalidateLookupCaches()
    return queryClient.invalidateQueries({ queryKey: appointmentKeys.all(clinicId) })
  }

  const addMutation = useMutation({
    mutationFn: (data: Omit<Appointment, "id">) => createAppointment(data),
    onSuccess: async () => { await invalidate() },
  })

  const updateMutation = useMutation({
    mutationFn: updateAppointment,
    onSuccess: async () => { await invalidate() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAppointment,
    onSuccess: async () => { await invalidate() },
  })

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    addAppointment: async (a) => { await addMutation.mutateAsync(a) },
    updateAppointment: async (a) => { await updateMutation.mutateAsync(a) },
    deleteAppointment: async (id) => { await deleteMutation.mutateAsync(id) },
    reload: async () => { await query.refetch() },
  }
}
