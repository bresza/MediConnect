import { createContext, useContext, useReducer, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import type { User } from "../types"
import { setApiContext, setUnauthorizedHandler } from "../services/api"

const STORAGE_KEY = "mediconnect:auth"

export interface AuthState {
  user:       User   | null
  token:      string | null
  clinicId:   string | null
  clinicName: string | null
}

const INITIAL: AuthState = { user: null, token: null, clinicId: null, clinicName: null }

function load(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL
    const p = JSON.parse(raw) as AuthState
    return p.token && p.user ? p : INITIAL
  } catch { return INITIAL }
}

function save(s: AuthState) {
  try {
    if (s.token) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else         localStorage.removeItem(STORAGE_KEY)
  } catch { /* silencia */ }
}

type Action = { type: "LOGIN"; payload: AuthState } | { type: "LOGOUT" }

function reducer(state: AuthState, action: Action): AuthState {
  if (action.type === "LOGIN")  return { ...action.payload }
  if (action.type === "LOGOUT") return { ...INITIAL }
  return state
}

interface AuthContextValue extends AuthState {
  login:  (payload: AuthState) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  // injeta token + userId no cliente HTTP sempre que o estado mudar
  useEffect(() => {
    setApiContext(state.token, state.clinicId, state.user?.id ?? null)
    save(state)
  }, [state])

  const logout = useCallback(() => dispatch({ type: "LOGOUT" }), [])
  useEffect(() => { setUnauthorizedHandler(logout) }, [logout])

  const login = useCallback((payload: AuthState) => {
    dispatch({ type: "LOGIN", payload })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>")
  return ctx
}
