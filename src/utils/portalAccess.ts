/**
 * When create-user-with-password says the email is already registered,
 * staff portal-access creation must not adopt an arbitrary profiles row.
 *
 * Adopting by email alone attaches another patient's (or a staff member's)
 * auth uid to this chart. The next login then resolves by user_id and the
 * original account sees/cancels the other person's appointments.
 *
 * Only reuse an existing auth user when it is already this patient.
 */

export const PORTAL_EMAIL_IN_USE =
  "Este e-mail já possui acesso ao portal. Use um e-mail diferente ou a opção «Esqueci minha senha» na tela de entrada."

export const PORTAL_EMAIL_LINKED_TO_OTHER_PATIENT =
  "Este e-mail já está vinculado a outro paciente. Use um e-mail diferente."

export interface DuplicatePortalEmailContext {
  currentPatientId: string
  currentPatientUserId?: string | null
  existingProfileId?: string | null
  /** patients.id already pointing at existingProfileId, if any */
  patientIdLinkedToProfile?: string | null
}

export type DuplicatePortalEmailDecision =
  | { ok: true; userId: string }
  | { ok: false; message: string }

function trimId(value?: string | null): string {
  return value?.trim() ?? ""
}

export function decideDuplicatePortalEmail(
  ctx: DuplicatePortalEmailContext,
): DuplicatePortalEmailDecision {
  const profileId = trimId(ctx.existingProfileId)
  const currentUserId = trimId(ctx.currentPatientUserId)
  const linkedPatientId = trimId(ctx.patientIdLinkedToProfile)
  const currentPatientId = trimId(ctx.currentPatientId)

  if (linkedPatientId && currentPatientId && linkedPatientId !== currentPatientId) {
    return { ok: false, message: PORTAL_EMAIL_LINKED_TO_OTHER_PATIENT }
  }

  const alreadyThisPatient =
    Boolean(profileId) && (
      (currentUserId && currentUserId === profileId) ||
      (linkedPatientId && linkedPatientId === currentPatientId)
    )

  if (alreadyThisPatient) {
    return { ok: true, userId: profileId }
  }

  return { ok: false, message: PORTAL_EMAIL_IN_USE }
}
