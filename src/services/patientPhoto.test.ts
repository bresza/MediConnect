import { describe, it, expect } from "vitest"
import {
  avatarObjectPath,
  getAvatarDownloadUrl,
  normalizeAvatarUrl,
  avatarUrlForUser,
  isDataUrl,
  isRemotePhotoUrl,
} from "./patientPhoto"

describe("avatarObjectPath", () => {
  it("segue o contrato da API ({userId}/avatar.{ext})", () => {
    expect(avatarObjectPath("user-123")).toBe("user-123/avatar.jpg")
    expect(avatarObjectPath("550e8400-e29b-41d4-a716-446655440000", "png")).toBe(
      "550e8400-e29b-41d4-a716-446655440000/avatar.png",
    )
  })
})

describe("getAvatarDownloadUrl", () => {
  it("usa GET /storage/v1/object/avatars/ (sem /public/)", () => {
    const url = getAvatarDownloadUrl("user-123/avatar.jpg")
    expect(url).toMatch(/\/storage\/v1\/object\/avatars\/user-123\/avatar\.jpg$/)
    expect(url).not.toContain("/public/")
  })

  it("codifica segmentos do path", () => {
    const url = getAvatarDownloadUrl("user id/avatar.jpg")
    expect(url).toContain("user%20id")
  })
})

describe("normalizeAvatarUrl", () => {
  it("converte URL legada /public/ para endpoint documentado", () => {
    const legacy =
      "https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg"
    expect(normalizeAvatarUrl(legacy)).toBe(
      "https://proj.supabase.co/storage/v1/object/avatars/user-1/avatar.jpg",
    )
  })

  it("gera URL a partir de userId quando não há URL remota", () => {
    const url = normalizeAvatarUrl(undefined, "abc-123")
    expect(url).toContain("abc-123/avatar.jpg")
  })
})

describe("avatarUrlForUser", () => {
  it("retorna undefined sem userId", () => {
    expect(avatarUrlForUser(undefined)).toBeUndefined()
    expect(avatarUrlForUser("")).toBeUndefined()
  })

  it("monta URL previsível para exibição", () => {
    expect(avatarUrlForUser("uid-1")).toContain("uid-1/avatar.jpg")
  })
})

describe("isDataUrl / isRemotePhotoUrl", () => {
  it("identifica data URL e http(s)", () => {
    expect(isDataUrl("data:image/png;base64,abc")).toBe(true)
    expect(isRemotePhotoUrl("https://x.com/a.jpg")).toBe(true)
    expect(isRemotePhotoUrl("data:image/png;base64,abc")).toBe(false)
  })
})
