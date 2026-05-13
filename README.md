# MediConnect

Sistema web React/Vite para gestão clínica com autenticação e persistência via Supabase.

## Requisitos

- Node.js 20+
- Projeto Supabase com Auth, REST e Edge Functions habilitados
- Variáveis de ambiente preenchidas em `.env`

## Configuração

Crie um `.env` baseado em `.env.example`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon

# Assistente de IA (escolha um ou mais providers — ver secao abaixo)
VITE_AI_PROVIDER=auto
# VITE_GROQ_API_KEY=gsk_...
# VITE_GEMINI_API_KEY=...
# VITE_OPENAI_API_KEY=sk-...

# Defaults de UI (opcionais; usados por OpenAI direto e proxy)
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600
```

## Assistente de IA

O widget de IA (`src/components/ui/AIAssistant`) fica disponivel em todas as telas autenticadas. A logica de providers esta em [`src/services/ai.ts`](./src/services/ai.ts); o contexto com dados reais da sessao (pacientes, agenda, receitas) e montado em [`src/services/aiContext.ts`](./src/services/aiContext.ts) e injetado no system prompt — a IA nao faz fetch extra a API; ela usa o mesmo snapshot que o usuario ve nas telas.

O botao **Completar com IA** em laudos (`src/pages/Reports/Reports.tsx`) reutiliza o mesmo `chatComplete()`.

### Providers suportados

| Modo | Variavel(is) | Onde roda | Chave no bundle? | Login do usuario final? |
| ---- | ------------ | --------- | ---------------- | ------------------------ |
| **Groq** | `VITE_GROQ_API_KEY` | Browser → `api.groq.com` | Sim | Nao |
| **Gemini** | `VITE_GEMINI_API_KEY` | Browser → Generative Language API | Sim | Nao |
| **OpenAI direto** | `VITE_OPENAI_API_KEY` | Browser → `api.openai.com` | Sim | Nao |
| **Proxy** | Supabase + Edge Function `ai-chat` | Servidor Supabase | Nao | Nao |
| **Puter.js** | `VITE_PUTER_AI_ENABLED=true` + `VITE_AI_PROVIDER=puter` | Browser → `js.puter.com` | Nao (sem chave sua) | **Sim** — popup puter.com |

### Selecao automatica (`VITE_AI_PROVIDER=auto`)

Com `auto` (padrao), o app usa o **primeiro provider configurado**, nesta ordem:

1. Groq (`VITE_GROQ_API_KEY`)
2. Gemini (`VITE_GEMINI_API_KEY`)
3. OpenAI direto (`VITE_OPENAI_API_KEY`)
4. Proxy (Supabase URL + anon key, sem chaves de LLM no front)
5. Puter — **somente** se `VITE_PUTER_AI_ENABLED=true` (nao entra sozinho em `auto` para evitar popup de login)

Para forcar um modo: `VITE_AI_PROVIDER=groq|gemini|direct|proxy|puter`.

O cabecalho do assistente mostra o modo e o modelo ativos (ex.: `Modo medico · llama-3.3-70b-versatile`).

### 1) Groq (recomendado sem back-end)

Chamada direta do browser para `https://api.groq.com/openai/v1/chat/completions` (API compativel com OpenAI). Tier free generoso, sem cartao de credito na criacao da chave.

```env
VITE_GROQ_API_KEY=gsk_sua-chave
VITE_GROQ_MODEL=llama-3.3-70b-versatile
```

Crie a chave em [console.groq.com/keys](https://console.groq.com/keys). Se um modelo for descontinuado, o cliente tenta fallbacks automaticos (`llama-3.1-8b-instant`, etc.).

**Aviso:** a chave fica no bundle do front. Em producao, restrinja uso/cota e considere um proxy no servidor.

### 2) Gemini (Google AI Studio)

Chamada direta para `generativelanguage.googleapis.com/v1beta/.../generateContent`.

```env
VITE_GEMINI_API_KEY=sua-chave
VITE_GEMINI_MODEL=gemini-2.0-flash
```

Chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey). O tier free **depende do projeto Google**; alguns projetos retornam `limit: 0` para certos modelos (sem free tier). Nesse caso o cliente tenta outros modelos da lista interna ou use Groq/proxy.

Restrinja a chave por HTTP referrer no Google Cloud quando possivel.

### 3) OpenAI direto

Se `VITE_OPENAI_API_KEY` estiver definida, o front chama `https://api.openai.com/v1/chat/completions` sem Edge Function. **A chave fica visivel no bundle** — use em demo/squad ou com chave restrita por dominio e cota baixa. O painel exibe aviso quando esse modo esta ativo.

```env
VITE_OPENAI_API_KEY=sk-sua-chave
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600
```

### 4) Proxy via Supabase (recomendado em producao)

Chama a Edge Function [`supabase/functions/ai-chat`](./supabase/functions/ai-chat/README.md), que guarda a chave da OpenAI como **secret** do projeto. A chave nao aparece no bundle.

