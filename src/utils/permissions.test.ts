import { describe, it, expect } from "vitest"
import type { UserRole, PageId } from "../types"
import {
  ROLE_PAGES,
  ROLE_ACTIONS,
  ROLE_LABELS,
  ROLE_COLORS,
  canAccess,
  canDo,
  getDefaultPage,
  canViewClinicalData,
  canManageMedicalRecords,
  canManageOrganization,
  canAccessSettings,
  canUseBasicRegistrationOnly,
  canManageAppointments,
  canViewAllAppointments,
  canManageAvailability,
  canManageWaitlist,
  canDeletePatients,
  canDeleteReports,
  canManageFinancial,
  canViewFinancial,
  canManageTeam,
  canDeleteTeamMembers,
  canSendMessages,
  canCreateReports,
  canRegisterPatients,
  canUpdatePatients,
  canViewPatients,
} from "./permissions"

const ALL_ROLES: UserRole[] = ["patient", "doctor", "secretary", "financial", "manager", "admin"]

describe("matriz de papéis (estrutura)", () => {
  it("define páginas e ações para todos os papéis", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PAGES[role]).toBeDefined()
      expect(ROLE_ACTIONS[role]).toBeDefined()
      expect(ROLE_LABELS[role]).toBeTruthy()
      expect(ROLE_COLORS[role]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it("não tem páginas duplicadas por papel", () => {
    for (const role of ALL_ROLES) {
      const pages = ROLE_PAGES[role]
      expect(new Set(pages).size).toBe(pages.length)
    }
  })
})

describe("gestor ≡ admin (paridade total)", () => {
  it("tem exatamente as mesmas páginas", () => {
    expect([...ROLE_PAGES.manager].sort()).toEqual([...ROLE_PAGES.admin].sort())
  })

  it("tem exatamente as mesmas ações", () => {
    expect([...ROLE_ACTIONS.manager].sort()).toEqual([...ROLE_ACTIONS.admin].sort())
  })

  it("permite settings, equipe, financeiro e fila de espera para ambos", () => {
    for (const role of ["manager", "admin"] as const) {
      expect(canAccessSettings(role)).toBe(true)
      expect(canAccess(role, "settings")).toBe(true)
      expect(canManageTeam(role)).toBe(true)
      expect(canDeleteTeamMembers(role)).toBe(true)
      expect(canManageFinancial(role)).toBe(true)
      expect(canManageWaitlist(role)).toBe(true)
      expect(canDeletePatients(role)).toBe(true)
    }
  })
})

describe("canAccess / canDo / getDefaultPage", () => {
  it("respeita as listas configuradas", () => {
    expect(canAccess("doctor", "reports")).toBe(true)
    expect(canAccess("secretary", "reports")).toBe(false)
    expect(canDo("doctor", "create_reports")).toBe(true)
    expect(canDo("secretary", "create_reports")).toBe(false)
  })

  it("retorna false para página/ação desconhecida", () => {
    expect(canAccess("admin", "pagina-inexistente" as PageId)).toBe(false)
    expect(canDo("admin", "acao_inexistente")).toBe(false)
  })

  it("usa a primeira página do papel como default", () => {
    expect(getDefaultPage("patient")).toBe("patient-portal")
    expect(getDefaultPage("doctor")).toBe("dashboard")
    expect(getDefaultPage("financial")).toBe("dashboard")
  })
})

describe("paciente: acesso restrito ao portal", () => {
  it("só acessa o portal e não ações de staff", () => {
    expect(ROLE_PAGES.patient).toEqual(["patient-portal"])
    expect(canAccess("patient", "dashboard")).toBe(false)
    expect(canAccess("patient", "financial")).toBe(false)
    expect(canManageAppointments("patient")).toBe(false)
    expect(canViewClinicalData("patient")).toBe(false)
    expect(canSendMessages("patient")).toBe(false)
  })
})

describe("secretária: administrativo sem dados clínicos", () => {
  it("gere agenda/pacientes mas não laudos nem clínico", () => {
    expect(canManageAppointments("secretary")).toBe(true)
    expect(canManageWaitlist("secretary")).toBe(true)
    expect(canRegisterPatients("secretary")).toBe(true)
    expect(canViewClinicalData("secretary")).toBe(false)
    expect(canCreateReports("secretary")).toBe(false)
    expect(canViewFinancial("secretary")).toBe(false)
    expect(canManageTeam("secretary")).toBe(false)
    expect(canUseBasicRegistrationOnly("secretary")).toBe(true)
  })
})

describe("médico: clínico sim, organização não", () => {
  it("vê dados clínicos e cria laudos, mas não gere equipe/financeiro", () => {
    expect(canViewClinicalData("doctor")).toBe(true)
    expect(canManageMedicalRecords("doctor")).toBe(true)
    expect(canCreateReports("doctor")).toBe(true)
    expect(canManageAvailability("doctor")).toBe(true)
    expect(canManageOrganization("doctor")).toBe(false)
    expect(canManageTeam("doctor")).toBe(false)
    expect(canViewFinancial("doctor")).toBe(false)
    expect(canDeletePatients("doctor")).toBe(false)
    expect(canDeleteReports("doctor")).toBe(false)
  })

  it("não tem visão de todos os agendamentos (apenas a própria)", () => {
    expect(canViewAllAppointments("doctor")).toBe(false)
    expect(canViewAllAppointments("secretary")).toBe(true)
    expect(canViewAllAppointments("manager")).toBe(true)
    expect(canViewAllAppointments("admin")).toBe(true)
  })
})

describe("financeiro: só financeiro e visão de pacientes", () => {
  it("acessa financeiro mas não clínico nem agenda", () => {
    expect(canViewFinancial("financial")).toBe(true)
    expect(canManageFinancial("financial")).toBe(true)
    expect(canViewPatients("financial")).toBe(true)
    expect(canUpdatePatients("financial")).toBe(false)
    expect(canRegisterPatients("financial")).toBe(false)
    expect(canAccess("financial", "financial")).toBe(true)
    expect(canAccess("financial", "appointments")).toBe(false)
    expect(canViewClinicalData("financial")).toBe(false)
    expect(canManageAppointments("financial")).toBe(false)
    expect(canSendMessages("financial")).toBe(false)
  })
})

describe("canManageMedicalRecords: exclusivo do médico", () => {
  it("nenhum outro papel gere prontuário na agenda", () => {
    expect(canManageMedicalRecords("manager")).toBe(false)
    expect(canManageMedicalRecords("admin")).toBe(false)
    expect(canManageMedicalRecords("secretary")).toBe(false)
  })
})
