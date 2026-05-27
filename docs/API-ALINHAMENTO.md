# Alinhar código, API e banco (menos quebras)

## Se você é só front-end (sem Supabase / back-end)

Você **não precisa** publicar Edge Functions, rodar migrations nem abrir o SQL Editor.

| Você controla | Quem tem o back-end controla |
|---------------|------------------------------|
| `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` | Schema das tabelas (`patients`, etc.) |
| Código em `src/` — `select` mínimo, defaults no tipo | Deploy de `run-appointment-reminders`, CORS |
| **Não** definir `VITE_ENABLE_EDGE_AUTOMATION` (deixa desligado) | Lista de colunas reais (peça um export ou print do Table Editor) |

O app foi ajustado para **funcionar só com a API REST** que a chave anon já acessa: listagem de pacientes sem colunas “inventadas”, lembretes no navegador, sem chamar functions no loop.

Quando algo quebrar com mensagem `column … does not exist`, copie o erro e peça ao time de back-end (modelo abaixo). Enquanto isso, o front pode tentar `select=*` em fallback — não cria coluna no banco.

### Texto pronto para enviar ao back-end

```
Preciso da lista de colunas da tabela public.patients (e appointments se mudarmos agenda).
Ou um print do Supabase Table Editor.

Erro atual no front (se houver):
[cole a mensagem da tela ou do console]

Não preciso de deploy de Edge Functions por enquanto — o front roda automação local.
```

Atualize `docs/schema/patients.md` quando alguém te passar as colunas — assim o Cursor para de sugerir campos que não existem.

---

## O que causava os erros recentes

1. **`column patients.status does not exist`** — o **Agent** introduziu `select` com colunas extras num refactor de performance, **sem** seguir a API documentada. Não foi pedido pelo usuário.
2. **CORS nas Edge Functions** — o painel chamava funções não documentadas/deployadas no loop de automação; também introduzido no código, não na spec da API.

## Correções no código

- Listagem de pacientes usa só colunas confirmadas; se falhar, tenta `select=*`.
- Automação WhatsApp/lembretes no servidor fica **desligada** até você definir no `.env`:

```env
VITE_ENABLE_EDGE_AUTOMATION=true
```

(só depois de publicar as functions no Supabase e configurar CORS)

## Como evitar de novo (fluxo recomendado)

| Passo | O quê |
|-------|--------|
| 1 | Ver colunas reais no Supabase → Table Editor → `patients` |
| 2 | Atualizar `docs/schema/patients.md` se mudar o banco |
| 3 | No Cursor, a regra **mediconnect-api** aplica-se em `src/services/**` |
| 4 | Features novas: migration SQL → doc → front |
| 5 | Features grandes: Spec Kit (`docs/SPEC-KIT.md`) — `/speckit-specify` no chat do Agent |

## Skills / agentes no Cursor (não é um bot mágico)

Não existe skill pronta “sincronizar Supabase”. O que ajuda de verdade:

| Ferramenta | Uso |
|------------|-----|
| **Regra** `.cursor/rules/mediconnect-api.mdc` | O Agent lê antes de editar services/hooks |
| **Spec Kit** (`.cursor/skills/speckit-*`) | Especificar → plano → tarefas → implementar com checklist |
| **create-rule** skill | Criar mais regras (ex.: `appointments`, `financial`) |
| **Este doc + `docs/schema/`** | Fonte única de colunas permitidas |

## Próximo passo opcional

Rodar no SQL Editor do Supabase e colar o resultado em `docs/schema/patients.md`:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'patients'
ORDER BY ordinal_position;
```

Assim o time e o Agent passam a trabalhar com o schema **real** do seu projeto.
