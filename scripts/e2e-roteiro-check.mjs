/**
 * Verificações automatizadas do roteiro (API + dados).
 * Uso: node scripts/e2e-roteiro-check.mjs
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, "../.env")
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

const USERS = {
  secretary: { email: "vinijr@popcode.com", password: "Teste@123" },
  doctor: { email: "virginia@popcode.com", password: "Teste@123" },
  patient: { email: "alicia@popcode.com", password: "Teste@123" },
  manager: { email: "hugo@popcode.com.br", password: "hdoria" },
}

const results = []

function record(id, status, note) {
  results.push({ id, status, note })
  const icon = status === "PASSA" ? "✓" : status === "FALHA" ? "✗" : "○"
  console.log(`${icon} [${status}] ${id}: ${note}`)
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description || err.message || `Login falhou (${res.status})`)
  }
  return res.json()
}

async function apiGet(path, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

async function main() {
  console.log("\n=== MediConnect — Verificação do roteiro (API) ===\n")
  console.log(`Ambiente: ${SUPABASE_URL}\n`)

  for (const [role, creds] of Object.entries(USERS)) {
    try {
      const auth = await login(creds.email, creds.password)
      record(`Login ${role}`, "PASSA", `${creds.email} autenticou (user ${auth.user?.id?.slice(0, 8)}…)`)
    } catch (err) {
      record(`Login ${role}`, "FALHA", err.message)
    }
  }

  const secAuth = await login(USERS.secretary.email, USERS.secretary.password)
  const secToken = secAuth.access_token

  const patients = await apiGet("/rest/v1/patients?select=id,full_name&limit=500", secToken)
  if (patients.ok && Array.isArray(patients.body)) {
    const count = patients.body.length
    record(
      "Lista pacientes (secretária)",
      count > 0 ? "PASSA" : "FALHA",
      `${count} pacientes retornados pela API`,
    )
    const testNames = patients.body.filter((p) =>
      /bob esponja|britney|big turtle|teste validacao|asdasd/i.test(p.full_name ?? ""),
    )
    record(
      "Dados de teste poluindo",
      testNames.length > 0 ? "FALHA" : "PASSA",
      testNames.length > 0
        ? `${testNames.length} nomes de teste na base (${testNames.slice(0, 3).map((p) => p.full_name).join(", ")}…)`
        : "Nenhum nome de teste óbvio",
    )
  } else {
    record("Lista pacientes (secretária)", "FALHA", `HTTP ${patients.status}`)
  }

  const mgrAuth = await login(USERS.manager.email, USERS.manager.password)
  const staff = await apiGet("/rest/v1/doctors?select=id,full_name&limit=500", mgrAuth.access_token)
  const secretaries = await apiGet("/rest/v1/secretaries?select=id,full_name&limit=500", mgrAuth.access_token)
  const doctorCount = Array.isArray(staff.body) ? staff.body.length : 0
  const secCount = Array.isArray(secretaries.body) ? secretaries.body.length : 0
  record(
    "Equipe carrega (gestor)",
    doctorCount > 0 ? "PASSA" : "FALHA",
    `${doctorCount} médicos, ${secCount} secretárias`,
  )

  const patAuth = await login(USERS.patient.email, USERS.patient.password)
  const patToken = patAuth.access_token
  const userId = patAuth.user?.id

  const linkedPatients = await apiGet(
    `/rest/v1/patients?email=eq.alicia@popcode.com&select=id,full_name,user_id,cpf&limit=5`,
    secToken,
  )
  const aliciaFromSec = Array.isArray(linkedPatients.body) ? linkedPatients.body[0] : null
  const patientId = aliciaFromSec?.id ?? null
  record(
    "Paciente Alicia (lookup secretária)",
    patientId ? "PASSA" : "FALHA",
    patientId
      ? `id=${patientId}, user_id=${aliciaFromSec.user_id ?? "null"}`
      : "Registro não encontrado por e-mail",
  )

  const linkedAsPatient = await apiGet(
    `/rest/v1/patients?email=eq.alicia@popcode.com&select=id,full_name,user_id&limit=5`,
    patToken,
  )
  record(
    "Paciente Alicia (RLS token paciente)",
    linkedAsPatient.ok && Array.isArray(linkedAsPatient.body) && linkedAsPatient.body.length > 0
      ? "PASSA"
      : "FALHA",
    linkedAsPatient.ok
      ? `${Array.isArray(linkedAsPatient.body) ? linkedAsPatient.body.length : 0} registro(s) visível(is) com token paciente`
      : `HTTP ${linkedAsPatient.status}`,
  )

  if (patientId) {
    const linkRpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/link_my_patient_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${patToken}`,
      },
      body: "{}",
    })
    const linkedRpcId = linkRpc.ok ? await linkRpc.json().catch(() => null) : null
    record(
      "RPC link_my_patient_record",
      linkRpc.ok && linkedRpcId ? "PASSA" : linkRpc.status === 404 ? "FALHA" : "FALHA",
      linkRpc.ok
        ? `patient_id=${linkedRpcId}`
        : `HTTP ${linkRpc.status} — aplique supabase/migrations/20260618_patient_portal_reports.sql`,
    )

    const reportsRpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_patient_reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${patToken}`,
      },
      body: "{}",
    })
    const rpcBody = reportsRpc.ok ? await reportsRpc.json().catch(() => []) : []
    const rpcCount = Array.isArray(rpcBody) ? rpcBody.length : 0
    record(
      "Laudos Alicia (RPC portal)",
      reportsRpc.ok && rpcCount > 0 ? "PASSA" : reportsRpc.status === 404 ? "FALHA" : "FALHA",
      reportsRpc.ok
        ? `${rpcCount} laudo(s) via get_my_patient_reports`
        : `HTTP ${reportsRpc.status} — migration pendente`,
    )

    const reportsSec = await apiGet(
      `/rest/v1/reports?patient_id=eq.${patientId}&select=id,status,exam&order=created_at.desc&limit=20`,
      secToken,
    )
    const allReps = Array.isArray(reportsSec.body) ? reportsSec.body : []
    const liberados = allReps.filter((r) =>
      /finalized|sent|delivered|completed/i.test(r.status ?? ""),
    )
    record(
      "Laudos Alicia (total no banco)",
      allReps.length > 0 ? "PASSA" : "FALHA",
      `${allReps.length} laudo(s) total; ${liberados.length} liberado(s)`,
    )

    const reportsPat = await apiGet(
      `/rest/v1/reports?patient_id=eq.${patientId}&select=id,status&limit=10`,
      patToken,
    )
    record(
      "Laudos Alicia (RLS token paciente)",
      reportsPat.ok ? "PASSA" : "FALHA",
      reportsPat.ok
        ? `${Array.isArray(reportsPat.body) ? reportsPat.body.length : 0} laudo(s) visível(is) para paciente`
        : `HTTP ${reportsPat.status}`,
    )
  }

  const allReports = await apiGet(
    "/rest/v1/reports?select=id,status&limit=3",
    patToken,
  )
  record(
    "RLS laudos paciente",
    allReports.ok ? "PASSA" : "FALHA",
    allReports.ok
      ? `Paciente consegue consultar laudos (amostra: ${Array.isArray(allReports.body) ? allReports.body.length : 0})`
      : `HTTP ${allReports.status}`,
  )

  const doctorAuth = await login(USERS.doctor.email, USERS.doctor.password)
  const availability = await apiGet(
    `/rest/v1/doctor_availability?select=*&limit=20`,
    doctorAuth.access_token,
  )
  const availCount = Array.isArray(availability.body) ? availability.body.length : 0
  record(
    "Disponibilidade Virginia",
    availCount > 0 ? "PASSA" : "FALHA",
    `${availCount} faixa(s) de disponibilidade`,
  )

  console.log("\n=== Resumo ===")
  const passa = results.filter((r) => r.status === "PASSA").length
  const falha = results.filter((r) => r.status === "FALHA").length
  const bloq = results.filter((r) => r.status === "BLOQUEADO").length
  console.log(`PASSA: ${passa} | FALHA: ${falha} | BLOQUEADO: ${bloq}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
