// ─── USER & PERMISSIONS ───────────────────────────────────────────
export type UserRole = "doctor" | "manager" | "financial" | "secretary" | "admin" | "patient"

export interface User {
  id: string; name: string; role: UserRole; email: string; crm?: string; specialty?: string
  doctorId?: string; patientId?: string; patientCpf?: string; phone?: string; dob?: string
  gender?: Gender
}

// ─── STAFF ────────────────────────────────────────────────────────
export type StaffRole   = "doctor" | "secretary" | "manager"
export type StaffStatus = "Active" | "Inactive"

export interface StaffMember {
  id: string; name: string; role: StaffRole; email: string; phone: string
  phone2?: string; rg?: string; address?: Address; tempPassword?: string
  status: StaffStatus; cpf?: string; crm?: string; specialty?: string; department?: string
  gender?: Gender
  createdAt: string; updatedAt?: string
}

// ─── PATIENT ──────────────────────────────────────────────────────
export type PatientStatus          = "Active" | "Inactive"
export type Gender                 = "Male" | "Female" | "Other"
export type MaritalStatus          = "Single" | "Married" | "Divorced" | "Widowed" | "StableUnion"
export type Ethnicity              = "Black" | "Mixed" | "White" | "Asian" | "Indigenous"
export type DocumentType           = "CPF" | "RG" | "CNH" | "Passport"
export type CommunicationChannel   = "WhatsApp" | "Email" | "SMS" | "Phone"
export type CommunicationFrequency = "EssentialOnly" | "RemindersAndConfirmations" | "All"

export interface PatientDocument  { type: DocumentType; number: string }
export interface EmergencyContact { name: string; relationship: string; phone: string }
export interface Address {
  zipCode: string; street: string; number: string; complement?: string
  neighborhood: string; city: string; state: string; reference?: string
}
export interface Attachment { id: number; name: string; url: string; createdAt: string }
export interface AuditEntry {
  userId: number; userName: string; action: "created" | "updated" | "deleted"
  timestamp: string; changes?: Record<string, { from: unknown; to: unknown }>
}

export interface Patient {
  id: string; name: string; socialName?: string; cpf: string; rg?: string
  userId?: string
  documents?: PatientDocument[]; gender?: Gender; dob: string; ethnicity?: Ethnicity
  race?: string; birthplace?: string; nationality?: string; occupation?: string
  maritalStatus?: MaritalStatus; motherName?: string; motherOccupation?: string
  fatherName?: string; fatherOccupation?: string; guardianName?: string; guardianCpf?: string
  spouseName?: string; healthInsurance?: string; healthInsuranceNumber?: string
  isNewbornOnInsurance?: boolean; legacyCode?: string; isVip?: boolean
  email?: string; phone: string; landline?: string; alternativePhone?: string
  emergencyContact?: EmergencyContact; address?: Address; observations?: string
  attachments?: Attachment[]; preferredChannel?: CommunicationChannel
  communicationFrequency?: CommunicationFrequency; optIn?: boolean
  behaviorScore?: number; status: PatientStatus; photoUrl?: string
  lastVisit?: string; nextVisit?: string; createdAt?: string; updatedAt?: string; updatedBy?: string
  createdBy?: string
}

// ─── APPOINTMENT ──────────────────────────────────────────────────
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "absent" | "blocked" | "pending" | "requested"
export type AppointmentType   = "consultation" | "exam" | "return" | "procedure"

export interface Appointment {
  id: string; patientId: string; patientName: string; doctorId: string; doctorName: string
  unitId?: number; unitName?: string; date: string; time: string; duration: number
  type: AppointmentType; status: AppointmentStatus; observations?: string
  preferredChannel?: CommunicationChannel
}

// ─── REPORT ───────────────────────────────────────────────────────
export type ReportStatus = "Draft" | "Finalized" | "Sent"

export interface Report {
  id: string; patientId: string; patientName: string; doctorId: string; doctorName: string
  // campo principal visível na lista
  type: string
  // campos mapeados da API
  content?: string       // legacy / compatibilidade
  exam?: string          // = type (nome do exame/laudo)
  diagnosis?: string     // diagnóstico
  conclusion?: string    // conclusão
  contentHtml?: string   // conteúdo HTML
  requestedBy?: string   // UUID do solicitante
  orderNumber?: string   // REP-2025-XXXXX
  cid10?: string         // = cid_code na API
  date: string; status: ReportStatus
  hideDate?: boolean; hideSignature?: boolean
  attachments?: Attachment[]; version?: number
}

// ─── MESSAGE ──────────────────────────────────────────────────────
export type MessageStatus = "Delivered" | "Pending" | "Failed"
export interface Message {
  id: number; patientId: string | number; patientName: string; channel: CommunicationChannel
  templateId?: number; content: string; status: MessageStatus; sentBy?: string; date: string
}
export interface MessageTemplate { id: number; name: string; channel: CommunicationChannel; content: string }

