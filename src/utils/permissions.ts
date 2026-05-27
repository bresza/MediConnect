import type { UserRole, PageId } from "../types"

// ─────────────────────────────────────────────────────────────────
// Páginas permitidas por perfil
// ─────────────────────────────────────────────────────────────────
export const ROLE_PAGES: Record<UserRole, PageId[]> = {
  patient: [
    "patient-portal",
  ],

  // Médico — laudos, agenda própria, comunicação e pacientes vinculados
  doctor: [
    "dashboard",
    "appointments",   // filtra por médico no AppRouter
    "availability",   // disponibilidade e exceções próprias
    "reports",        // gestão de laudos
    "messages",       // comunicação com pacientes
    "patients",       // lista de seus pacientes
    "register",       // edição de cadastro de pacientes vinculados
    "patient-profile",
  ],

  // Gestão — acesso total
  manager: [
    "dashboard",
    "patients",
    "register",
    "appointments",
    "availability",
    "reports",
    "messages",
    "financial",
    "settings",
    "patient-profile",
    "team",
  ],

  // Admin — igual ao gestor
  admin: [
    "dashboard",
    "patients",
    "register",
    "appointments",
    "availability",
    "reports",
    "messages",
    "financial",
    "settings",
    "patient-profile",
    "team",
  ],

  // Financeiro — módulo financeiro e cadastro (sem laudos/prontuário)
  financial: [
    "dashboard",
    "financial",
    "patients",
    "patient-profile",
  ],

  // Secretária — agenda, cadastro básico via Pacientes, comunicação
  secretary: [
    "dashboard",
    "appointments",   // criar, editar e cancelar
    "patients",       // ver lista
    "register",       // rota interna acionada por Pacientes > Novo paciente
    "messages",       // comunicação básica
    "patient-profile",
  ],
}

// ─────────────────────────────────────────────────────────────────
// Ações permitidas por perfil (controle fino dentro das páginas)
// ─────────────────────────────────────────────────────────────────
export const ROLE_ACTIONS: Record<UserRole, string[]> = {
  patient:   ["view_own_appointments", "view_own_reports"],
  doctor:    ["view_reports", "create_reports", "update_reports", "view_own_appointments", "manage_own_availability", "update_patients", "send_messages"],
  manager:   ["view_reports", "create_reports", "update_reports", "delete_reports", "view_all_appointments", "create_appointments", "delete_appointments", "manage_availability", "manage_patients", "update_patients", "delete_patients", "manage_team", "view_financial", "manage_financial", "send_messages"],
  admin:     ["view_reports", "create_reports", "update_reports", "delete_reports", "view_all_appointments", "create_appointments", "delete_appointments", "manage_availability", "manage_patients", "update_patients", "delete_patients", "manage_team", "view_financial", "manage_financial", "send_messages"],
  financial: ["view_financial", "manage_financial"],
  secretary: ["view_appointments", "create_appointments", "update_appointments", "cancel_appointments", "register_patients", "update_patients", "send_messages"],
}

/** Laudos, receitas, prontuário e demais dados clínicos sensíveis. */
export function canViewClinicalData(role: UserRole): boolean {
  return role === "doctor" || role === "manager" || role === "admin"
}

/** Fluxo de atendimento com prontuário (modal na agenda). */
export function canManageMedicalRecords(role: UserRole): boolean {
  return role === "doctor"
}

/** Gestão de usuários e configurações do sistema. */
export function canManageOrganization(role: UserRole): boolean {
  return role === "manager" || role === "admin"
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
  admin:     "#6366f1",
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
