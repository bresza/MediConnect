import type { PageId } from "../types"

export const LOGIN_PATH = "/login"

const PATH_TO_PAGE: Record<string, PageId> = {
  "/": "dashboard",
  "/inicio": "dashboard",
  "/agenda": "appointments",
  "/pacientes": "patients",
  "/disponibilidade": "availability",
  "/laudos": "reports",
  "/relatorios": "reports",
  "/mensagens": "messages",
  "/financeiro": "financial",
  "/equipe": "team",
  "/configuracoes": "settings",
  "/portal": "patient-portal",
}

const PAGE_TO_PATH: Partial<Record<PageId, string>> = {
  dashboard: "/",
  appointments: "/agenda",
  patients: "/pacientes",
  availability: "/disponibilidade",
  reports: "/laudos",
  messages: "/mensagens",
  financial: "/financeiro",
  team: "/equipe",
  settings: "/configuracoes",
  "patient-portal": "/portal",
}

export function pageFromPath(pathname: string): PageId | null {
  const normalized = pathname.replace(/\/+$/, "") || "/"
  return PATH_TO_PAGE[normalized] ?? null
}

export function pathForPage(page: PageId): string {
  return PAGE_TO_PATH[page] ?? "/"
}

export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/"
}

export function isAppPath(pathname: string): boolean {
  return pageFromPath(pathname) !== null
}

export function isPublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return normalized === "/" || normalized === LOGIN_PATH || normalized.startsWith(`${LOGIN_PATH}/`)
}

/** Caminho interno após login (?next=/agenda). */
export function readLoginRedirect(): string | null {
  const params = new URLSearchParams(window.location.search)
  const next = params.get("next")?.trim()
  if (!next || !next.startsWith("/")) return null
  return next
}
