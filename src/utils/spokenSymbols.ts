/** Converte palavras ditas em símbolos (ex.: arroba → @, ponto → .). */
function applySpokenSymbolWords(text: string): string {
  let result = text

  const multiWord: [RegExp, string][] = [
    [/\bjogo da velha\b/gi, "#"],
    [/\btraço baixo\b|\btraco baixo\b/gi, "_"],
    [/\be comercial\b/gi, "&"],
    [/\bpor cento\b/gi, "%"],
    [/\bdois pontos\b/gi, ":"],
    [/\bponto e virgula\b|\bponto e vírgula\b/gi, ";"],
  ]
  for (const [pattern, symbol] of multiWord) {
    result = result.replace(pattern, symbol)
  }

  const singleWord: [RegExp, string][] = [
    [/\barrobas?\b/gi, "@"],
    [/\bcerquilha\b|\bhashtag\b/gi, "#"],
    [/\basterisco\b|\bestrela\b/gi, "*"],
    [/\bunderline\b|\bsublinhado\b/gi, "_"],
    [/\bh[ií]fen\b|\bmenos\b/gi, "-"],
    [/\btraço\b|\btraco\b/gi, "-"],
    [/\bbarra\b/gi, "/"],
    [/\bmais\b/gi, "+"],
    [/\bponto\b/gi, "."],
    [/\bv[ií]rgula\b/gi, ","],
  ]
  for (const [pattern, symbol] of singleWord) {
    result = result.replace(pattern, symbol)
  }

  return result
}

function compactCredentialSpacing(text: string): string {
  return text
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s+/g, "")
    .replace(/@+/g, "@")
    .replace(/\.{2,}/g, ".")
}

/** Normaliza e-mail dictado: "joao arroba gmail ponto com" → joao@gmail.com */
export function normalizeSpokenEmail(spoken: string): string {
  const text = compactCredentialSpacing(applySpokenSymbolWords(spoken.trim()))
  if (!text) return ""

  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (match) return match[0].toLowerCase()

  if (text.includes("@")) return text.toLowerCase()
  return text.toLowerCase()
}

/** Normaliza senha dictada com símbolos falados. */
export function normalizeSpokenPassword(spoken: string): string {
  return compactCredentialSpacing(applySpokenSymbolWords(spoken.trim()))
}
