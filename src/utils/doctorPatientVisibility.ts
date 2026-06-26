import type { Appointment, Patient } from "../types"
import { getStaffCreatedPatientIds } from "../services/staffCreatedPatients"

/** Pacientes visíveis ao médico: consulta, cadastro próprio ou criados nesta sessão/navegador. */
export function buildDoctorPatientIdSet(
  patients: Patient[],
  doctorAppointments: Appointment[],
  doctorUserId: string,
): Set<string> {
  const ids = new Set(doctorAppointments.map((a) => a.patientId))
  for (const patient of patients) {
    if (patient.createdBy === doctorUserId) ids.add(patient.id)
  }
  for (const patientId of getStaffCreatedPatientIds(doctorUserId)) {
    ids.add(patientId)
  }
  return ids
}
export function filterPatientsForDoctor(
  patients: Patient[],
  doctorPatientIds: Set<string>,
): Patient[] {
  return patients.filter((p) => doctorPatientIds.has(p.id))
}
