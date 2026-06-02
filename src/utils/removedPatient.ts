import { onlyDigits } from "./masks"
import type { Patient } from "../types"

/** Registro técnico criado ao excluir pacientes com vínculos na agenda. */
export const REMOVED_PATIENT_EMAIL = "paciente.removido@mediconnect.local"
export const REMOVED_PATIENT_CPF = "52998224725"
export const REMOVED_PATIENT_NAME = "Paciente removido"

type RemovedPatientLike = Pick<Patient, "email" | "cpf" | "name"> | null | undefined

export function isRemovedPatientPlaceholder(patient: RemovedPatientLike): boolean {
  if (!patient) return false
  const email = patient.email?.trim().toLowerCase()
  if (email === REMOVED_PATIENT_EMAIL) return true
  if (onlyDigits(patient.cpf) === REMOVED_PATIENT_CPF) return true
  const name = patient.name?.trim().toLowerCase()
  return name === REMOVED_PATIENT_NAME.toLowerCase()
}

export function withoutRemovedPatientPlaceholders(patients: Patient[]): Patient[] {
  return patients.filter((p) => !isRemovedPatientPlaceholder(p))
}
