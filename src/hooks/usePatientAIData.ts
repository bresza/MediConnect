import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getPatientAppointmentsByIdentity } from "../services/appointments"
import {
  getPatientPrescriptionsByIdentity,
  getPatientReportsByIdentity,
} from "../services/domain"
import { getPatientByIdentity } from "../services/patients"
import type { Appointment, Patient, Prescription, Report, User } from "../types"

export interface PatientIdentity {
  patientId?: string
  userId?:   string
  name?:     string
  email?:    string
  cpf?:      string
}

function buildIdentity(user: User, seed?: Patient | null): PatientIdentity {
  const portal = seed ?? null
  const patientId = portal?.id ?? user.patientId ?? ""

  return {
    patientId: patientId || undefined,
    userId:    user.id,
    name:      portal?.name ?? user.name,
    email:     portal?.email ?? user.email,
    cpf:       portal?.cpf ?? user.patientCpf,
  }
}

/**
 * Carrega consultas, receitas e laudos do proprio paciente via APIs de
 * identidade (mesma estrategia do PatientPortal). O AppRouter usa isso
 * para o snapshot da IA quando o perfil e `patient`, pois a lista global
 * de `usePatients`/`useAppointments` costuma vir vazia ou com IDs
 * incompatíveis por RLS.
 */
export function usePatientAIData(user: User | null, seedPatient?: Patient | null) {
  const [patient,       setPatient]       = useState<Patient | null>(seedPatient ?? null)
  const [appointments,  setAppointments]  = useState<Appointment[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [reports,       setReports]       = useState<Report[]>([])
  const [loading,       setLoading]       = useState(false)
  const requestSeqRef = useRef(0)

  const identity = useMemo(
    () => (user ? buildIdentity(user, seedPatient ?? null) : null),
    [user, seedPatient],
  )

  const reload = useCallback(async () => {
    const requestId = ++requestSeqRef.current
    const isCurrentRequest = () => requestSeqRef.current === requestId

    if (!user || !identity) {
      setPatient(seedPatient ?? null)
      setAppointments([])
      setPrescriptions([])
      setReports([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const linked = await getPatientByIdentity({
        patientId: user.patientId ?? seedPatient?.id,
        userId:    user.id,
        name:      seedPatient?.name ?? user.name,
        email:     seedPatient?.email ?? user.email,
        cpf:       seedPatient?.cpf ?? user.patientCpf,
      }).catch(() => seedPatient ?? null)

      if (!isCurrentRequest()) return

      setPatient(linked ?? seedPatient ?? null)

      const id = linked?.id ?? identity.patientId
      if (!id) {
        setAppointments([])
        setPrescriptions([])
        setReports([])
        return
      }

      const resolvedIdentity: PatientIdentity = {
        ...identity,
        patientId: id,
        name:      linked?.name ?? identity.name,
        email:     linked?.email ?? identity.email,
        cpf:       linked?.cpf ?? identity.cpf,
      }

      const [appts, rx, reps] = await Promise.all([
        getPatientAppointmentsByIdentity(resolvedIdentity).catch(() => []),
        getPatientPrescriptionsByIdentity(resolvedIdentity).catch(() => []),
        getPatientReportsByIdentity(resolvedIdentity).catch(() => []),
      ])

      if (!isCurrentRequest()) return

      setAppointments(appts)
      setPrescriptions(rx)
      setReports(reps)
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }, [user, identity, seedPatient])

  useEffect(() => { void reload() }, [reload])

  return { patient, appointments, prescriptions, reports, loading, reload }
}