// ─── FINANCIAL ────────────────────────────────────────────────────
export type PaymentStatus = "Paid" | "Pending" | "Overdue" | "Cancelled"
export type PaymentMethod = "Cash" | "Card" | "Pix" | "Insurance" | "Transfer"
export interface FinancialRecord {
  id: string; patientId?: string; patientName: string; appointmentId?: string
  value: number; discount?: number; paymentMethod: PaymentMethod
  healthInsurance?: string; dueDate: string; status: PaymentStatus; observations?: string
  boletoUrl?: string
}

// ─── MEDICAL RECORD ───────────────────────────────────────────────
export type MedicalRecordStatus = "open" | "finalized"
export interface VitalSigns {
  bloodPressure?: string; heartRate?: number; temperature?: number
  weight?: number; height?: number; oxygenSaturation?: number
}
export interface MedicalRecord {
  id: string; patientId: string; patientName: string; doctorId: string; doctorName: string
  appointmentId?: string; date: string; chiefComplaint: string; currentHistory?: string
  allergies?: string; medications?: string; personalHistory?: string; familyHistory?: string
  vitalSigns?: VitalSigns; physicalExam?: string; diagnosis?: string; cid10?: string
  treatmentPlan?: string; prescriptions?: string; examRequests?: string; returnDate?: string
  observations?: string; status: MedicalRecordStatus; createdAt: string; updatedAt?: string; updatedBy?: string
}

// ─── PRESCRIPTION ─────────────────────────────────────────────────
export type PrescriptionType = "simple" | "special" | "antimicrobial"
export interface PrescriptionMedication {
  id: string; name: string; concentration: string; form: string
  quantity: string; posology: string; duration: string; instructions?: string
}
export interface Prescription {
  id: string; patientId: string; patientName: string; patientDob?: string
  doctorId: string; doctorName: string; doctorCrm?: string; doctorSpecialty?: string
  date: string; type: PrescriptionType; medications: PrescriptionMedication[]
  cid10?: string; observations?: string; status: "draft" | "emitted"
}

// ─── WAITLIST (FILA DE ESPERA POR PRIORIDADE) ─────────────────────
// Modelo derivado das diretrizes do Ministério da Saúde para regulação
// ambulatorial (cores) + Lei 10.048/2000 (prioridades legais).
// As cores seguem a estratificação do SUS para fila eletiva:
//   red    → atendimento até 1 mês
//   yellow → até 3 meses
//   green  → até 6 meses
//   blue   → até 1 ano
export type WaitlistPriorityColor = "red" | "yellow" | "green" | "blue"

/** Flags de prioridade legal (Lei 10.048/2000, atualizada pela 13.146/15 e 14.626/23). */
export interface WaitlistLegalFlags {
  elderly?:         boolean   // >= 60 anos
  pregnant?:        boolean
  lactating?:       boolean
  infantInArms?:    boolean   // criança de colo (< 2 anos)
  disability?:      boolean   // pessoa com deficiência (PcD)
  asd?:             boolean   // transtorno do espectro autista
  severeObesity?:   boolean
  reducedMobility?: boolean
}

export type WaitlistStatus = "waiting" | "scheduled" | "removed"

export interface WaitlistEntry {
  id:              string
  patientId:       string
  patientName:     string
  /** Especialidade desejada (ex.: "Cardiologia"). */
  specialty?:      string
  /** Médico desejado (opcional — fila pode ser por especialidade). */
  doctorId?:       string
  doctorName?:     string
  cid10?:          string
  clinicalNotes?:  string
  flags:           WaitlistLegalFlags
  /** Cor inferida pelo serviço — não editada manualmente. */
  priorityColor:   WaitlistPriorityColor
  /** ISO datetime — quando entrou na fila. */
  enteredAt:       string
  /** ISO date — prazo-alvo calculado a partir da cor. */
  dueBy:           string
  lastNoShowAt?:  string
  /** ID do usuário que cadastrou (médico ou secretária). */
  addedBy?:        string
  addedByName?:   string
  status:          WaitlistStatus
  notes?:          string
}

// ─── TOAST ────────────────────────────────────────────────────────
export type ToastVariant = "success" | "error" | "warning" | "info"
export interface Toast { id: string; message: string; variant: ToastVariant }

// ─── NAVIGATION ───────────────────────────────────────────────────
export type PageId =
  | "dashboard" | "patients" | "register" | "appointments"
  | "records" | "reports"  | "messages" | "financial"
  | "settings"  | "patient-profile" | "team" | "patient-portal"
  | "availability"
