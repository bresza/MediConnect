import { useState, useEffect, useCallback } from "react"
import type { StaffMember } from "../types"
import { getStaff, createStaffMember, updateStaffMember, deleteStaffMember } from "../services/domain"
import type { DoctorExtra } from "../services/domain"

export type { DoctorExtra }

export interface UseStaffReturn {
  staff:       StaffMember[]
  isLoading:   boolean
  error:       string | null
  addStaff:    (member: Omit<StaffMember, "id" | "createdAt">, password: string, doctorExtra?: DoctorExtra) => Promise<void>
  updateStaff: (member: StaffMember) => Promise<void>
  deleteStaff: (id: string) => Promise<void>
  reload:      () => Promise<void>
}

export function useStaff(): UseStaffReturn {
  const [staff,     setStaff]     = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true); setError(null)
    try { setStaff(await getStaff()) }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar equipe") }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const addStaff = useCallback(async (
    member:      Omit<StaffMember, "id" | "createdAt">,
    password:    string,
    doctorExtra?: DoctorExtra,
  ) => {
    await createStaffMember(member, password, doctorExtra)
    await load()
  }, [load])

  const updateStaff = useCallback(async (updated: StaffMember) => {
    const saved = await updateStaffMember(updated)
    setStaff((prev) => prev.map((m) => (m.id === saved.id ? saved : m)))
  }, [])

  const deleteStaff = useCallback(async (id: string) => {
    const member = staff.find((m) => m.id === id)
    if (!member) throw new Error("Profissional não encontrado.")

    await deleteStaffMember(member)
    setStaff((prev) => prev.filter((m) =>
      m.id !== member.id &&
      m.email.toLowerCase() !== member.email.toLowerCase(),
    ))
  }, [staff])

  return { staff, isLoading, error, addStaff, updateStaff, deleteStaff, reload: load }
}
