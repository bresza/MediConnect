/**
 * Traduz mensagens cruas da API (PostgREST, Postgres, Supabase Auth, Edge) para PT-BR.
 */
export function translateApiError(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  const lower = t.toLowerCase()

  if (/invalid input value for enum weekday/i.test(lower)) {
    return "Dia da semana inválido na agenda médica."
  }
  if (/invalid input value for enum/i.test(lower)) {
    const m = t.match(/enum\s+([\w_]+):\s*"([^"]*)"/i)
    if (m) return `Valor inválido no campo «${m[1]}»: «${m[2]}».`
    return "Um dos valores enviados não é aceito pelo servidor."
  }
  if (/duplicate key value violates unique constraint/i.test(lower)) {
    return "Este registro já existe no sistema."
  }
  if (/violates foreign key constraint/i.test(lower)) {
    return "Não foi possível salvar: há um vínculo obrigatório faltando ou inválido."
  }
  if (/violates check constraint/i.test(lower)) {
    return "Os dados não passaram na validação do servidor."
  }
  if (/column .+ does not exist/i.test(lower)) {
    return "O servidor não reconhece um dos campos enviados."
  }
  if (/jwt expired|token is expired|invalid jwt/i.test(lower)) {
    return "Sessão expirada. Faça login novamente."
  }
  if (/permission denied|row-level security|insufficient privilege/i.test(lower)) {
    return "Você não tem permissão para esta operação."
  }
  if (/user already registered|already registered|user_already_exists/.test(lower)) {
    return "Este e-mail já possui cadastro."
  }
  if (/invalid login credentials|invalid_grant|invalid.*credential|wrong password/i.test(lower)) {
    return "E-mail ou senha inválidos."
  }
  if (/email not confirmed|confirm your email/i.test(lower)) {
    return "Sua conta ainda não foi confirmada. Verifique seu e-mail e clique no link de confirmação."
  }
  if (/signups not allowed|signup disabled/i.test(lower)) {
    return "Cadastro pelo site está indisponível. Fale com a recepção da clínica."
  }
  if (/password should be at least|weak password|password is too weak/i.test(lower)) {
    return "A senha não atende aos requisitos de segurança (mínimo 6 caracteres)."
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(lower)) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente."
  }
  if (/authentication required|not authenticated|must be authenticated/i.test(lower)) {
    return "É necessário estar autenticado para realizar esta ação."
  }
  if (/forbidden|not authorized|insufficient permissions/i.test(lower)) {
    return "Você não tem permissão para realizar esta ação."
  }
  if (/network|failed to fetch|cors/i.test(lower)) {
    return "Não foi possível alcançar a API. Verifique sua rede ou tente mais tarde."
  }

  return t
}
