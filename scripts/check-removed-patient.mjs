/**
 * Self-check for the deleted-patient placeholder identity invariant.
 * Run: node scripts/check-removed-patient.mjs
 */
import assert from "node:assert/strict"

const REMOVED_PATIENT_EMAIL = "paciente.removido@mediconnect.local"
const WELL_KNOWN_EXAMPLE_CPF = "52998224725"

function isRemovedPatientPlaceholder(patient) {
  const email = patient?.email?.trim().toLowerCase()
  return email === REMOVED_PATIENT_EMAIL
}

function pickRemovedPatientPlaceholder(candidates) {
  for (const row of candidates) {
    if (row && isRemovedPatientPlaceholder(row)) return row
  }
  return null
}

function cpfCheckDigit(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * (digits.length + 1 - i)
  }
  const rest = (sum * 10) % 11
  return rest === 10 ? 0 : rest
}

function makeValidCpf(base9) {
  const d1 = cpfCheckDigit(base9)
  const d2 = cpfCheckDigit(`${base9}${d1}`)
  return `${base9}${d1}${d2}`
}

function removedPatientCpfCandidates() {
  return ["864249850", "864249851", "864249852", "390533447"].map(makeValidCpf)
}

function isValidCpf(value) {
  const cpf = String(value).replace(/\D/g, "")
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (length) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

const famousCpfPatient = { id: "real-test-patient", email: "qa@clinic.com", cpf: WELL_KNOWN_EXAMPLE_CPF, full_name: "Paciente QA" }
const sameNamePatient = { id: "named", email: "joao@clinic.com", cpf: "39053344705", full_name: "Paciente removido" }
const placeholder = { id: "sink", email: REMOVED_PATIENT_EMAIL, cpf: "86424985018", full_name: "Paciente removido" }

assert.equal(isRemovedPatientPlaceholder(famousCpfPatient), false, "famous CPF must not identify the sink")
assert.equal(isRemovedPatientPlaceholder(sameNamePatient), false, "name-only must not identify the sink")
assert.equal(isRemovedPatientPlaceholder(placeholder), true)

assert.equal(pickRemovedPatientPlaceholder([famousCpfPatient, sameNamePatient]), null)
assert.equal(pickRemovedPatientPlaceholder([famousCpfPatient, placeholder])?.id, "sink")
assert.equal(pickRemovedPatientPlaceholder([null, famousCpfPatient, placeholder])?.id, "sink")

const cpfs = removedPatientCpfCandidates()
assert.ok(cpfs.length >= 2)
for (const cpf of cpfs) {
  assert.equal(cpf.length, 11)
  assert.equal(isValidCpf(cpf), true, `candidate ${cpf} must be a valid CPF`)
  assert.notEqual(cpf, WELL_KNOWN_EXAMPLE_CPF)
}

console.log("removed-patient placeholder checks passed")
