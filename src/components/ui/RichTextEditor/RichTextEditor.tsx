// ─────────────────────────────────────────────────────────────────
// Editor de texto rico usado nos laudos (campo "Conteúdo do laudo").
// Wrapper fino em torno do BlockNote (@blocknote/react + mantine).
//
// Compatibilidade com dados legados:
//   - O banco guarda `content_html` como string, mas laudos antigos
//     foram digitados em <textarea> e estão em TEXTO PURO. O editor
//     detecta isso (não inicia com `<`) e converte cada linha em
//     parágrafo BlockNote.
//   - Ao mudar o conteúdo, exportamos HTML para manter o contrato
//     atual (campo `content_html`/`contentHtml`).
//
// Dark mode é refletido automaticamente lendo a classe `.dark` no
// <html> — mesmo padrão usado pelo App.tsx.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import type { PartialBlock } from "@blocknote/core"
import { pt as ptDictionary } from "@blocknote/core/locales"
import "@blocknote/core/fonts/inter.css"
import "@blocknote/mantine/style.css"
import styles from "./RichTextEditor.module.css"

interface RichTextEditorProps {
  value:      string
  onChange:   (html: string) => void
  placeholder?: string
  /** Quando true, mostra apenas leitura (útil em visualização de laudos finalizados). */
  readOnly?:  boolean
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(value)
}

function textToInitialBlocks(plain: string): PartialBlock[] {
  const lines = plain.split(/\r?\n/)
  const blocks: PartialBlock[] = lines.map((line) => ({
    type: "paragraph",
    content: line.length > 0 ? line : undefined,
  } as PartialBlock))
  if (blocks.length === 0) blocks.push({ type: "paragraph" } as PartialBlock)
  return blocks
}

function useDocumentDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )
  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setDark(root.classList.contains("dark"))
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export function RichTextEditor({ value, onChange, placeholder, readOnly }: RichTextEditorProps) {
  const dark = useDocumentDarkMode()
  // Memo do conteúdo TEXTO PURO inicial (usado quando o valor legado não é HTML).
  const initialPlainBlocks = useMemo<PartialBlock[] | undefined>(() => {
    if (!value)               return undefined
    if (looksLikeHtml(value)) return undefined // será carregado via parse async no effect abaixo
    return textToInitialBlocks(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editor = useCreateBlockNote({
    initialContent: initialPlainBlocks,
    dictionary:     ptDictionary,
  })

  // Última versão emitida pelo próprio editor — usada para ignorar
  // mudanças de `value` que vieram do próprio onChange (evita loop).
  const lastEmittedRef = useRef<string | null>(null)

  // Sincroniza o conteúdo do editor com mudanças externas de `value`
  // (template, IA, edição de outro laudo). Ignora se a mudança veio
  // do próprio editor (lastEmittedRef).
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    if (!value) {
      editor.replaceBlocks(editor.document, [{ type: "paragraph" } as PartialBlock])
      return
    }
    let active = true
    const apply = (blocks: PartialBlock[]) => {
      if (!active || blocks.length === 0) return
      editor.replaceBlocks(editor.document, blocks)
    }
    if (looksLikeHtml(value)) {
      const result = editor.tryParseHTMLToBlocks(value) as
        | PartialBlock[]
        | Promise<PartialBlock[]>
      if (Array.isArray(result)) apply(result)
      else void result.then(apply).catch(() => { /* mantem conteudo atual */ })
    } else {
      apply(textToInitialBlocks(value))
    }
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Exporta HTML a cada mudança do usuário.
  function handleChange() {
    if (readOnly) return
    try {
      const result = editor.blocksToHTMLLossy(editor.document) as string | Promise<string>
      const emit = (html: string) => {
        lastEmittedRef.current = html
        onChange(html)
      }
      if (typeof result === "string") {
        emit(result)
        return
      }
      void result.then(emit).catch(() => { /* mantem valor anterior */ })
    } catch {
      // mantém o último valor válido em caso de falha no serializer
    }
  }

  return (
    <div className={styles.shell} data-theme={dark ? "dark" : "light"}>
      <BlockNoteView
        editor={editor}
        theme={dark ? "dark" : "light"}
        onChange={handleChange}
        editable={!readOnly}
        slashMenu
        sideMenu
        formattingToolbar
        linkToolbar
        tableHandles
        data-placeholder={placeholder}
      />
    </div>
  )
}

export default RichTextEditor