Para este modo, deixe `VITE_GROQ_API_KEY`, `VITE_GEMINI_API_KEY` e `VITE_OPENAI_API_KEY` vazias (ou use `VITE_AI_PROVIDER=proxy`).

Setup (uma vez):

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set OPENAI_API_KEY=sk-sua-chave-aqui
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://app.suaclinica.com
supabase functions deploy ai-chat --no-verify-jwt
```

O flag `--no-verify-jwt` e necessario porque a funcao valida o JWT manualmente e precisa responder ao preflight CORS do browser. Sem deploy correto, o front recebe erro de CORS/rede.

### 5) Puter.js (apenas opt-in / demos)

Carrega `https://js.puter.com/v2/` sob demanda. Nao exige chave sua, mas **abre login em puter.com para o usuario final** — inadequado para medicos/pacientes em producao.

```env
VITE_AI_PROVIDER=puter
VITE_PUTER_AI_ENABLED=true
VITE_PUTER_AI_MODEL=gpt-4o-mini
```

### Privacidade e contexto

O assistente recebe um resumo textual dos dados ja carregados na sessao (CPF mascarado, limites de itens). Esse texto e enviado ao provider LLM escolhido. Em ambiente real, alinhe com politica de privacidade/LGPD antes de enviar dados clinicos a APIs externas.

## Endpoints consumidos pelo frontend

### Autenticacao nativa (sempre disponivel no Supabase)

- `POST /auth/v1/token?grant_type=password` — login
- `POST /auth/v1/token?grant_type=refresh_token` — refresh de sessao
- `POST /auth/v1/recover` — reset de senha (fallback nativo)

### Tabelas via PostgREST `/rest/v1/*`

- `patients`, `appointments`, `doctors`, `profiles`, `user_roles`,
  `reports` (laudos, prontuarios, receitas e lancamentos financeiros
  usam essa tabela com `exam` distinto), `doctor_availability`,
  `doctor_exceptions`.

Cada tabela depende das policies de **RLS** do projeto. O frontend trata
respostas `403`/`401` sem derrubar a sessao em chamadas de Edge Function;
em `/rest/v1/*` um `401` aciona refresh + retry e, em ultimo caso, logout.

### Edge Functions

| Funcao                         | Obrigatoria? | Fallback no frontend                          |
| ------------------------------ | :----------: | --------------------------------------------- |
| `create-user-with-password`    | **Sim**      | nenhum — usada para criar staff e pacientes   |
| `delete-user`                  | **Sim**      | nenhum — auth.users nao e acessivel via REST  |
| `ai-chat`                      | Nao          | proxy OpenAI; alternativas: Groq/Gemini no front |
| `user-info`                    | Nao          | leitura direta em `profiles`/`patients`/`doctors` |
| `register-patient`             | Nao          | cai em `create-user-with-password`            |
| `request-password-reset`       | Nao          | cai em `/auth/v1/recover`                     |
| `create-doctor`                | Nao          | PATCH em `/rest/v1/doctors` apos criar o user |
| `create-patient`               | Nao          | insert direto em `/rest/v1/patients`          |
| `get-available-slots`          | Nao          | calculo de slots no cliente                   |
| `send-sms`                     | Nao          | mensagem de erro tratada                      |

Para o assistente IA, veja a secao **Assistente de IA** (Groq, Gemini, OpenAI direto, proxy `ai-chat` ou Puter). Para as demais,
basta publicar com `supabase functions deploy <nome>` (o flag
`--no-verify-jwt` so e necessario quando a propria funcao faz a
validacao do JWT manualmente, como acontece em `ai-chat`).

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Contrato De Dados

O app usa IDs de banco como `string` para pacientes, equipe, agenda, prontuários, receitas e financeiro. Campos enviados ao Supabase seguem `snake_case`; o frontend converte para os modelos em `camelCase` nos arquivos em `src/services`.

Principais tabelas esperadas:

- `patients`: cadastro do paciente, incluindo `full_name`, `cpf`, `phone_mobile`, `birth_date`, `gender`, `status`, `address` e preferências de contato.
- `appointments`: agenda com `patient_id`, `doctor_id`, `scheduled_at`, `duration_minutes`, `status` e `notes`.
- `medical_records`: prontuários com `patient_id`, `doctor_id`, `record_date`, `chief_complaint`, histórico clínico, sinais vitais em `vital_signs`, diagnóstico e conduta.
- `prescriptions`: receitas com `patient_id`, `doctor_id`, `issued_at`, `prescription_type`, `medications` em JSON e status.
- `financial_records`: lançamentos financeiros com `patient_id`, `patient_name`, `value`, `discount`, `payment_method`, `due_date` e `status`.
- `reports`: laudos com `patient_id`, `exam`, `diagnosis`, `conclusion`, `content_html`, `cid_code` e `status`.
- `doctors` e `profiles`: equipe e nomes exibidos na agenda/prontuários.

## Observações

O diretório `backend/` não é usado pelo frontend atual. A integração ativa é feita pelos serviços em `src/services/*` usando Supabase REST e Edge Functions.
