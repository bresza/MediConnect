/** Problem Details (RFC 7807) e variantes usadas pela API RiseUP. */
export interface ProblemDetails {
  type?:     string
  title?:    string
  status?:   number
  detail?:   string
  instance?: string
  code?:     string
  errors?:   Record<string, string[] | string> | string[]
  error?:    string
  message?:  string
}

export function parseProblemDetails(raw: string): ProblemDetails {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ProblemDetails
  } catch {
    return {}
  }
}

/** Extrai slug do `type` (ex.: .../validation-error → validation-error). */
export function problemTypeSlug(type?: string): string {
  if (!type) return ""
  const trimmed = type.trim()
  const last = trimmed.includes("/") ? trimmed.split("/").pop()! : trimmed
  return last.toLowerCase()
}

/** Mensagens cruas de Postgres/PostgREST que nunca devem ir para a UI. */
export function sanitizeDatabaseMessage(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  if (
    /uniq_appointments_active_slot/i.test(text) ||
    (/duplicate key value violates unique constraint/i.test(text) && /appointment/i.test(text))
  ) {
    return "Este horário já está ocupado para este médico. Escolha outro horário."
  }
  if (/cpf.*já está cadastrado|cpf.*already registered/i.test(text)) {
    return text.includes("CPF") ? text : "Este CPF já está cadastrado."
  }
  if (/crm.*já|crm.*duplicat|duplicate.*crm/i.test(text)) {
    return "Este CRM já está cadastrado para esta UF."
  }
  if (/duplicate key value violates unique constraint/i.test(text)) {
    return "Registro duplicado. Verifique os dados e tente novamente."
  }
  if (/^duplicate key|^violates .* constraint|^ERROR:\s+/i.test(text)) {
    return "Não foi possível salvar. Verifique os dados e tente novamente."
  }
  return null
}

function looksTechnical(raw: string): boolean {
  return /^(ERROR:|duplicate key|violates .* constraint|23505|23503)/i.test(raw.trim())
}

export function summarizeProblemErrors(errors: ProblemDetails["errors"]): string {
  if (!errors) return ""
  if (Array.isArray(errors)) return errors.filter(Boolean).join(" ")
  return Object.entries(errors)
    .map(([field, val]) => {
      const text = Array.isArray(val) ? val.join(", ") : val
      return text ? `${field}: ${text}` : ""
    })
    .filter(Boolean)
    .join(" | ")
}

function normalizeProblemCode(p: ProblemDetails): string {
  const fromCode = (p.code ?? "").trim()
  if (fromCode) return fromCode.toUpperCase().replace(/-/g, "_")

  const slug = problemTypeSlug(p.type)
  if (!slug) return ""
  return slug.toUpperCase().replace(/-/g, "_")
}

export function messageFromProblemDetails(status: number, p: ProblemDetails): string {
  const code = normalizeProblemCode(p)
  const raw = (p.detail ?? p.title ?? p.error ?? p.message ?? "").trim()
  const validationSummary = summarizeProblemErrors(p.errors)

  const sanitizedDb = sanitizeDatabaseMessage(raw)
  if (sanitizedDb) return sanitizedDb

  if (
    code === "INVALID_CPF" ||
    /cpf.*inv[aá]lid|invalid.*cpf/i.test(raw) ||
    /cpf/i.test(validationSummary)
  ) {
    return validationSummary || raw || "CPF inválido. Confira os números e os dígitos verificadores."
  }
  if (code === "CPF_EXISTS") {
    return raw || "Este CPF já está cadastrado."
  }
  if (code === "CRM_EXISTS") {
    return raw || "Este CRM já está cadastrado para esta UF."
  }
  if (code === "EMAIL_EXISTS") {
    return raw || "Este e-mail já está em uso."
  }
  if (code === "VALIDATION_ERROR" || status === 400) {
    return validationSummary || raw || "Dados inválidos. Verifique os campos e tente novamente."
  }
  if (code === "AUTHENTICATION_REQUIRED" || status === 401) {
    return raw || "Sessão expirada. Saia, entre novamente e tente de novo."
  }
  if (code === "INSUFFICIENT_PERMISSIONS" || status === 403) {
    return raw || "Você não tem permissão para realizar esta ação."
  }
  if (code === "RATE_LIMIT_EXCEEDED" || status === 429) {
    return raw || "Muitas tentativas. Aguarde alguns minutos e tente novamente."
  }
  if (
    code === "USER_CREATION_FAILED" ||
    code === "PROFILE_CREATION_FAILED" ||
    code === "ROLE_ASSIGNMENT_FAILED" ||
    code === "DOCTOR_CREATION_FAILED" ||
    code === "MANAGER_CREATION_FAILED" ||
    code === "SECRETARY_CREATION_FAILED" ||
    code === "PATIENT_CREATION_FAILED" ||
    status >= 500
  ) {
    if (raw && !looksTechnical(raw)) {
      return validationSummary || raw
    }
    return validationSummary || "Erro interno ao processar o cadastro. Tente novamente em instantes."
  }

  return validationSummary || raw || ""
}
