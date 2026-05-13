/**
 * Monta um resumo textual dos dados ja carregados na sessao (mesma API/Supabase
 * que o restante do app) para o assistente usar nas respostas.
 * Nao expoe CPF completo nem tokens; limita tamanho para caber no prompt.
 */
import type { Appointment, Patient, Prescription, Report, StaffMember, UserRole } from "../types"

const MAX_SNAPSHOT_CHARS = 7500
const MAX_PATIENTS       = 20
const MAX_APPOINTMENTS   = 14
const MAX_STAFF          = 12
const MAX_RX             = 8

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (texto truncado por limite de contexto)`
}

export interface AIContextFromAppStateInput {
  role:           UserRole
  patients:       Patient[]
  appointments:   Appointment[]
  prescriptions:  Prescription[]
  staff:          StaffMember[]
  /** Laudos visiveis ao paciente (portal). */
  reports?:       Report[]
}

export function buildAIApiContextFromAppState(input: AIContextFromAppStateInput): string {
  const { role, patients, appointments, prescriptions, staff, reports = [] } = input

  const lines: string[] = []
  lines.push("[Contexto da API — dados desta sessao, mesmo backend Supabase do MediConnect]")
  lines.push(`Perfil: ${role}`)
  lines.push(
    `Totais: ${patients.length} paciente(s) na visao, ${appointments.length} agendamento(s), ` +
    `${prescriptions.length} receita(s)` +
    (role === "patient" ? `, ${reports.length} laudo(s).` : "."),
  )

  if (role !== "patient") {
    const doctors = staff.filter((m) => m.role === "doctor").length
    const others    = staff.length - doctors
    lines.push(`Equipe carregada: ${staff.length} perfil(is) (${doctors} medico(s), ${others} demais).`)
  }

  if (patients.length > 0) {
    lines.push("")
    lines.push(`Pacientes (ate ${MAX_PATIENTS}, sem CPF completo):`)
    for (const p of patients.slice(0, MAX_PATIENTS)) {
      const cpfMask = p.cpf?.replace(/\D/g, "").length === 11 ? "***.***.***-**" : "—"
      lines.push(`- ${p.name} | status: ${p.status} | CPF: ${cpfMask}`)
    }
  }

  if (appointments.length > 0) {
    lines.push("")
    lines.push(`Agendamentos (ate ${MAX_APPOINTMENTS}):`)
    const sorted = [...appointments].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    for (const a of sorted.slice(0, MAX_APPOINTMENTS)) {
      lines.push(
        `- ${a.date} ${a.time} | ${a.patientName} | Dr(a). ${a.doctorName} | ${a.status} | tipo: ${a.type}`,
      )
    }
  }

  if (prescriptions.length > 0 && role !== "patient") {
    lines.push("")
    lines.push(`Receitas recentes (ate ${MAX_RX}, titulo/resumo):`)
    for (const r of prescriptions.slice(0, MAX_RX)) {
      lines.push(`- ${r.date} | paciente: ${r.patientName} | Dr(a). ${r.doctorName}`)
    }
  } else if (prescriptions.length > 0 && role === "patient") {
    lines.push("")
    lines.push(`Suas receitas (ate ${MAX_RX}):`)
    for (const r of prescriptions.slice(0, MAX_RX)) {
      const meds = r.medications?.slice(0, 3).map((m) => m.name).filter(Boolean).join(", ")
      lines.push(`- ${r.date} | Dr(a). ${r.doctorName}${meds ? ` | medicamentos: ${meds}` : ""}`)
    }
  }

  if (role === "patient" && reports.length > 0) {
    lines.push("")
    lines.push("Seus laudos/exames (resumo):")
    for (const rep of reports.slice(0, 6)) {
      lines.push(`- ${rep.date} | ${rep.type} | status: ${rep.status}${rep.cid10 ? ` | CID: ${rep.cid10}` : ""}`)
    }
  }

  if (role === "patient" && appointments.length > 0) {
    lines.push("")
    lines.push("Proximas consultas do paciente:")
    const upcoming = [...appointments]
      .filter((a) => a.status !== "cancelled")
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 5)
    for (const a of upcoming) {
      lines.push(`- ${a.date} ${a.time} | Dr(a). ${a.doctorName} | ${a.status} | ${a.type}`)
    }
  }

  if (role !== "patient" && staff.length > 0) {
    lines.push("")
    lines.push(`Equipe (ate ${MAX_STAFF}):`)
    for (const m of staff.slice(0, MAX_STAFF)) {
      const extra = m.role === "doctor" && m.specialty ? ` | ${m.specialty}` : m.department ? ` | ${m.department}` : ""
      lines.push(`- ${m.name} (${m.role})${extra}`)
    }
  }

  lines.push("")
  lines.push(
    "Estes dados refletem o que a API devolveu para esta sessao; podem estar desatualizados ate o usuario atualizar a tela.",
  )

  return clip(lines.join("\n"), MAX_SNAPSHOT_CHARS)
}
