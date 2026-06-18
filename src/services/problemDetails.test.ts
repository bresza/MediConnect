import { describe, expect, it } from "vitest"
import {
  humanizeErrorMessage,
  messageFromProblemDetails,
  sanitizeDatabaseMessage,
} from "./problemDetails"

describe("sanitizeDatabaseMessage", () => {
  it("traduz violacao de RLS em appointments", () => {
    const raw = 'new row violates row-level security policy for table "appointments"'
    expect(sanitizeDatabaseMessage(raw)).toBe(
      "Não foi possível agendar a consulta. Seu cadastro ainda não tem permissão para criar " +
      "agendamentos. Peça à recepção para vincular seu acesso.",
    )
  })

  it("traduz violacao de RLS generica", () => {
    expect(sanitizeDatabaseMessage("violates row-level security policy")).toBe(
      "Você não tem permissão para realizar esta ação. Peça ajuda à recepção se o problema persistir.",
    )
  })
})

describe("messageFromProblemDetails", () => {
  it("nao repassa mensagem tecnica em ingles no 403", () => {
    const msg = messageFromProblemDetails(403, {
      message: 'new row violates row-level security policy for table "appointments"',
    })
    expect(msg).toContain("Não foi possível agendar")
    expect(msg).not.toContain("row-level security")
  })
})

describe("humanizeErrorMessage", () => {
  it("mantem mensagens ja amigaveis em portugues", () => {
    expect(humanizeErrorMessage("Horário indisponível.")).toBe("Horário indisponível.")
  })

  it("substitui mensagens tecnicas por texto amigavel", () => {
    expect(humanizeErrorMessage("ERROR: syntax error at line 1", "Falha ao salvar.")).toBe(
      "Não foi possível salvar. Verifique os dados e tente novamente.",
    )
  })
})
