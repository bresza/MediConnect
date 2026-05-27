export { login, createPatientAccount, requestPasswordReset, refreshSession, getUserInfoById } from "./auth"
export type {
  LoginResponse,
  LoginPayload,
  PatientSignupPayload,
  PatientSignupResponse,
  RefreshSessionResponse,
  UserInfoByIdResponse,
} from "./auth"

export {
  invokeRegisterPatient,
  invokeRegisterPatientWithPassword,
  isRegisterPatientConflict,
  RegisterPatientApiError,
} from "./registerPatient"
export type {
  RegisterPatientRequest,
  RegisterPatientWithPasswordRequest,
  RegisterPatientSuccess,
} from "./registerPatient"

export { apiRequest, setApiContext, ApiError, setUnauthorizedHandler, setSessionRefresher } from "./api"

export {
  getPatients, createPatient, createPatientWithPassword, createPatientPortalAccess, updatePatient, deletePatient,
} from "./patients"

export {
  getFinancialRecords, createFinancialRecord,
  updateFinancialRecord, deleteFinancialRecord,
} from "./financial"

export {
  getAppointments, createAppointment, updateAppointment, deleteAppointment,
} from "./appointments"

export {
  getMedicalRecords, createMedicalRecord, updateMedicalRecord,
  getPrescriptions,  createPrescription,
  getReports,        createReport,        updateReport,
  getMessages,       sendMessage,
  getStaff,          createStaffMember,   updateStaffMember, deleteStaffMember,
} from "./domain"

export { buildAIApiContextFromAppState } from "./aiContext"
export type { AIContextFromAppStateInput } from "./aiContext"

export { sendSms, sendWhatsApp, sendOutboundMessage, toE164BR } from "./messaging"
export type { SendSmsInput, SendWhatsAppInput, SendResult, OutboundMessageInput } from "./messaging"
export {
  notifyAppointmentBooked,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
} from "./appointmentNotifications"
