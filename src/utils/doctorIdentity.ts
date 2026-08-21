export interface DoctorIdentityUser {
  id: string
  doctorId?: string
  email?: string
  crm?: string
}

export interface DoctorRowIdentity {
  id: string
  email?: string
  crm?: string
}

function normalizeEmail(value?: string): string {
  return value?.trim().toLowerCase() ?? ""
}

function crmDigits(value?: string): string {
  return value?.replace(/\D/g, "") ?? ""
}

/** Stable IDs that may identify the logged-in doctor (auth user id and/or doctors.id). */
export function ownDoctorIds(user: Pick<DoctorIdentityUser, "id" | "doctorId">): string[] {
  return [user.doctorId, user.id].filter((id, index, all): id is string =>
    Boolean(id) && all.indexOf(id) === index,
  )
}

/**
 * True when a clinical row belongs to the logged-in doctor.
 * Matches only stable IDs — never display name (homonyms would leak PHI).
 */
export function isOwnedByDoctor(
  record: { doctorId?: string },
  user: Pick<DoctorIdentityUser, "id" | "doctorId">,
): boolean {
  const doctorId = record.doctorId?.trim()
  if (!doctorId) return false
  return ownDoctorIds(user).includes(doctorId)
}

/**
 * Resolve the logged-in doctor inside a `doctors` list.
 * Order: id / doctorId, then email, then unique non-empty CRM. Never name.
 */
export function findDoctorForUser<T extends DoctorRowIdentity>(
  doctors: T[],
  user: DoctorIdentityUser,
): T | undefined {
  const ids = new Set(ownDoctorIds(user))
  const byId = doctors.find((doctor) => ids.has(doctor.id))
  if (byId) return byId

  const email = normalizeEmail(user.email)
  if (email) {
    const byEmail = doctors.find((doctor) => normalizeEmail(doctor.email) === email)
    if (byEmail) return byEmail
  }

  const crm = crmDigits(user.crm)
  if (!crm) return undefined
  const byCrm = doctors.filter((doctor) => crmDigits(doctor.crm) === crm)
  return byCrm.length === 1 ? byCrm[0] : undefined
}
