import { describe, it, expect } from "vitest"
import { resolveLoginRole } from "./auth"

describe("resolveLoginRole — mapeamento de papéis da API", () => {
  it("mapeia os papéis canônicos de user_roles", () => {
    expect(resolveLoginRole({ roles: [], userRoleRows: ["admin"] })).toBe("admin")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["gestor"] })).toBe("manager")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["medico"] })).toBe("doctor")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["secretaria"] })).toBe("secretary")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["paciente"] })).toBe("patient")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["financeiro"] })).toBe("financial")
  })

  it("aceita sinônimos e acentos", () => {
    expect(resolveLoginRole({ roles: [], profileRole: "Administrador" })).toBe("admin")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["gerente"] })).toBe("manager")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["médica"] })).toBe("doctor")
    expect(resolveLoginRole({ roles: [], userRoleRows: ["recepcionista"] })).toBe("secretary")
  })

  it("aceita roles vindos de objetos { role }", () => {
    expect(resolveLoginRole({ roles: [{ role: "gestor" }] })).toBe("manager")
    expect(resolveLoginRole({ roles: [{ role: "admin" }, { role: "medico" }] })).toBe("admin")
  })
})

describe("resolveLoginRole — prioridade entre múltiplos papéis", () => {
  it("admin vence gestor e médico", () => {
    expect(resolveLoginRole({ roles: [], userRoleRows: ["medico", "gestor", "admin"] })).toBe("admin")
  })

  it("gestor vence médico", () => {
    expect(resolveLoginRole({ roles: [], userRoleRows: ["medico", "gestor"] })).toBe("manager")
  })

  it("permissions.isAdmin força admin acima de tudo", () => {
    expect(
      resolveLoginRole({ roles: [], userRoleRows: ["paciente"], permissions: { isAdmin: true } }),
    ).toBe("admin")
  })

  it("canManageUsers sem user_roles resolve como gestor (manager)", () => {
    expect(
      resolveLoginRole({
        roles: [],
        userRoleRows: [],
        permissions: { canManageUsers: true },
      }),
    ).toBe("manager")
  })
})

describe("resolveLoginRole — regressão: staff não vira paciente (bug Hugo→Manuel)", () => {
  it("mantém admin mesmo com vínculo em patients", () => {
    expect(
      resolveLoginRole({
        roles: [],
        userRoleRows: ["admin"],
        linkedPatient: { id: "patient-123" },
      }),
    ).toBe("admin")
  })

  it("mantém médico mesmo com vínculo em patients", () => {
    expect(
      resolveLoginRole({
        roles: [{ role: "medico" }],
        linkedPatient: { id: "patient-123" },
      }),
    ).toBe("doctor")
  })

  it("paciente puro (token paciente) permanece paciente", () => {
    expect(
      resolveLoginRole({
        roles: [],
        userRoleRows: ["paciente"],
        linkedPatient: { id: "patient-123" },
      }),
    ).toBe("patient")
  })
})

describe("resolveLoginRole — fallbacks", () => {
  it("user_roles secretaria vence profile gestor e canManageUsers", () => {
    expect(
      resolveLoginRole({
        roles: [],
        userRoleRows: ["secretaria"],
        profileRole: "gestor",
        permissions: { canManageUsers: true },
      }),
    ).toBe("secretary")
  })

  it("usa CRM como dica de médico quando não há papéis", () => {
    expect(resolveLoginRole({ roles: [], userRoleRows: [], hasCrm: true })).toBe("doctor")
  })

  it("default conservador é secretária quando não há sinal algum", () => {
    expect(resolveLoginRole({ roles: [], userRoleRows: [] })).toBe("secretary")
  })

  it("paciente vinculado em patients sem user_roles entra como patient", () => {
    expect(
      resolveLoginRole({
        roles: [],
        userRoleRows: [],
        linkedPatient: { id: "patient-abc" },
      }),
    ).toBe("patient")
  })
})
