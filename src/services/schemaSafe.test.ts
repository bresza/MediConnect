import { describe, it, expect, afterEach } from "vitest"
import { ApiError } from "./api"
import { isMissingColumnError, isEdgeAutomationEnabled, isEndpointUnavailable, markEndpointUnavailableFromError, isInboundRestEnabled } from "./schemaSafe"

describe("isMissingColumnError", () => {
  it("reconhece erro PostgREST de coluna inexistente (400)", () => {
    const err = new ApiError(400, 'column patients.status does not exist')
    expect(isMissingColumnError(err)).toBe(true)
  })

  it("reconhece mensagem traduzida no front (PT-BR)", () => {
    const err = new ApiError(400, "O servidor não reconhece um dos campos enviados.")
    expect(isMissingColumnError(err)).toBe(true)
  })

  it("reconhece também em 406", () => {
    const err = new ApiError(406, "column reports.foo does not exist")
    expect(isMissingColumnError(err)).toBe(true)
  })

  it("ignora outros status mesmo com a mensagem", () => {
    expect(isMissingColumnError(new ApiError(500, "column x does not exist"))).toBe(false)
    expect(isMissingColumnError(new ApiError(403, "column x does not exist"))).toBe(false)
  })

  it("ignora 400 sem a mensagem de coluna", () => {
    expect(isMissingColumnError(new ApiError(400, "Dados inválidos."))).toBe(false)
  })

  it("ignora erros que não são ApiError", () => {
    expect(isMissingColumnError(new Error("column x does not exist"))).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError(undefined)).toBe(false)
    expect(isMissingColumnError("column x does not exist")).toBe(false)
  })
})

describe("isEdgeAutomationEnabled", () => {
  const original = import.meta.env.VITE_ENABLE_EDGE_AUTOMATION

  afterEach(() => {
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = original
  })

  it("é desligada por padrão (qualquer valor != 'true')", () => {
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = undefined
    expect(isEdgeAutomationEnabled()).toBe(false)
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = "false"
    expect(isEdgeAutomationEnabled()).toBe(false)
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = "1"
    expect(isEdgeAutomationEnabled()).toBe(false)
  })

  it("liga apenas com a string exata 'true'", () => {
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = "true"
    expect(isEdgeAutomationEnabled()).toBe(true)
  })
})

describe("endpoint availability", () => {
  it("marca 404 como indisponível (persiste no localStorage)", () => {
    markEndpointUnavailableFromError("test:404", new ApiError(404, "not found"))
    expect(isEndpointUnavailable("test:404")).toBe(true)
    expect(localStorage.getItem("mediconnect:endpoint-unavailable:test:404")).toBe("1")
  })

  it("marca CORS/rede (status 0) como indisponível", () => {
    markEndpointUnavailableFromError("test:cors", new ApiError(0, "network"))
    expect(isEndpointUnavailable("test:cors")).toBe(true)
  })

  it("isInboundRestEnabled é false sem VITE_ENABLE_EDGE_AUTOMATION", () => {
    import.meta.env.VITE_ENABLE_EDGE_AUTOMATION = undefined
    expect(isInboundRestEnabled()).toBe(false)
  })
})
