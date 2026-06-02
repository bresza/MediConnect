import { describe, expect, it } from "vitest"
import { translateApiError } from "./apiErrors"
import { weekdayToApiEnum, weekdayWriteCandidates } from "../services/availability"

describe("translateApiError", () => {
  it("traduz enum weekday inválido", () => {
    expect(
      translateApiError('invalid input value for enum weekday: "1"'),
    ).toMatch(/dia da semana/i)
  })

  it("traduz User already registered", () => {
    expect(translateApiError("User already registered")).toMatch(/e-mail já possui/i)
  })
})

describe("weekdayToApiEnum", () => {
  it("mapeia segunda-feira (1) para segunda", () => {
    expect(weekdayToApiEnum(1)).toBe("segunda")
    expect(weekdayWriteCandidates(1)[0]).toBe("segunda")
  })
})
