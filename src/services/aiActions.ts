import { canAccess, canDo } from "../utils/permissions"
import { createReport, sendMessage } from "./domain"
import { generateReportContentWithAI } from "./reportAI"
import { runAppointmentReminders } from "./appointmentReminders"
import { processInboundWhatsAppReplies } from "./whatsappInbound"
import type { PortalSection } from "../pages/PatientPortal/patientPortalSections"
import type {
  Appointment,
  AppointmentType,
  CommunicationChannel,
  PageId,
  Patient,
  Prescription,
  StaffMember,
  User,
  UserRole,
} from "../types"

export interface AIToolResult {
  ok: boolean
  message: string
  data?: unknown
  needsConfirmation?: boolean
  pendingAction?: { action: string; params: Record<string, unknown>; summary: string }
}

export interface CreateAppAIActionsDeps {
  role: UserRole
  currentUser: User
  activePage: PageId
  clinicName?: string
  patients: Patient[]
  appointments: Appointment[]
  staff: StaffMember[]
  prescriptions: Prescription[]
  portalPatient?: Patient | null
  navigate: (page: PageId) => void
  setPortalSection?: (section: PortalSection) => void
  reloadAll: () => Promise<void>
  addAppointment: (a: Omit<Appointment, "id">) => Promise<void>
  updateAppointment: (a: Appointment) => Promise<void>
  bookPatientAppointment?: (a: Omit<Appointment, "id">) => Promise<void>
  cancelPatientAppointment?: (appointment: Appointment, reason: string) => Promise<void>
  addMedicalRecord: (r: Omit<import("../types").MedicalRecord, "id">) => Promise<import("../types").MedicalRecord>
}

export interface AppAIActions {
  role: UserRole
  activePage: PageId
  executeTool: (action: string, params: Record<string, unknown>, options?: { confirmed?: boolean }) => Promise<AIToolResult>
  getToolsDescription: () => string
}

const WRITE_ACTIONS = new Set([
  "create_appointment",
  "cancel_appointment",
  "reschedule_appointment",
  "book_my_appointment",
  "cancel_my_appointment",
  "send_message",
  "create_report",
  "create_consultation_note",
])

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function findPatient(patients: Patient[], query: string): Patient | undefined {
  const q = normalize(query)
  if (!q) return undefined
  const byId = patients.find((p) => p.id === query)
  if (byId) return byId
  return patients.find(
    (p) =>
      normalize(p.name).includes(q) ||
      (p.socialName && normalize(p.socialName).includes(q)) ||
      normalize(p.name).split(" ")[0] === q,
  )
}

function findAppointment(appointments: Appointment[], idOrHint: string): Appointment | undefined {
  const byId = appointments.find((a) => a.id === idOrHint)
  if (byId) return byId
  const q = normalize(idOrHint)
  return appointments.find((a) => normalize(a.patientName).includes(q))
}

function resolveDoctor(
  deps: CreateAppAIActionsDeps,
  doctorName?: string,
): { doctorId: string; doctorName: string } {
  const doctors = deps.staff.filter((s) => s.role === "doctor")
  if (doctorName) {
    const match = doctors.find((d) => normalize(d.name).includes(normalize(doctorName)))
    if (match) return { doctorId: match.id, doctorName: match.name }
  }
  if (deps.currentUser.role === "doctor") {
    return { doctorId: deps.currentUser.id, doctorName: deps.currentUser.name }
  }
  const first = doctors[0]
  if (first) return { doctorId: first.id, doctorName: first.name }
  return { doctorId: deps.currentUser.id, doctorName: deps.currentUser.name }
}

