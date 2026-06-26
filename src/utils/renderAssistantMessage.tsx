import type { ReactNode } from "react"

/**
 * Renderiza respostas do assistente sem truncar em markdown incompleto.
 * Só aplica negrito/itálico em pares fechados (**…** / *…*); marcadores soltos ficam como texto.
 */
export function renderAssistantMessage(text: string): ReactNode {
  if (!text) return null

  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length === 1 ? nodes[0] : nodes
}
