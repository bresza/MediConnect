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

  if (/row-level security|row level security|violates row-level security/i.test(text)) {
    if (/appointments?/i.test(text)) {
      return (
        "Não foi possível agendar a consulta. Seu cadastro ainda não tem permissão para criar " +
        "agendamentos. Peça à recepção para vincular seu acesso."
      )
    }
    if (/patients?/i.test(text)) {
      return (
        "Não foi possível acessar o cadastro de paciente. Peça à recepção para vincular " +
        "seu acesso ao cadastro."
      )
    }
    if (/reports?/i.test(text)) {
      return "Você não tem permissão para acessar estes laudos."
    }
    return "Você não tem permissão para realizar esta ação. Peça ajuda à recepção se o problema persistir."
  }

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
  if (/JWT expired|jwt expired|token is expired/i.test(text)) {
    return "Sessão expirada. Faça login novamente."
  }
  if (/invalid input syntax|invalid.*format/i.test(text)) {
    return "Dados em formato inválido. Verifique os campos e tente novamente."
  }
  if (/permission denied|insufficient privilege/i.test(text)) {
    return "Você não tem permissão para realizar esta ação."
  }
  if (/could not connect|connection refused|network/i.test(text)) {
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
  }
  return null
}

function looksTechnical(raw: string): boolean {
  const text = raw.trim()
  if (!text) return false
  if (sanitizeDatabaseMessage(text)) return true
  return /^(ERROR:|duplicate key|violates .* constraint|row-level security|row level security|23505|23503|42501|PGRST)/i.test(text)
}

/** Converte mensagem de erro (API ou Error) para texto amigável em pt-BR. */
export function humanizeErrorMessage(raw: string, fallback = "Ocorreu um erro. Tente novamente."): string {
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  const sanitized = sanitizeDatabaseMessage(trimmed)
  if (sanitized) return sanitized
  if (looksTechnical(trimmed)) return fallback
  return trimmed
}

/** Extrai e traduz mensagem de qualquer erro lançado pela aplicação. */
export function humanizeError(err: unknown, fallback?: string): string {
  if (err instanceof Error) return humanizeErrorMessage(err.message, fallback)
  if (typeof err === "string") return humanizeErrorMessage(err, fallback)
  return fallback ?? "Ocorreu um erro. Tente novamente."
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
    const friendly = sanitizeDatabaseMessage(raw)
    if (friendly) return friendly
    if (raw && !looksTechnical(raw)) return validationSummary || raw
    return "Você não tem permissão para realizar esta ação."
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
