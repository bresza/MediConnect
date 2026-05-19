export function onlyDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "")
}

export function formatCpfBR(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 11)

  if (digits.length === 0) return ""
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function formatPhoneBR(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 11)

  if (digits.length === 0) return ""
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function formatZipCodeBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)

  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/** Mascara de CEP brasileiro (00000-000). */
export function formatCepBR(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function normalizeEmail(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase()
}

/**
 * Formata um CRM no padrao "12345-UF" a partir de diferentes entradas:
 *  - "12345-SP" / "12345 SP" / "12345/SP" / "12345SP" → "12345-SP"
 *  - "12345"                                          → "12345"
 *  - "SP-12345" / "SP 12345"                          → "12345-SP"
 *  - vazio / null                                      → ""
 *
 * Aceita tambem `crmUf` opcional para juntar quando a UF vem separada.
 */
export function formatCrm(value?: string | null, crmUf?: string | null): string {
  const raw = (value ?? "").trim()
  const uf  = (crmUf ?? "").trim().toUpperCase()

  if (!raw && !uf) return ""

  if (!raw && uf) return uf
  if (raw && !uf) {
    // Pode ja conter UF embutida (ex.: "12345-SE", "SE-12345", "12345SE").
    const m1 = raw.match(/^\s*(\d{1,7})\s*[-/\s]?\s*([A-Za-z]{2})\s*$/)
    if (m1) return `${m1[1]}-${m1[2].toUpperCase()}`
    const m2 = raw.match(/^\s*([A-Za-z]{2})\s*[-/\s]?\s*(\d{1,7})\s*$/)
    if (m2) return `${m2[2]}-${m2[1].toUpperCase()}`
    const digits = raw.replace(/\D/g, "")
    return digits || raw
  }

  // Tem `raw` e `uf` separados → garante "numero-UF".
  const digits = raw.replace(/\D/g, "")
  return digits ? `${digits}-${uf}` : uf
}

/** Extrai apenas a parte numerica de um CRM (ex.: "12345-SP" → "12345"). */
export function crmDigits(value?: string | null): string {
  if (!value) return ""
  const match = value.match(/(\d+)/)
  return match ? match[1] : ""
}

/** Extrai a UF de um CRM normalizado (ex.: "12345-SP" → "SP"). */
export function crmUf(value?: string | null): string {
  if (!value) return ""
  const match = value.match(/[A-Za-z]{2}/)
  return match ? match[0].toUpperCase() : ""
}
