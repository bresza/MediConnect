import type { PageId } from "../types"

const PAGE_IMPORTS: Partial<Record<PageId, () => Promise<unknown>>> = {
  dashboard: () => import("../pages/Dashboard/Dashboard"),
  patients: () => import("../pages/Patients/Patients"),
  register: () => import("../pages/Registration/Registration"),
  appointments: () => import("../pages/Appointments/Appointments"),
  availability: () => import("../pages/Availability/Availability"),
  reports: () => import("../pages/Reports/Reports"),
  "patient-profile": () => import("../pages/PatientProfile/PatientProfile"),
  "patient-portal": () => import("../pages/PatientPortal/PatientPortal"),
  messages: () => import("../pages/Messages/Messages"),
  financial: () => import("../pages/Financial/Financial"),
  settings: () => import("../pages/Settings/Settings"),
  team: () => import("../pages/Team/Team"),
}

export function prefetchPageChunk(pageId: PageId): void {
  const load = PAGE_IMPORTS[pageId]
  if (load) void load()
}
