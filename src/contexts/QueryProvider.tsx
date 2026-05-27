import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { appQueryClient } from "../hooks/query/queryClient"

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={appQueryClient}>
      {children}
    </QueryClientProvider>
  )
}
