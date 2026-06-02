import { describe, expect, it } from "vitest"
import {
  normalizeWeekday,
  parseTimeToHHmm,
  weekdayToApiEnum,
  weekdayWriteCandidates,
  isInvalidWeekdayEnumError,
} from "./availability"
import { ApiError } from "./api"

describe("doctor_availability weekday", () => {
  it("converte segunda (1) para enum PT", () => {
    expect(weekdayToApiEnum(1)).toBe("segunda")
    expect(weekdayToApiEnum(1, "en")).toBe("monday")
  })

  it("normaliza resposta da API em PT e EN", () => {
    expect(normalizeWeekday("segunda")).toBe(1)
    expect(normalizeWeekday("monday")).toBe(1)
    expect(normalizeWeekday("domingo")).toBe(0)
  })

  it("gera candidatos PT e EN", () => {
    expect(weekdayWriteCandidates(1)).toEqual(["segunda", "monday"])
    expect(weekdayWriteCandidates(1, "en")).toEqual(["monday", "segunda"])
  })

  it("detecta erro de enum weekday", () => {
    const err = new ApiError(400, 'invalid input value for enum weekday: "1"')
    expect(isInvalidWeekdayEnumError(err)).toBe(true)
  })
})

describe("parseTimeToHHmm", () => {
  it("aceita HH:mm da UI", () => {
    expect(parseTimeToHHmm("09:00")).toBe("09:00")
    expect(parseTimeToHHmm("14:00")).toBe("14:00")
  })

  it("normaliza HH:mm:ss da API", () => {
    expect(parseTimeToHHmm("08:00:00")).toBe("08:00")
  })
})