function buildToolsDescription(role: UserRole): string {
  const common = [
    '- list_appointments: {"date?":"YYYY-MM-DD","patientName?":"...","status?":"scheduled|confirmed|..."}',
    '- list_patients: {"search?":"nome"}',
    '- refresh_data: {}',
    '- navigate: {"page":"appointments|reports|messages|patients|dashboard|financial|availability|team|settings"}',
  ]

  const staff = [
    '- create_appointment: {"patientName":"...","date":"YYYY-MM-DD","time":"HH:MM","doctorName?":"...","type?":"consultation|return|exam|procedure"}',
    '- cancel_appointment: {"appointmentId":"...","reason?":"..."}',
    '- reschedule_appointment: {"appointmentId":"...","date":"YYYY-MM-DD","time":"HH:MM"}',
    '- send_message: {"patientName":"...","message":"...","channel?":"WhatsApp|SMS"}',
    '- create_report: {"patientName":"...","examType":"...","clinicalNotes":"..."}',
    '- create_consultation_note: {"patientName":"...","symptoms":"...","diagnosis?":"..."}',
    '- run_reminders: {}',
    '- process_whatsapp: {}',
  ]

  const patient = [
    '- book_my_appointment: {"date":"YYYY-MM-DD","time":"HH:MM","doctorName?":"...","type?":"consultation"}',
    '- cancel_my_appointment: {"appointmentId":"...","reason?":"..."}',
    '- navigate_portal: {"section":"overview|find-doctor|consultations|reports|prescriptions|billing|profile"}',
  ]

  const lines = [...common]
  if (role === "patient") lines.push(...patient)
  else {
    if (canDo(role, "create_appointments") || canDo(role, "update_appointments")) lines.push(...staff.filter((l) => !l.startsWith("- run")))
    if (canDo(role, "create_reports")) {
      lines.push('- create_report: {"patientName":"...","examType":"...","clinicalNotes":"..."}')
      lines.push('- create_consultation_note: {"patientName":"...","symptoms":"..."}')
    }
    if (canDo(role, "send_messages")) {
      lines.push('- send_message: {"patientName":"...","message":"...","channel?":"WhatsApp|SMS"}')
      lines.push('- run_reminders: {}', '- process_whatsapp: {}')
    }
  }

  return lines.join("\n")
}

