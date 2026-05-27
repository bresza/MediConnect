import { lazy } from "react"

export const Dashboard = lazy(() =>
  import("./Dashboard/Dashboard").then((m) => ({ default: m.Dashboard })),
)
export const Patients = lazy(() =>
  import("./Patients/Patients").then((m) => ({ default: m.Patients })),
)
export const Registration = lazy(() =>
  import("./Registration/Registration").then((m) => ({ default: m.Registration })),
)
export const Appointments = lazy(() =>
  import("./Appointments/Appointments").then((m) => ({ default: m.Appointments })),
)
export const Availability = lazy(() =>
  import("./Availability/Availability").then((m) => ({ default: m.Availability })),
)
export const Reports = lazy(() =>
  import("./Reports/Reports").then((m) => ({ default: m.Reports })),
)
export const PatientProfile = lazy(() =>
  import("./PatientProfile/PatientProfile").then((m) => ({ default: m.PatientProfile })),
)
export const PatientPortal = lazy(() =>
  import("./PatientPortal/PatientPortal").then((m) => ({ default: m.PatientPortal })),
)
export const Messages = lazy(() =>
  import("./Messages/Messages").then((m) => ({ default: m.Messages })),
)
export const Financial = lazy(() =>
  import("./Financial/Financial").then((m) => ({ default: m.Financial })),
)
export const Settings = lazy(() =>
  import("./Settings/Settings").then((m) => ({ default: m.Settings })),
)
export const Team = lazy(() =>
  import("./Team/Team").then((m) => ({ default: m.Team })),
)
