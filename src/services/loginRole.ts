import type { UserRole } from "../types"

type ApiUserRole = "admin" | "gestor" | "medico" | "secretaria" | "paciente"

export interface PatientLinkResponse {
  id: string
  cpf?: string
  email?: string
  phone_mobile?: string
  birth_date?: string
}

export interface ResolveLoginRoleInput {
  roles: unknown[]
  profileRole?: string | null
  userRoleRows?: string[]
  permissions?: { isAdmin?: boolean; canManageUsers?: boolean }
  linkedPatient?: PatientLinkResponse | null
  hasCrm?: boolean
}

function normalizeRole(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function flattenRoleInputs(roles: unknown[], profileRole?: string | null): string[] {
  const tokens: string[] = []
  const push = (value?: string | null) => {
    const n = normalizeRole(value)
    if (n) tokens.push(n)
  }

  for (const role of roles) {
    if (!role) continue
    if (typeof role === "string") push(role)
    else if (typeof role === "object" && role !== null && "role" in role) {
      push((role as { role?: string }).role)
    }
  }
  push(profileRole)
  return tokens
}

function expandRoleToken(token: string): ApiUserRole[] {
  const out: ApiUserRole[] = []
  const add = (role: ApiUserRole) => { if (!out.includes(role)) out.push(role) }

  if (["admin", "administrador", "administrator", "adm", "superadmin", "super_admin", "root"].includes(token)) {
    add("admin")
  }
  if (["gestor", "manager", "gerente", "coordenador", "coordenadora"].includes(token)) {
    add("gestor")
  }
  if (["medico", "medica", "doctor", "doutor", "doutora", "dr"].includes(token)) {
    add("medico")
  }
  if (["secretaria", "secretary", "secretario", "recepcao", "recepcionista", "atendimento"].includes(token)) {
    add("secretaria")
  }
  if (["paciente", "patient", "cliente"].includes(token)) {
    add("paciente")
  }
  if (["admin", "gestor", "medico", "secretaria", "paciente"].includes(token)) {
    add(token as ApiUserRole)
  }

  return out
}

function collectApiRoles(tokens: string[]): Set<ApiUserRole> {
  const set = new Set<ApiUserRole>()
  for (const token of tokens) {
    for (const role of expandRoleToken(token)) {
      set.add(role)
    }
  }
  return set
}

function mapRoleFromTokens(tokens: string[], options?: { hasCrm?: boolean }): UserRole {
  const apiRoles = collectApiRoles(tokens)

  if (apiRoles.has("admin")) return "admin"
  if (apiRoles.has("gestor")) return "manager"
  if (apiRoles.has("medico")) return "doctor"
  if (tokens.some((t) => ["financeiro", "financial", "financas"].includes(t))) return "financial"
  if (apiRoles.has("secretaria")) return "secretary"
  if (apiRoles.has("paciente")) return "patient"

  if (options?.hasCrm) return "doctor"
  return "secretary"
}

const STAFF_ROLES = new Set<UserRole>(["admin", "manager", "doctor", "secretary", "financial"])

/** Decide o papel da sessão a partir de user_roles + perfil (sem I/O). */
export function resolveLoginRole(input: ResolveLoginRoleInput): UserRole {
  if (input.permissions?.isAdmin) return "admin"

  const userRoleRows = (input.userRoleRows ?? [])
    .map((r) => normalizeRole(r))
    .filter(Boolean)

  const tokens =
    userRoleRows.length > 0
      ? userRoleRows
      : flattenRoleInputs(input.roles, input.profileRole)

  const apiRoles = collectApiRoles(tokens)
  const hasStaffInApi = ["admin", "gestor", "medico", "secretaria"].some((r) =>
    apiRoles.has(r as ApiUserRole),
  )

  if (input.linkedPatient && !hasStaffInApi) return "patient"

  if (userRoleRows.length === 0 && input.permissions?.canManageUsers) return "manager"

  const mapped = mapRoleFromTokens(tokens, { hasCrm: input.hasCrm })

  if (STAFF_ROLES.has(mapped)) return mapped
  if (mapped === "patient") return "patient"

  return mapped
}
