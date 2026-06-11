import { useReducer, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import {
  setApiContext,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../services/api"
import { refreshSession } from "../services/auth"
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

  const logout = useCallback(() => dispatch({ type: "LOGOUT" }), [])

  useEffect(() => { setUnauthorizedHandler(logout) }, [logout])

  useEffect(() => {
    setSessionRefresher(async () => {
      if (!state.refreshToken) return null
      const refreshed = await refreshSession(state.refreshToken)
      setApiContext({
        token:        refreshed.token,
        userId:       state.user?.id ?? null,
        refreshToken: refreshed.refreshToken,
        expiresAt:    refreshed.expiresAt,
      })
      dispatch({ type: "REFRESH", payload: refreshed })
      return refreshed.token
    })
  }, [state.refreshToken, state.user?.id])

  const login = useCallback((payload: AuthState) => {
    dispatch({ type: "LOGIN", payload })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
