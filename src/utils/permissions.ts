import type { UserRole, PageId } from "../types"

// ─────────────────────────────────────────────────────────────────
// Páginas permitidas por perfil
// ─────────────────────────────────────────────────────────────────
export const ROLE_PAGES: Record<UserRole, PageId[]> = {

  // Médico — prontuário, laudos, agenda própria, comunicação, relatórios
  doctor: [
    "dashboard",
    "appointments",   // filtra por médico no AppRouter
    "availability",   // disponibilidade própria
    "records",        // prontuário completo
    "reports",        // gestão de laudos
    "messages",       // comunicação com pacientes
    "patients",       // lista de seus pacientes (read-only)
    "patient-profile",
  ],

  // Gestão — acesso total
  manager: [
    "dashboard",
    "patients",
    "register",
    "appointments",
    "availability",
    "records",
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
    "records",
    "reports",
    "messages",
    "financial",
    "settings",
    "patient-profile",
    "team",
  ],

  // Financeiro — financeiro, relatórios e dados dos pacientes
  financial: [
    "dashboard",
    "financial",
    "reports",
    "patients",
    "patient-profile",
  ],

  // Secretária — agenda, cadastro BÁSICO, comunicação — SEM prontuário
  secretary: [
    "dashboard",
    "appointments",   // criar, editar e cancelar
    "patients",       // ver lista
    "register",       // cadastro básico (sem campos clínicos)
    "messages",       // comunicação básica
    "patient-profile",
  ],
  // NOTA: "records" propositalmente ausente para secretária
}

// ─────────────────────────────────────────────────────────────────
// Ações permitidas por perfil (controle fino dentro das páginas)
// ─────────────────────────────────────────────────────────────────
export const ROLE_ACTIONS: Record<UserRole, string[]> = {
  doctor:    ["view_records", "create_records", "update_records", "view_reports", "create_reports", "update_reports", "view_own_appointments", "manage_own_availability", "send_messages"],
  manager:   ["view_records", "create_records", "update_records", "delete_records", "view_reports", "create_reports", "update_reports", "delete_reports", "view_all_appointments", "create_appointments", "delete_appointments", "manage_availability", "manage_patients", "delete_patients", "manage_team", "view_financial", "manage_financial", "send_messages"],
  admin:     ["view_records", "create_records", "update_records", "delete_records", "view_reports", "create_reports", "update_reports", "delete_reports", "view_all_appointments", "create_appointments", "delete_appointments", "manage_availability", "manage_patients", "delete_patients", "manage_team", "view_financial", "manage_financial", "send_messages"],
  financial: ["view_financial", "manage_financial", "view_reports"],
  secretary: ["view_appointments", "create_appointments", "update_appointments", "cancel_appointments", "register_patients", "send_messages"],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  doctor:    "Médico(a)",
  manager:   "Gestão",
  admin:     "Administrador",
  financial: "Financeiro",
  secretary: "Secretaria",
}

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  doctor:    "Prontuários, laudos e agenda própria",
  manager:   "Acesso completo ao sistema",
  admin:     "Acesso completo ao sistema",
  financial: "Financeiro, faturamento e pagamentos",
  secretary: "Agendamentos e cadastro de pacientes",
}

export const ROLE_COLORS: Record<UserRole, string> = {
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
