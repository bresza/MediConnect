import { describe, expect, it } from "vitest"
import { assertCid10Required, isValidCid10, normalizeCid10, validateCid10 } from "./cid10"

describe("cid10", () => {
  it("normalizeCid10 trims and uppercases", () => {
    expect(normalizeCid10("  i10 ")).toBe("I10")
  })

  it("validateCid10 allows empty", () => {
    expect(validateCid10("")).toBeNull()
    expect(validateCid10("   ")).toBeNull()
  })

  it("validateCid10 rejects invalid formats", () => {
    expect(validateCid10("12412512")).not.toBeNull()
    expect(validateCid10("10")).not.toBeNull()
  })

  it("validateCid10 accepts valid formats", () => {
    expect(validateCid10("I10")).toBeNull()
    expect(validateCid10("E11.9")).toBeNull()
    expect(validateCid10("R10.1")).toBeNull()
  })

  it("isValidCid10 matches validateCid10 for non-empty", () => {
    expect(isValidCid10("I10")).toBe(true)
    expect(isValidCid10("12412512")).toBe(false)
  })

  it("assertCid10Required rejects empty", () => {
    expect(assertCid10Required("")).not.toBeNull()
    expect(assertCid10Required("   ")).not.toBeNull()
  })

  it("assertCid10Required rejects invalid", () => {
    expect(assertCid10Required("12412512")).not.toBeNull()
    expect(assertCid10Required("10")).not.toBeNull()
  })

  it("assertCid10Required accepts valid", () => {
    expect(assertCid10Required("I10")).toBeNull()
    expect(assertCid10Required("E11.9")).toBeNull()
  })
})
