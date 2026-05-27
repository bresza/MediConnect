import { useQuery } from "@tanstack/react-query"
import type { Report } from "../../types"
import { useAuth } from "../../contexts/authStore"
import { getReports } from "../../services/domain"
import { reportKeys } from "./queryKeys"

export function useReportsQuery(enabled = true) {
  const { clinicId } = useAuth()
  return useQuery<Report[]>({
    queryKey: reportKeys.all(clinicId),
    queryFn: () => getReports(),
    enabled,
    staleTime: 60_000,
  })
}
