import { useCallback, useEffect, useMemo, useState } from "react"
import { getPatientAppointmentsByIdentity } from "../services/appointments"
import {
  getPatientPrescriptionsByIdentity,
  getPatientReportsByIdentity,
} from "../services/domain"
import { getPatientByIdentity } from "../services/patients"
import { resolvePatientIdFromApi } from "../services/userInfo"
import { resolveRememberedPatientId } from "../services/patientLinks"
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
  const patientId = resolveRememberedPatientId({
    authUserId: user.id,
    name:  portal?.name ?? user.name,
    email: portal?.email ?? user.email,
    cpf:   portal?.cpf ?? user.patientCpf,
  }) ?? portal?.id ?? user.patientId ?? ""

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

  // IMPORTANTE: o memo de `identity` NUNCA pode depender do estado interno
  // `patient`. Como `setPatient(linked)` corre dentro de `reload`, ligar a
  // identity ao patient cria o ciclo:
  //   reload → setPatient → identity (nova ref) → reload (nova ref) →
  //   useEffect dispara → reload → ...
  // O enriquecimento com o registro encontrado é feito *dentro* do reload
  // ao montar `resolvedIdentity`, sem precisar voltar pro memo.
  const identity = useMemo(
    () => (user ? buildIdentity(user, seedPatient ?? null) : null),
    [user, seedPatient],
  )

  const reload = useCallback(async () => {
    if (!user || !identity) return
    setLoading(true)
    try {
      await resolvePatientIdFromApi().catch(() => null)

      const linked = await getPatientByIdentity({
        patientId: user.patientId ?? seedPatient?.id,
        userId:    user.id,
        name:      seedPatient?.name ?? user.name,
        email:     seedPatient?.email ?? user.email,
        cpf:       seedPatient?.cpf ?? user.patientCpf,
      }).catch(() => seedPatient ?? null)

      if (linked) {
        // Só atualiza se mudou de fato, evitando re-renders/refetches em série.
        setPatient((prev) => (prev && prev.id === linked.id ? prev : linked))
      }

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
      setAppointments(appts)
      setPrescriptions(rx)
      setReports(reps)
    } finally {
      setLoading(false)
    }
  }, [user, identity, seedPatient])

  useEffect(() => { void reload() }, [reload])

  return { patient, appointments, prescriptions, reports, loading, reload }
}
