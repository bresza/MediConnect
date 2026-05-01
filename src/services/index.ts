export { login, getDemoAccounts }  from "./auth"
export type { LoginResponse, LoginPayload, DemoAccount } from "./auth"

export { apiRequest, setApiContext, ApiError, setUnauthorizedHandler } from "./api"

export {
  getPatients, createPatient, updatePatient, deletePatient,
} from "./patients"

export {
  getFinancialRecords, createFinancialRecord,
  updateFinancialRecord, deleteFinancialRecord,
} from "./financial"

export {
  getAppointments, createAppointment, updateAppointment, deleteAppointment,
} from "./appointments"

export {
  getDoctorAvailability, createDoctorAvailability,
} from "./availability"
export type { DoctorAvailability, CreateDoctorAvailabilityInput } from "./availability"

export {
  getMedicalRecords, createMedicalRecord, updateMedicalRecord,
  getPrescriptions,  createPrescription,
  getReports,        createReport,        updateReport,
  getMessages,       getMessageTemplates, sendMessage,
  getStaff,          createStaffMember,   updateStaffMember, deleteStaffMember,
} from "./domain"
