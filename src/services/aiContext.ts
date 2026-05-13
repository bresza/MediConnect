/**
 * Monta um resumo textual dos dados ja carregados na sessao (mesma API/Supabase
 * que o restante do app) para o assistente usar nas respostas.
 * Nao expoe CPF completo nem tokens; limita tamanho para caber no prompt.
 */
import type { Appointment, Patient, Prescription, StaffMember, UserRole } from "../types"

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
}

export function buildAIApiContextFromAppState(input: AIContextFromAppStateInput): string {
  const { role, patients, appointments, prescriptions, staff } = input

  const lines: string[] = []
  lines.push("[Contexto da API — dados desta sessao, mesmo backend Supabase do MediConnect]")
  lines.push(`Perfil: ${role}`)
  lines.push(`Totais: ${patients.length} paciente(s) na visao, ${appointments.length} agendamento(s), ${prescriptions.length} receita(s).`)

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
    lines.push(`Receitas na visao do paciente: ${prescriptions.length} registro(s).`)
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
