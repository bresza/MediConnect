/**
 * Paciente técnico usado para preservar FK de agendamentos quando um
 * cadastro real é excluído. A identidade é o e-mail sentinela — nunca o
 * CPF. O CPF de exemplo 529.982.247-25 é amplamente usado em testes no
 * Brasil; resolvê-lo como placeholder reatribui agenda/PHI ao paciente
 * errado.
 */

export const REMOVED_PATIENT_EMAIL = "paciente.removido@mediconnect.local"
export const REMOVED_PATIENT_NAME = "Paciente removido"

/** CPF de documentação da Receita; NÃO usar como chave de lookup. */
export const WELL_KNOWN_EXAMPLE_CPF = "52998224725"

type RemovedPatientLike = {
  email?: string | null
  full_name?: string | null
  name?: string | null
  cpf?: string | null
} | null | undefined

export function isRemovedPatientPlaceholder(patient: RemovedPatientLike): boolean {
  const email = patient?.email?.trim().toLowerCase()
  return email === REMOVED_PATIENT_EMAIL
}

export function pickRemovedPatientPlaceholder<T extends { email?: string | null }>(
  candidates: Array<T | null | undefined>,
): T | null {
  for (const row of candidates) {
    if (row && isRemovedPatientPlaceholder(row)) return row
  }
  return null
}

function cpfCheckDigit(digits: string): number {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * (digits.length + 1 - i)
  }
  const rest = (sum * 10) % 11
  return rest === 10 ? 0 : rest
}

function makeValidCpf(base9: string): string {
  const d1 = cpfCheckDigit(base9)
  const d2 = cpfCheckDigit(`${base9}${d1}`)
  return `${base9}${d1}${d2}`
}

/**
 * CPFs válidos só para INSERT do registro técnico. Se um já estiver em uso
 * por um paciente real, o caller tenta o próximo — sem adotá-lo.
 */
export function removedPatientCpfCandidates(): string[] {
  const bases = ["864249850", "864249851", "864249852", "390533447"]
  return bases.map(makeValidCpf)
}

export function withoutRemovedPatientPlaceholders<T extends { email?: string | null }>(
  patients: T[],
): T[] {
  return patients.filter((patient) => !isRemovedPatientPlaceholder(patient))
}
