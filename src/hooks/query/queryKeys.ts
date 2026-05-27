export type PatientListFilters = {
  search?: string
  limit?: number
  offset?: number
}

export type AppointmentRange = {
  from: string
  to: string
}

export const patientKeys = {
  all: (clinicId: string | null) => ["patients", clinicId ?? "default"] as const,
  list: (clinicId: string | null, filters: PatientListFilters = {}) =>
    [...patientKeys.all(clinicId), filters] as const,
}

export const appointmentKeys = {
  all: (clinicId: string | null) => ["appointments", clinicId ?? "default"] as const,
  range: (clinicId: string | null, range: AppointmentRange) =>
    [...appointmentKeys.all(clinicId), range] as const,
}

export const reportKeys = {
  all: (clinicId: string | null) => ["reports", clinicId ?? "default"] as const,
}

export const financialKeys = {
  all: (clinicId: string | null) => ["financial", clinicId ?? "default"] as const,
}

export const staffKeys = {
  all: (clinicId: string | null) => ["staff", clinicId ?? "default"] as const,
}

export const medicalKeys = {
  all: (clinicId: string | null) => ["medical", clinicId ?? "default"] as const,
  prescriptions: (clinicId: string | null) =>
    [...medicalKeys.all(clinicId), "prescriptions"] as const,
}

export const messageKeys = {
  all: (clinicId: string | null) => ["messages", clinicId ?? "default"] as const,
  list: (clinicId: string | null, cursor?: string) =>
    [...messageKeys.all(clinicId), { cursor: cursor ?? "0" }] as const,
}
