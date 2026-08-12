/**
 * Tracks which consultation persist steps already succeeded for an
 * appointment so a retry after a mid-flight failure does not create
 * duplicate prontuários / receitas / cobranças.
 */

export interface ConsultationSaveProgress {
  appointmentId: string | null
  medical: boolean
  prescription: boolean
  financial: boolean
}

export function emptyConsultationSaveProgress(
  appointmentId: string | null = null,
): ConsultationSaveProgress {
  return {
    appointmentId,
    medical: false,
    prescription: false,
    financial: false,
  }
}

/** Align progress to the appointment being saved; reset if it changed. */
export function progressForAppointment(
  progress: ConsultationSaveProgress,
  appointmentId: string,
): ConsultationSaveProgress {
  if (progress.appointmentId === appointmentId) return progress
  return emptyConsultationSaveProgress(appointmentId)
}

export function consultationStepsToSave(
  progress: ConsultationSaveProgress,
  hasPrescription: boolean,
): { saveMedical: boolean; savePrescription: boolean; saveFinancial: boolean } {
  return {
    saveMedical: !progress.medical,
    savePrescription: hasPrescription && !progress.prescription,
    saveFinancial: !progress.financial,
  }
}

export function markConsultationStep(
  progress: ConsultationSaveProgress,
  step: "medical" | "prescription" | "financial",
): ConsultationSaveProgress {
  return { ...progress, [step]: true }
}
