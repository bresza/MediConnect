/** CID-10: letra (exceto U) + 2 dígitos + subcategoria opcional (. + 1–2 dígitos). */
const CID10_PATTERN = /^[A-TV-Z]\d{2}(\.\d{1,2})?$/i

export function normalizeCid10(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidCid10(value: string): boolean {
  const normalized = normalizeCid10(value)
  if (!normalized) return true
  return CID10_PATTERN.test(normalized)
}

/** Retorna mensagem de erro ou null se válido / vazio. */
export function validateCid10(value: string): string | null {
  const normalized = normalizeCid10(value)
  if (!normalized) return null
  if (!CID10_PATTERN.test(normalized)) {
    return "CID-10 inválido. Use o formato I10, E11.9 ou R10.1."
  }
  return null
}
