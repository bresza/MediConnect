import { useReducer, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import {
  setApiContext,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../services/api"
import { logoutSession, reconcileUserRole, refreshSession } from "../services/auth"
import { clearPatientLinksForUser } from "../services/patientLinks"
import {
  AuthContext,
  authReducer,
  loadAuthState,
  saveAuthState,
  type AuthState,
} from "./authStore"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, undefined, loadAuthState)

  useEffect(() => {
    saveAuthState(state)
  }, [state])

  useEffect(() => {
    setApiContext({
      token:        state.token,
      userId:       state.user?.id ?? null,
      refreshToken: state.refreshToken,
      expiresAt:    state.expiresAt,
    })
  }, [state.token, state.refreshToken, state.expiresAt, state.user?.id])

  useEffect(() => {
    const token = state.token
    const user = state.user
    if (!token || !user || token.startsWith("local-")) return

    let cancelled = false
    void reconcileUserRole(token, user).then((next) => {
      if (cancelled || next.role === user.role) return
      dispatch({
        type: "LOGIN",
        payload: {
          user:         next,
          token:        state.token,
          refreshToken: state.refreshToken,
          expiresAt:    state.expiresAt,
          clinicId:     state.clinicId,
          clinicName:   state.clinicName,
        },
      })
    })
    return () => { cancelled = true }
  }, [state.user?.id, state.token])

  const logout = useCallback(() => {
    if (state.user?.id) clearPatientLinksForUser(state.user.id)
    const currentToken = state.token
    if (currentToken) {
      void logoutSession(currentToken).catch((err) => {
        console.warn("[auth] logout remoto falhou:", err)
      })
    }
    dispatch({ type: "LOGOUT" })
  }, [state.token, state.user?.id])

  useEffect(() => { setUnauthorizedHandler(logout) }, [logout])

  useEffect(() => {
    setSessionRefresher(async () => {
      if (!state.refreshToken) return null
      const refreshed = await refreshSession(state.refreshToken)
      dispatch({ type: "REFRESH", payload: refreshed })
      return refreshed.token
    })
  }, [state.refreshToken])

  const login = useCallback((payload: AuthState) => {
    setApiContext({
      token:        payload.token,
      userId:       payload.user?.id ?? null,
      refreshToken: payload.refreshToken,
      expiresAt:    payload.expiresAt,
    })
    dispatch({ type: "LOGIN", payload })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
