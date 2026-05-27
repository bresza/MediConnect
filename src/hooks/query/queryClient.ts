import { QueryClient } from "@tanstack/react-query"

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        retry: (failureCount, error) => {
          if (error && typeof error === "object" && "status" in error) {
            const status = (error as { status: number }).status
            if (status === 401 || status === 403) return false
          }
          return failureCount < 1
        },
        refetchOnWindowFocus: true,
      },
    },
  })
}

export const appQueryClient = createAppQueryClient()
