import type { UserRole, PageId } from "../types"

export const ROLE_PAGES: Record<UserRole, PageId[]> = {
  doctor:    ["dashboard", "patients", "register", "appointments", "records", "reports", "messages", "patient-profile"],
  manager:   ["dashboard", "patients", "register", "appointments", "records", "reports", "messages", "financial", "settings", "patient-profile"],
  financial: ["dashboard", "financial"],
  secretary: ["dashboard", "patients", "register", "appointments", "messages", "patient-profile"],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  doctor:    "Médico(a)",
  manager:   "Gestão",
  financial: "Financeiro",
  secretary: "Secretaria",
}

export function canAccess(role: UserRole, page: PageId): boolean {
  return ROLE_PAGES[role].includes(page)
}

export function getDefaultPage(role: UserRole): PageId {
  return ROLE_PAGES[role][0]
}
