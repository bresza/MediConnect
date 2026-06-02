import type { UserRole, PageId } from "../types"

/** Gestor e administrador: acesso total aos módulos da clínica. */
const STAFF_FULL_PAGES: PageId[] = [
  "dashboard",
  "patients",
  "register",
  "appointments",
  "availability",
  "reports",
  "messages",
  "financial",
  "patient-profile",
  "team",
  "settings",
]

const STAFF_FULL_ACTIONS: string[] = [
  "view_reports", "create_reports", "update_reports", "delete_reports",
  "view_all_appointments", "create_appointments", "update_appointments", "cancel_appointments", "delete_appointments",
  "manage_availability",
  "register_patients", "update_patients", "delete_patients",
  "manage_team", "update_team", "delete_team",
  "view_financial", "manage_financial",
  "send_messages",
  "manage_settings",
  "manage_waitlist",
]

// ─────────────────────────────────────────────────────────────────
// Páginas permitidas por perfil (menu + rotas)
// ─────────────────────────────────────────────────────────────────
export const ROLE_PAGES: Record<UserRole, PageId[]> = {
  patient: ["patient-portal"],

  doctor: [
    "dashboard",
    "appointments",
    "availability",
    "reports",
    "messages",
    "patients",
    "register",
    "patient-profile",
  ],

  secretary: [
    "dashboard",
    "appointments",
    "patients",
    "register",
    "messages",
    "patient-profile",
  ],

  financial: [
    "dashboard",
    "financial",
    "patients",
    "patient-profile",
  ],

  manager: [...STAFF_FULL_PAGES],
  admin:   [...STAFF_FULL_PAGES],
}

// ─────────────────────────────────────────────────────────────────
// Ações por perfil (botões e fluxos dentro das páginas)
// ─────────────────────────────────────────────────────────────────
export const ROLE_ACTIONS: Record<UserRole, string[]> = {
  patient: ["view_own_appointments", "view_own_reports"],

  doctor: [
    "view_reports", "create_reports", "update_reports",
    "view_appointments", "create_appointments", "update_appointments", "cancel_appointments",
    "manage_own_availability",
    "register_patients", "update_patients",
    "view_patients",
    "send_messages",
    "manage_waitlist",
  ],

  secretary: [
    "view_appointments", "view_all_appointments",
    "create_appointments", "update_appointments", "cancel_appointments",
    "register_patients", "update_patients",
    "view_patients",
    "send_messages",
    "manage_waitlist",
  ],

  financial: [
    "view_financial", "manage_financial",
    "view_patients",
  ],

  manager: [...STAFF_FULL_ACTIONS],
  admin:   [...STAFF_FULL_ACTIONS],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  patient:   "Paciente",
  doctor:    "Médico(a)",
  manager:   "Gestão",
  admin:     "Administrador",
  financial: "Financeiro",
  secretary: "Secretaria",
}

export const ROLE_COLORS: Record<UserRole, string> = {
  patient:   "#14b8a6",
  doctor:    "#0ea5e9",
  manager:   "#6366f1",
  admin:     "#7c3aed",
  financial: "#f59e0b",
  secretary: "#10b981",
}

export function canAccess(role: UserRole, page: PageId): boolean {
  return (ROLE_PAGES[role] ?? []).includes(page)
}

export function canDo(role: UserRole, action: string): boolean {
  return (ROLE_ACTIONS[role] ?? []).includes(action)
}

export function getDefaultPage(role: UserRole): PageId {
  return ROLE_PAGES[role]?.[0] ?? "dashboard"
}

// ─────────────────────────────────────────────────────────────────
// Helpers de domínio (use nas telas em vez de comparar role === ...)
// ─────────────────────────────────────────────────────────────────

/** Laudos, receitas e abas clínicas no prontuário. */
export function canViewClinicalData(role: UserRole): boolean {
  return role === "doctor" || role === "manager" || role === "admin"
}

/** Prontuário / modal de consulta na agenda. */
export function canManageMedicalRecords(role: UserRole): boolean {
  return role === "doctor"
}

/** Equipe e operações amplas da clínica (gestão + admin). */
export function canManageOrganization(role: UserRole): boolean {
  return role === "manager" || role === "admin"
}

/** Configurações do sistema — gestor e administrador. */
export function canAccessSettings(role: UserRole): boolean {
  return role === "manager" || role === "admin"
}

/** Cadastro de paciente em 4 passos (sem dados clínicos). */
export function canUseBasicRegistrationOnly(role: UserRole): boolean {
  return role === "secretary"
}

/** Criar/editar/cancelar agendamentos no calendário. */
export function canManageAppointments(role: UserRole): boolean {
  return canDo(role, "create_appointments") || canDo(role, "update_appointments")
}

/** Ver agenda de todos os médicos (não só a própria). */
export function canViewAllAppointments(role: UserRole): boolean {
  return canDo(role, "view_all_appointments")
}

/** Grade de disponibilidade (todos os médicos ou própria). */
export function canManageAvailability(role: UserRole): boolean {
  return canDo(role, "manage_availability") || canDo(role, "manage_own_availability")
}

/** Fila de espera — editar. */
export function canManageWaitlist(role: UserRole): boolean {
  return canDo(role, "manage_waitlist")
}

export function canDeletePatients(role: UserRole): boolean {
  return canDo(role, "delete_patients")
}

export function canDeleteReports(role: UserRole): boolean {
  return canDo(role, "delete_reports")
}

export function canManageFinancial(role: UserRole): boolean {
  return canDo(role, "manage_financial")
}

export function canViewFinancial(role: UserRole): boolean {
  return canDo(role, "view_financial") || canManageFinancial(role)
}

/** Incluir/editar membros da equipe. */
export function canManageTeam(role: UserRole): boolean {
  return canDo(role, "manage_team")
}

/** Remover membros da equipe — gestor e administrador. */
export function canDeleteTeamMembers(role: UserRole): boolean {
  return role === "manager" || role === "admin"
}

export function canSendMessages(role: UserRole): boolean {
  return canDo(role, "send_messages")
}

export function canCreateReports(role: UserRole): boolean {
  return canDo(role, "create_reports")
}

export function canRegisterPatients(role: UserRole): boolean {
  return canDo(role, "register_patients") && canAccess(role, "register")
}

/** Editar ficha de paciente (cadastro administrativo). */
export function canUpdatePatients(role: UserRole): boolean {
  return canDo(role, "update_patients")
}

/** Listar/ver pacientes (financeiro: só leitura). */
export function canViewPatients(role: UserRole): boolean {
  return canDo(role, "view_patients") || canUpdatePatients(role) || canRegisterPatients(role)
}
