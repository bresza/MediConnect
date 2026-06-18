import { canAccess, canDo } from "../utils/permissions"
import { ApiError } from "./api"
import {
  getAppointmentDoctors,
  getAvailableSlots,
  isAppointmentSlotBusy,
} from "./appointments"
import { createReport, sendMessage } from "./domain"
import { resolveOutboundChannel } from "./messagingChannel"
import { generateReportContentWithAI } from "./reportAI"
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
  /** Linha principal para o resumo pós-confirmação. */
  summary?: string
  smsSent?: boolean
  smsNote?: string
  extraNotes?: string[]
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

/** Ações que exigem confirmação do usuário antes de executar. send_message não entra — SMS vai automático após agendamento. */
const WRITE_ACTIONS = new Set([
  "create_appointment",
  "cancel_appointment",
  "reschedule_appointment",
  "book_my_appointment",
  "cancel_my_appointment",
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

function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-")
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

async function resolveDoctor(
  deps: CreateAppAIActionsDeps,
  doctorName?: string,
): Promise<{ doctorId: string; doctorName: string }> {
  const doctorsFromStaff = deps.staff.filter((s) => s.role === "doctor")
  if (doctorName) {
    const q = normalize(doctorName)
    const matchStaff = doctorsFromStaff.find((d) => normalize(d.name).includes(q))
    if (matchStaff) return { doctorId: matchStaff.id, doctorName: matchStaff.name }
  }

  const apiDoctors = await getAppointmentDoctors()
  if (doctorName) {
    const q = normalize(doctorName)
    const matchApi = apiDoctors.find((d) => normalize(d.name).includes(q))
    if (matchApi) return { doctorId: matchApi.id, doctorName: matchApi.name }
  }

  if (deps.currentUser.role === "doctor") {
    const self = apiDoctors.find(
      (d) =>
        d.id === deps.currentUser.id ||
        normalize(d.name) === normalize(deps.currentUser.name),
    )
    if (self) return { doctorId: self.id, doctorName: self.name }
    return { doctorId: deps.currentUser.id, doctorName: deps.currentUser.name }
  }

  const firstApi = apiDoctors[0]
  if (firstApi) return { doctorId: firstApi.id, doctorName: firstApi.name }

  const firstStaff = doctorsFromStaff[0]
  if (firstStaff) return { doctorId: firstStaff.id, doctorName: firstStaff.name }

  return { doctorId: deps.currentUser.id, doctorName: deps.currentUser.name }
}

async function validateAppointmentSlot(
  deps: CreateAppAIActionsDeps,
  doctorId: string,
  date: string,
  time: string,
): Promise<AIToolResult | null> {
  const normalizedTime = time.slice(0, 5)
  if (isAppointmentSlotBusy(deps.appointments, doctorId, date, normalizedTime)) {
    return {
      ok: false,
      message: `O horário ${normalizedTime} em ${date} já está ocupado na agenda deste profissional.`,
    }
  }

  try {
    const slots = await getAvailableSlots(doctorId, date, "presencial", {
      allowDefaultFallback: false,
    })
    if (slots.length > 0 && !slots.includes(normalizedTime)) {
      const sample = slots.slice(0, 6).join(", ")
      return {
        ok: false,
        message:
          `Horário ${normalizedTime} não está livre em ${date}. ` +
          `Horários disponíveis: ${sample}${slots.length > 6 ? "…" : ""}.`,
      }
    }
    return null
  } catch {
    return null
  }
}

function appointmentCreateErrorResult(err: unknown): AIToolResult {
  const message =
    err instanceof Error
      ? err.message
      : err instanceof ApiError
        ? err.message
        : "Não foi possível agendar a consulta."
  return { ok: false, message: message || "Não foi possível agendar a consulta." }
}

function buildAppointmentSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  clinicName?: string,
): string {
  const clinic = clinicName?.trim() || "MediConnect"
  return (
    `Olá ${patientName}, sua consulta com Dr(a). ${doctorName} foi confirmada para ` +
    `${formatDateBR(date)} às ${time.slice(0, 5)}. ${clinic}.`
  )
}

function buildRescheduleSms(
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  clinicName?: string,
): string {
  const clinic = clinicName?.trim() || "MediConnect"
  return (
    `Olá ${patientName}, sua consulta com Dr(a). ${doctorName} foi remarcada para ` +
    `${formatDateBR(date)} às ${time.slice(0, 5)}. ${clinic}.`
  )
}

function buildCancelSms(
  patientName: string,
  date: string,
  time: string,
  clinicName?: string,
): string {
  const clinic = clinicName?.trim() || "MediConnect"
  return (
    `Olá ${patientName}, sua consulta do dia ${formatDateBR(date)} às ${time.slice(0, 5)} ` +
    `foi cancelada. Entre em contato com a clínica para reagendar. ${clinic}.`
  )
}

/** Envia SMS sem pedir confirmação extra (após ação já confirmada pelo usuário). */
async function sendAppointmentSmsAuto(
  deps: CreateAppAIActionsDeps,
  patient: Patient,
  content: string,
): Promise<{ smsSent: boolean; smsNote?: string }> {
  if (!canDo(deps.role, "send_messages")) {
    return { smsSent: false, smsNote: "SMS não enviado (perfil sem permissão de mensagens)." }
  }
  if (!patient.phone?.trim()) {
    return { smsSent: false, smsNote: "SMS não enviado (paciente sem telefone cadastrado)." }
  }

  try {
    const channel = resolveOutboundChannel(patient.preferredChannel ?? "SMS")
    await sendMessage({
      patientId: patient.id,
      patientName: patient.name,
      phoneNumber: patient.phone,
      channel,
      content,
      status: "Pending",
      date: new Date().toISOString().slice(0, 10),
    })
    return { smsSent: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha no envio."
    return { smsSent: false, smsNote: `SMS não enviado: ${msg}` }
  }
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
    '- send_message: {"patientName":"...","message":"...","channel?":"SMS"} (executa direto, sem confirmação)',
    '- create_report: {"patientName":"...","examType":"...","clinicalNotes":"..."}',
    '- create_consultation_note: {"patientName":"...","symptoms":"...","diagnosis?":"..."}',
  ]

  const patient = [
    '- book_my_appointment: {"date":"YYYY-MM-DD","time":"HH:MM","doctorName?":"...","type?":"consultation"}',
    '- cancel_my_appointment: {"appointmentId":"...","reason?":"..."}',
    '- navigate_portal: {"section":"overview|find-doctor|consultations|reports|prescriptions|billing|profile"}',
  ]

  const lines = [...common]
  if (role === "patient") lines.push(...patient)
  else {
    if (canDo(role, "create_appointments") || canDo(role, "update_appointments")) lines.push(...staff)
    if (canDo(role, "create_reports")) {
      lines.push('- create_report: {"patientName":"...","examType":"...","clinicalNotes":"..."}')
      lines.push('- create_consultation_note: {"patientName":"...","symptoms":"..."}')
    }
    if (canDo(role, "send_messages")) {
      lines.push('- send_message: {"patientName":"...","message":"...","channel?":"SMS"}')
    }
  }

  lines.push(
    "Após create_appointment ou book_my_appointment confirmados, o sistema envia SMS automaticamente.",
  )

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
        message: "Aguardando confirmação do usuário.",
        needsConfirmation: true,
        pendingAction: { action: name, params, summary },
      }
    }

    try {
      switch (name) {
        case "navigate": {
          const page = String(params.page ?? "") as PageId
          if (!canAccess(deps.role, page)) {
            return { ok: false, message: `Sem permissão para a página "${page}".` }
          }
          deps.navigate(page)
          return {
            ok: true,
            message: `Navegou para ${page}.`,
            summary: `Abri a tela ${page}.`,
          }
        }

        case "navigate_portal": {
          const section = String(params.section ?? "overview") as PortalSection
          deps.setPortalSection?.(section)
          deps.navigate("patient-portal")
          return {
            ok: true,
            message: `Portal: seção ${section}.`,
            summary: `Portal do paciente — seção ${section}.`,
          }
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
          return { ok: true, message: "Dados atualizados.", summary: "Dados da clínica atualizados." }
        }

        case "create_appointment": {
          if (!canDo(deps.role, "create_appointments") && !canAccess(deps.role, "appointments")) {
            return { ok: false, message: "Sem permissão para criar agendamentos." }
          }
          const patient = findPatient(deps.patients, String(params.patientName ?? params.patientId ?? ""))
          if (!patient) return { ok: false, message: "Paciente não encontrado." }
          const { doctorId, doctorName } = await resolveDoctor(deps, params.doctorName ? String(params.doctorName) : undefined)
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          if (!date || !time) return { ok: false, message: "Informe date e time." }
          const type = (String(params.type ?? "consultation") as AppointmentType) || "consultation"
          const slotCheck = await validateAppointmentSlot(deps, doctorId, date, time)
          if (slotCheck) return slotCheck
          try {
            await deps.addAppointment({
              patientId: patient.id,
              patientName: patient.name,
              doctorId,
              doctorName,
              date,
              time,
              duration: 30,
              type,
              status: "confirmed",
            })
          } catch (err) {
            return appointmentCreateErrorResult(err)
          }
          await deps.reloadAll()
          deps.navigate("appointments")
          const sms = await sendAppointmentSmsAuto(
            deps,
            patient,
            buildAppointmentSms(patient.name, doctorName, date, time, deps.clinicName),
          )
          return {
            ok: true,
            message: `Consulta agendada: ${patient.name}, ${date} ${time}, Dr(a). ${doctorName}.`,
            summary: `Consulta agendada para ${patient.name} em ${formatDateBR(date)} às ${time} com Dr(a). ${doctorName}.`,
            ...sms,
          }
        }

        case "cancel_appointment": {
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Agendamento não encontrado." }
          const patient = findPatient(deps.patients, appt.patientId) ?? findPatient(deps.patients, appt.patientName)
          await deps.updateAppointment({
            ...appt,
            status: "cancelled",
            observations: String(params.reason ?? "Cancelado via assistente IA"),
          })
          await deps.reloadAll()
          let sms: { smsSent?: boolean; smsNote?: string } = {}
          if (patient) {
            sms = await sendAppointmentSmsAuto(
              deps,
              patient,
              buildCancelSms(patient.name, appt.date, appt.time, deps.clinicName),
            )
          }
          return {
            ok: true,
            message: `Consulta de ${appt.patientName} em ${appt.date} cancelada.`,
            summary: `Consulta de ${appt.patientName} (${formatDateBR(appt.date)} ${appt.time.slice(0, 5)}) cancelada.`,
            ...sms,
          }
        }

        case "reschedule_appointment": {
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Agendamento não encontrado." }
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          const slotCheck = await validateAppointmentSlot(deps, appt.doctorId, date, time)
          if (slotCheck) return slotCheck
          const patient = findPatient(deps.patients, appt.patientId) ?? findPatient(deps.patients, appt.patientName)
          await deps.updateAppointment({ ...appt, date, time, status: "scheduled" })
          await deps.reloadAll()
          let sms: { smsSent?: boolean; smsNote?: string } = {}
          if (patient) {
            sms = await sendAppointmentSmsAuto(
              deps,
              patient,
              buildRescheduleSms(patient.name, appt.doctorName, date, time, deps.clinicName),
            )
          }
          return {
            ok: true,
            message: `Reagendado para ${date} ${time}.`,
            summary: `Consulta de ${appt.patientName} remarcada para ${formatDateBR(date)} às ${time}.`,
            ...sms,
          }
        }

        case "book_my_appointment": {
          if (!deps.bookPatientAppointment || !deps.portalPatient) {
            return { ok: false, message: "Agendamento pelo portal indisponível." }
          }
          const { doctorId, doctorName } = await resolveDoctor(deps, params.doctorName ? String(params.doctorName) : undefined)
          const date = String(params.date ?? "")
          const time = String(params.time ?? "").slice(0, 5)
          if (!date || !time) return { ok: false, message: "Informe data e horário." }
          const slotCheck = await validateAppointmentSlot(deps, doctorId, date, time)
          if (slotCheck) return slotCheck
          try {
            await deps.bookPatientAppointment({
              patientId: deps.portalPatient.id,
              patientName: deps.portalPatient.name,
              doctorId,
              doctorName,
              date,
              time,
              duration: 30,
              type: (String(params.type ?? "consultation") as AppointmentType) || "consultation",
              status: "confirmed",
            })
          } catch (err) {
            return appointmentCreateErrorResult(err)
          }
          await deps.reloadAll()
          deps.setPortalSection?.("consultations")
          const sms = await sendAppointmentSmsAuto(
            deps,
            deps.portalPatient,
            buildAppointmentSms(deps.portalPatient.name, doctorName, date, time, deps.clinicName),
          )
          return {
            ok: true,
            message: `Sua consulta foi agendada para ${date} ${time} com ${doctorName}.`,
            summary: `Sua consulta foi agendada para ${formatDateBR(date)} às ${time} com Dr(a). ${doctorName}.`,
            ...sms,
          }
        }

        case "cancel_my_appointment": {
          if (!deps.cancelPatientAppointment) return { ok: false, message: "Cancelamento indisponível." }
          const appt = findAppointment(deps.appointments, String(params.appointmentId ?? ""))
          if (!appt) return { ok: false, message: "Consulta não encontrada." }
          await deps.cancelPatientAppointment(appt, String(params.reason ?? "Cancelado pelo paciente via assistente"))
          await deps.reloadAll()
          const patient = deps.portalPatient
          let sms: { smsSent?: boolean; smsNote?: string } = {}
          if (patient?.phone) {
            sms = await sendAppointmentSmsAuto(
              deps,
              patient,
              buildCancelSms(patient.name, appt.date, appt.time, deps.clinicName),
            )
          }
          return {
            ok: true,
            message: "Consulta cancelada.",
            summary: `Consulta do dia ${formatDateBR(appt.date)} às ${appt.time.slice(0, 5)} cancelada.`,
            ...sms,
          }
        }

        case "send_message": {
          if (!canDo(deps.role, "send_messages")) return { ok: false, message: "Sem permissão para enviar mensagens." }
          const patient = findPatient(deps.patients, String(params.patientName ?? params.patientId ?? ""))
          if (!patient?.phone) return { ok: false, message: "Paciente sem telefone." }
          const channel = resolveOutboundChannel(
            String(params.channel ?? patient.preferredChannel ?? "") as CommunicationChannel,
          )
          await sendMessage({
            patientId: patient.id,
            patientName: patient.name,
            phoneNumber: patient.phone,
            channel,
            content: String(params.message ?? ""),
            status: "Pending",
            date: new Date().toISOString().slice(0, 10),
          })
          return {
            ok: true,
            message: `SMS enviado para ${patient.name}.`,
            summary: `Mensagem SMS enviada para ${patient.name}.`,
            smsSent: true,
          }
        }

        case "create_report": {
          if (!canDo(deps.role, "create_reports") && !canDo(deps.role, "view_reports")) {
            return { ok: false, message: "Sem permissão para laudos." }
          }
          const patient = findPatient(deps.patients, String(params.patientName ?? ""))
          if (!patient) return { ok: false, message: "Paciente não encontrado." }
          const examType = String(params.examType ?? "Laudo Médico")
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
          return {
            ok: true,
            message: `Laudo rascunho criado (${examType}) para ${patient.name}.`,
            summary: `Laudo "${examType}" criado em rascunho para ${patient.name}. Revise em Laudos.`,
            extraNotes: [`ID: ${report.id.slice(0, 8)}…`],
          }
        }

        case "create_consultation_note": {
          const patient = findPatient(deps.patients, String(params.patientName ?? ""))
          if (!patient) return { ok: false, message: "Paciente não encontrado." }
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
                    "Médico assistente. Responda JSON: {\"diagnosis\":\"...\",\"history\":\"...\",\"plan\":\"...\"}. Português BR.",
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

          if (!diagnosis) diagnosis = "A definir após avaliação presencial"

          await deps.addMedicalRecord({
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
          await deps.reloadAll()
          return {
            ok: true,
            message: `Consulta registrada para ${patient.name}.`,
            summary: `Prontuário registrado para ${patient.name}. Revise o perfil do paciente.`,
          }
        }

        default:
          return { ok: false, message: `Ferramenta desconhecida: ${action}` }
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Erro ao executar ação." }
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
      return `Agendar consulta: ${params.patientName}, ${params.date} às ${params.time}${params.doctorName ? ` com ${params.doctorName}` : ""}. Após confirmar, enviaremos SMS ao paciente automaticamente.`
    case "cancel_appointment":
    case "cancel_my_appointment":
      return `Cancelar consulta ${params.appointmentId}`
    case "reschedule_appointment":
      return `Reagendar para ${params.date} às ${params.time}`
    case "book_my_appointment":
      return `Agendar sua consulta: ${params.date} às ${params.time}. SMS de confirmação será enviado automaticamente.`
    case "create_report":
      return `Criar laudo ${params.examType} para ${params.patientName}`
    case "create_consultation_note":
      return `Registrar consulta/prontuário para ${params.patientName}`
    default:
      return `${action} (${deps.role})`
  }
}
