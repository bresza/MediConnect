// ─── USER & PERMISSIONS ───────────────────────────────────────────
export type UserRole = "doctor" | "manager" | "financial" | "secretary"

export interface User {
  id: number
  name: string
  role: UserRole
  email: string
  crm?: string
  specialty?: string
}

// ─── PATIENT ──────────────────────────────────────────────────────
export type PatientStatus = "Active" | "Inactive"
export type Gender = "Male" | "Female" | "Other"
export type MaritalStatus = "Single" | "Married" | "Divorced" | "Widowed" | "StableUnion"
export type Ethnicity = "Black" | "Mixed" | "White" | "Asian" | "Indigenous"
export type DocumentType = "CPF" | "RG" | "CNH" | "Passport"
export type CommunicationChannel = "WhatsApp" | "Email" | "SMS" | "Phone"
export type CommunicationFrequency = "EssentialOnly" | "RemindersAndConfirmations" | "All"

export interface PatientDocument {
  type: DocumentType
  number: string
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export interface Address {
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  reference?: string 
}

export interface Attachment {
  id: number
  name: string
  url: string
  createdAt: string
}

export interface AuditEntry {
  userId: number
  userName: string
  action: "created" | "updated" | "deleted"
  timestamp: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

export interface Patient {
  id: number

  // ─── Personal ────────────────────────────────────────────────
  name: string
  socialName?: string
  cpf: string
  rg?: string
  documents?: PatientDocument[]
  gender: Gender
  dob: string
  ethnicity?: Ethnicity
  race?: string
  birthplace?: string
  nationality?: string
  occupation?: string
  maritalStatus?: MaritalStatus

  // ─── Parents & Relatives ─────────────────────────────────────
  motherName?: string
  motherOccupation?: string
  fatherName?: string
  fatherOccupation?: string
  guardianName?: string
  guardianCpf?: string
  spouseName?: string

  // ─── Health Insurance ────────────────────────────────────────
  healthInsurance?: string
  healthInsuranceNumber?: string
  isNewbornOnInsurance?: boolean
  legacyCode?: string
  isVip?: boolean

  // ─── Contact ─────────────────────────────────────────────────
  email?: string
  phone: string
  landline?: string
  alternativePhone?: string
  emergencyContact?: EmergencyContact

  // ─── Address ─────────────────────────────────────────────────
  address?: Address

  // ─── Notes & Attachments ─────────────────────────────────────
  observations?: string
  attachments?: Attachment[]

  // ─── Communication Preferences (LGPD) ────────────────────────
  preferredChannel?: CommunicationChannel
  communicationFrequency?: CommunicationFrequency
  optIn?: boolean

  // ─── Behavior Score (AI) ─────────────────────────────────────
  behaviorScore?: number

  // ─── Meta (Audit Trail) ──────────────────────────────────────
  status: PatientStatus
  photoUrl?: string
  lastVisit?: string
  nextVisit?: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
}

// ─── APPOINTMENT ──────────────────────────────────────────────────
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "absent" | "blocked" | "pending"
export type AppointmentType = "consultation" | "exam" | "return" | "procedure"

export interface Appointment {
  id: number
  patientId: number
  patientName: string
  doctorId: number
  doctorName: string
  unitId?: number
  unitName?: string
  date: string
  time: string
  duration: number
  type: AppointmentType
  status: AppointmentStatus
  observations?: string
  preferredChannel?: CommunicationChannel
}

// ─── REPORT ───────────────────────────────────────────────────────
export type ReportStatus = "Draft" | "Finalized" | "Sent"

export interface Report {
  id: number
  patientId: number
  patientName: string
  doctorId: number
  doctorName: string
  type: string
  content?: string
  cid10?: string
  date: string
  status: ReportStatus
  hideDate?: boolean
  hideSignature?: boolean
  attachments?: Attachment[]
  version?: number
}

// ─── MESSAGE ──────────────────────────────────────────────────────
export type MessageStatus = "Delivered" | "Pending" | "Failed"

export interface Message {
  id: number
  patientId: number
  patientName: string
  channel: CommunicationChannel
  templateId?: number
  content: string
  status: MessageStatus
  sentBy?: string
  date: string
}

export interface MessageTemplate {
  id: number
  name: string
  channel: CommunicationChannel
  content: string
}

// ─── FINANCIAL ────────────────────────────────────────────────────
export type PaymentStatus = "Paid" | "Pending" | "Overdue" | "Cancelled"
export type PaymentMethod = "Cash" | "Card" | "Pix" | "Insurance" | "Transfer"

export interface FinancialRecord {
  id: number
  patientId: number
  patientName: string
  appointmentId?: number
  value: number
  discount?: number
  paymentMethod: PaymentMethod
  healthInsurance?: string
  dueDate: string
  status: PaymentStatus
  observations?: string
}

// ─── MEDICAL RECORD ───────────────────────────────────────────────
export type MedicalRecordStatus = "open" | "finalized"

export interface VitalSigns {
  bloodPressure?: string
  heartRate?: number
  temperature?: number
  weight?: number
  height?: number
  oxygenSaturation?: number
}

export interface MedicalRecord {
  id: number
  patientId: number
  patientName: string
  doctorId: number
  doctorName: string
  appointmentId?: number
  date: string
  chiefComplaint: string
  currentHistory?: string
  allergies?: string
  medications?: string
  personalHistory?: string
  familyHistory?: string
  vitalSigns?: VitalSigns
  physicalExam?: string
  diagnosis?: string
  cid10?: string
  treatmentPlan?: string
  prescriptions?: string
  examRequests?: string
  returnDate?: string
  observations?: string
  status: MedicalRecordStatus
  createdAt: string
  updatedAt?: string
  updatedBy?: string
}

// ─── PRESCRIPTION ─────────────────────────────────────────────────
export type PrescriptionType = "simple" | "special" | "antimicrobial"

export interface PrescriptionMedication {
  id: number
  name: string
  concentration: string
  form: string
  quantity: string
  posology: string
  duration: string
  instructions?: string
}

export interface Prescription {
  id: number
  patientId: number
  patientName: string
  patientDob?: string
  doctorId: number
  doctorName: string
  doctorCrm?: string
  doctorSpecialty?: string
  date: string
  type: PrescriptionType
  medications: PrescriptionMedication[]
  cid10?: string
  observations?: string
  status: "draft" | "emitted"
}

// ─── NAVIGATION ───────────────────────────────────────────────────
export type PageId =
  | "dashboard"
  | "patients"
  | "register"
  | "appointments"
  | "records"
  | "reports"
  | "messages"
  | "financial"
  | "settings"
  | "patient-profile"