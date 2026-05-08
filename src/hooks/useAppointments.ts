import { useState, useEffect, useCallback } from "react"
import type { Appointment } from "../types"
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from "../services/appointments"

export interface UseAppointmentsReturn {
  appointments:      Appointment[]
  isLoading:         boolean
  error:             string | null
  addAppointment:    (a: Omit<Appointment, "id">) => Promise<void>
  updateAppointment: (a: Appointment) => Promise<void>
  deleteAppointment: (id: string) => Promise<void>
  reload:            () => Promise<void>
}

export function useAppointments(): UseAppointmentsReturn {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      setAppointments(await getAppointments())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar agendamentos")
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const addAppointment = useCallback(async (a: Omit<Appointment, "id">) => {
    const created = await createAppointment(a)
    setAppointments((prev) => [...prev, created])
  }, [])

  const updateAppointmentFn = useCallback(async (a: Appointment) => {
    const saved = await updateAppointment(a)
    setAppointments((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
  }, [])

  const deleteAppointmentFn = useCallback(async (id: string) => {
    await deleteAppointment(id)
    setAppointments((prev) => prev.filter((x) => x.id !== id))
  }, [])

  return { appointments, isLoading, error, addAppointment, updateAppointment: updateAppointmentFn, deleteAppointment: deleteAppointmentFn, reload: load }
}