export function createAppAIActions(deps: CreateAppAIActionsDeps): AppAIActions {
  async function executeTool(
    action: string,
    params: Record<string, unknown>,
    options?: { confirmed?: boolean },
  ): Promise<AIToolResult> {
    const name = action.trim().toLowerCase()

    if (WRITE_ACTIONS.has(name) && !options?.confirmed) {
      const summary = describePendingAction(name, params, deps)
      return {
        ok: true,
        message: "Aguardando confirmacao do usuario.",
        needsConfirmation: true,
        pendingAction: { action: name, params, summary },
      }
    }

    try {
      switch (name) {
        case "navigate": {
          const page = String(params.page ?? "") as PageId
          if (!canAccess(deps.role, page)) {
            return { ok: false, message: `Sem permissao para a pagina "${page}".` }
          }
          deps.navigate(page)
          return { ok: true, message: `Navegou para ${page}.` }
        }

        case "navigate_portal": {
          const section = String(params.section ?? "overview") as PortalSection
          deps.setPortalSection?.(section)
          deps.navigate("patient-portal")
          return { ok: true, message: `Portal: secao ${section}.` }
        }

        case "list_appointments": {
          let list = [...deps.appointments]
          const date = params.date ? String(params.date) : ""
          const patientName = params.patientName ? String(params.patientName) : ""
          const status = params.status ? String(params.status) : ""
          if (date) list = list.filter((a) => a.date === date)
          if (patientName) list = list.filter((a) => normalize(a.patientName).includes(normalize(patientName)))
          if (status) list = list.filter((a) => a.status === status)
          list = list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 15)
          const text = list.length
            ? list.map((a) => `${a.id.slice(0, 8)}… | ${a.date} ${a.time} | ${a.patientName} | ${a.doctorName} | ${a.status}`).join("\n")
            : "Nenhum agendamento encontrado."
          return { ok: true, message: text, data: list }
        }

        case "list_patients": {
          let list = deps.patients
          const search = params.search ? String(params.search) : ""
          if (search) list = list.filter((p) => normalize(p.name).includes(normalize(search)))
          const text = list.slice(0, 15).map((p) => `${p.id.slice(0, 8)}… | ${p.name} | tel: ${p.phone || "—"}`).join("\n") || "Nenhum paciente."
          return { ok: true, message: text, data: list }
        }

        case "refresh_data": {
          await deps.reloadAll()
          return { ok: true, message: "Dados atualizados." }
        }

        case "create_appointment": {
          if (!canDo(deps.role, "create_appointments") && !canAccess(deps.role, "appointments")) {
            return { ok: false, message: "Sem permissao para criar agendamentos." }
          }
          const patient = findPatient(deps.patients, String(params.patientName ?? params.patientId ?? ""))
          if (!patient) return { ok: false, message: "Paciente nao encontrado." }
          const { doctorId, doctorName } = resolveDoctor(deps, params.doctorName ? String(params.doctorName) : undefined)
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          if (!date || !time) return { ok: false, message: "Informe date e time." }
          const type = (String(params.type ?? "consultation") as AppointmentType) || "consultation"
          await deps.addAppointment({
            patientId: patient.id,
            patientName: patient.name,
            doctorId,
            doctorName,
            date,
            time,
            duration: 30,
            type,
            status: "scheduled",
          })
          deps.navigate("appointments")
          return { ok: true, message: `Consulta agendada: ${patient.name}, ${date} ${time}, Dr(a). ${doctorName}.` }
        }

        case "cancel_appointment": {
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Agendamento nao encontrado." }
          await deps.updateAppointment({ ...appt, status: "cancelled", observations: String(params.reason ?? "Cancelado via assistente IA") })
          return { ok: true, message: `Consulta de ${appt.patientName} em ${appt.date} cancelada.` }
        }

        case "reschedule_appointment": {
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Agendamento nao encontrado." }
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          await deps.updateAppointment({ ...appt, date, time, status: "scheduled" })
          return { ok: true, message: `Reagendado para ${date} ${time}.` }
        }

        case "book_my_appointment": {
          if (!deps.bookPatientAppointment || !deps.portalPatient) {
            return { ok: false, message: "Agendamento pelo portal indisponivel." }
          }
          const { doctorId, doctorName } = resolveDoctor(deps, params.doctorName ? String(params.doctorName) : undefined)
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          await deps.bookPatientAppointment({
            patientId: deps.portalPatient.id,
            patientName: deps.portalPatient.name,
            doctorId,
            doctorName,
            date,
            time,
            duration: 30,
            type: (String(params.type ?? "consultation") as AppointmentType) || "consultation",
            status: "scheduled",
          })
          deps.setPortalSection?.("consultations")
          return { ok: true, message: `Sua consulta foi agendada para ${date} ${time} com ${doctorName}.` }
        }

        case "cancel_my_appointment": {
          if (!deps.cancelPatientAppointment) return { ok: false, message: "Cancelamento indisponivel." }
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Consulta nao encontrada." }
          await deps.cancelPatientAppointment(appt, String(params.reason ?? "Cancelado pelo paciente via assistente"))
          return { ok: true, message: "Consulta cancelada." }
        }

        case "send_message": {
          if (!canDo(deps.role, "send_messages")) return { ok: false, message: "Sem permissao para enviar mensagens." }
          const patient = findPatient(deps.patients, String(params.patientName ?? params.patientId ?? ""))
          if (!patient?.phone) return { ok: false, message: "Paciente sem telefone." }
          const channel = (String(params.channel ?? patient.preferredChannel ?? "WhatsApp") as CommunicationChannel)
          await sendMessage({
            patientId: patient.id,
            patientName: patient.name,
            phoneNumber: patient.phone,
            channel: channel === "SMS" ? "SMS" : "WhatsApp",
            content: String(params.message ?? ""),
            status: "Pending",
            date: new Date().toISOString().slice(0, 10),
            fallbackSms: channel !== "SMS",
          })
          return { ok: true, message: `Mensagem enviada para ${patient.name} via ${channel}.` }
        }

        case "create_report": {
          if (!canDo(deps.role, "create_reports") && !canDo(deps.role, "view_reports")) {
            return { ok: false, message: "Sem permissao para laudos." }
          }
          const patient = findPatient(deps.patients, String(params.patientName ?? ""))
          if (!patient) return { ok: false, message: "Paciente nao encontrado." }
          const examType = String(params.examType ?? "Laudo Medico")
          const clinicalNotes = String(params.clinicalNotes ?? params.symptoms ?? "")
          const aiContent = await generateReportContentWithAI({
            examType,
            clinicalNotes,
            patient,
            doctorName: deps.currentUser.name,
          })
          const report = await createReport({
            patientId: patient.id,
            patientName: patient.name,
            doctorId: deps.currentUser.id,
            doctorName: deps.currentUser.name,
            type: examType,
            diagnosis: aiContent.diagnosis,
            conclusion: aiContent.conclusion,
            contentHtml: aiContent.contentHtml,
            status: "Draft",
            date: new Date().toISOString().slice(0, 10),
          })
          deps.navigate("reports")
          await deps.reloadAll()
          return { ok: true, message: `Laudo rascunho criado (${examType}) para ${patient.name}. ID: ${report.id.slice(0, 8)}… Revise em Laudos.`, data: report }
        }

        case "create_consultation_note": {
          const patient = findPatient(deps.patients, String(params.patientName ?? ""))
          if (!patient) return { ok: false, message: "Paciente nao encontrado." }
          const symptoms = String(params.symptoms ?? "")
          let diagnosis = String(params.diagnosis ?? "")
          let treatmentPlan = String(params.treatment ?? "")
          let currentHistory = symptoms

          if (symptoms.trim()) {
            try {
              const { chatComplete } = await import("./ai")
              const aiText = await chatComplete([
                {
                  role: "system",
                  content:
                    "Medico assistente. Responda JSON: {\"diagnosis\":\"...\",\"history\":\"...\",\"plan\":\"...\"}. Portugues BR.",
                },
                { role: "user", content: `Queixa: ${symptoms}. Paciente: ${patient.name}` },
              ])
              const jsonMatch = aiText.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { diagnosis?: string; history?: string; plan?: string }
                diagnosis = parsed.diagnosis ?? diagnosis
                currentHistory = parsed.history ?? currentHistory
                treatmentPlan = parsed.plan ?? treatmentPlan
              }
            } catch {
              // segue com dados informados
            }
          }

          if (!diagnosis) diagnosis = "A definir apos avaliacao presencial"

          const record = await deps.addMedicalRecord({
            patientId: patient.id,
            patientName: patient.name,
            doctorId: deps.currentUser.id,
            doctorName: deps.currentUser.name,
            date: new Date().toISOString().slice(0, 10),
            chiefComplaint: symptoms,
            currentHistory,
            diagnosis,
            treatmentPlan,
            status: "open",
            createdAt: new Date().toISOString(),
          })
          deps.navigate("patient-profile")
          return { ok: true, message: `Consulta com IA registrada para ${patient.name}. Revise o prontuario.`, data: record }
        }

        case "run_reminders": {
          const result = await runAppointmentReminders(deps.appointments, new Map(deps.patients.map((p) => [p.id, p])))
          return { ok: true, message: `${result.sent} lembrete(s) enviado(s).` }
        }

        case "process_whatsapp": {
          const result = await processInboundWhatsAppReplies(deps.appointments, deps.patients, deps.clinicName)
          return { ok: true, message: `${result.replied} resposta(s) automatica(s) no WhatsApp.` }
        }

        default:
          return { ok: false, message: `Ferramenta desconhecida: ${action}` }
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Erro ao executar acao." }
    }
  }

  return {
    role: deps.role,
    activePage: deps.activePage,
    executeTool,
    getToolsDescription: () => buildToolsDescription(deps.role),
  }
}

function describePendingAction(
  action: string,
  params: Record<string, unknown>,
  deps: CreateAppAIActionsDeps,
): string {
  switch (action) {
    case "create_appointment":
      return `Agendar consulta: ${params.patientName}, ${params.date} ${params.time}`
    case "cancel_appointment":
    case "cancel_my_appointment":
      return `Cancelar consulta ${params.appointmentId}`
    case "reschedule_appointment":
      return `Reagendar para ${params.date} ${params.time}`
    case "book_my_appointment":
      return `Agendar sua consulta: ${params.date} ${params.time}`
    case "send_message":
      return `Enviar mensagem para ${params.patientName}: "${String(params.message ?? "").slice(0, 80)}…"`
    case "create_report":
      return `Criar laudo ${params.examType} para ${params.patientName}`
    case "create_consultation_note":
      return `Registrar consulta para ${params.patientName}`
    default:
      return `${action} (${deps.role})`
  }
}
