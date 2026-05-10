import { createContext, useContext } from "react"
import type { User } from "../types"

export const AUTH_STORAGE_KEY = "mediconnect:auth"

export interface AuthState {
  user:         User   | null
  token:        string | null
  refreshToken: string | null
  expiresAt:    number | null
  clinicId:     string | null
  clinicName:   string | null
}

export interface AuthContextValue extends AuthState {
  login:  (payload: AuthState) => void
  logout: () => void
}

export const INITIAL_AUTH_STATE: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  expiresAt: null,
  clinicId: null,
  clinicName: null,
}

export type AuthAction =
  | { type: "LOGIN";   payload: AuthState }
  | { type: "REFRESH"; payload: { token: string; refreshToken: string | null; expiresAt: number | null } }
  | { type: "LOGOUT" }

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN":   return { ...action.payload }
    case "REFRESH": return { ...state, ...action.payload }
    case "LOGOUT":  return { ...INITIAL_AUTH_STATE }
    default:        return state
  }
}

export function loadAuthState(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return INITIAL_AUTH_STATE
    const parsed = JSON.parse(raw) as Partial<AuthState>
    if (!parsed.token || !parsed.user) return INITIAL_AUTH_STATE
    return {
      user:         parsed.user,
      token:        parsed.token,
      refreshToken: parsed.refreshToken ?? null,
      expiresAt:    parsed.expiresAt ?? null,
      clinicId:     parsed.clinicId ?? null,
      clinicName:   parsed.clinicName ?? null,
    }
  } catch {
    return INITIAL_AUTH_STATE
  }
}

export function saveAuthState(state: AuthState) {
  try {
    if (state.token) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
    else             localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // localStorage indisponivel
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>")
  return ctx
}
