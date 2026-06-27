# Guia de Implantação do MediConnect

## 1. Visão Geral

Este documento descreve como configurar, publicar e manter o MediConnect — sistema web React/Vite para gestão clínica com autenticação e persistência via Supabase. Cobre ambiente local, deploy na Vercel (frontend), deploy no Supabase (backend e IA) e práticas recomendadas para produção.

Documentação complementar:

- [Integração de IA](./INTEGRACAO_IA.md) — arquitetura multi-provider, roteamento e providers
- [Engenharia de Prompt](./ENGENHARIA_PROMPT.md) — system prompts, contexto dinâmico e LGPD no prompt

### 1.1 Arquitetura de Deploy

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO (Browser)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│   Vercel            │               │   Supabase          │
│   React SPA         │               │   Auth + REST + RLS │
│   /api/gemini       │               │   Edge Functions    │
└─────────┬───────────┘               └─────────┬───────────┘
          │                                     │
          ▼                                     ▼
   Google Gemini API                    OpenAI Chat Completions
   (GEMINI_API_KEY)                     (OPENAI_API_KEY secret)
```

**Produção recomendada:** frontend na Vercel + IA via proxy Supabase (`VITE_AI_PROVIDER=proxy`), com a chave OpenAI guardada exclusivamente como secret do projeto.

### 1.2 Requisitos

| Componente | Versão mínima | Observação |
|------------|---------------|------------|
| Node.js | 20+ | Build Vite e scripts npm |
| npm | 10+ | Gerenciador de pacotes |
| Supabase CLI | 2.x | Deploy de Edge Functions e secrets |
| Conta Vercel | — | Hospedagem do frontend |
| Projeto Supabase | — | Auth, REST e Edge Functions habilitados |

---

## 2. Configuração Local

### 2.1 Instalação

```bash
git clone https://github.com/seu-usuario/MediConnect.git
cd MediConnect
npm install
```

### 2.2 Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Assistente de IA — modo automático: Groq → Gemini → OpenAI → Proxy
VITE_AI_PROVIDER=auto

# Groq (recomendado para dev; chave fica no bundle)
VITE_GROQ_API_KEY=gsk_...
VITE_GROQ_MODEL=llama-3.3-70b-versatile

# Gemini via proxy seguro (chave no servidor)
# VITE_GEMINI_ENABLED=true
# VITE_GEMINI_MODEL=gemini-2.0-flash
# GEMINI_API_KEY=AIza...

# OpenAI direto (⚠️ chave exposta no bundle)
# VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600
```

> **Nota:** variáveis `VITE_*` entram no bundle em tempo de build. Secrets como `GEMINI_API_KEY` e `OPENAI_API_KEY` devem ficar **sem** o prefixo `VITE_`.

### 2.3 Executar em desenvolvimento

```bash
npm run dev          # porta 5173 — Groq e OpenAI direto funcionam
npm run dev:vercel   # expõe /api/gemini (modo Gemini com GEMINI_API_KEY no .env)
```

**Verificação:**

1. Acesse `http://localhost:5173` e faça login
2. Abra o assistente de IA — o cabeçalho mostra provider e modelo ativos
3. Rode `npm run lint`, `npm run test` e `npm run build`

### 2.4 Arquivos relevantes

| Arquivo | Função |
|---------|--------|
| `src/services/ai.ts` | Orquestração de providers e fallbacks |
| `src/services/aiContext.ts` | Snapshot de contexto com mascaramento LGPD |
| `api/gemini.ts` | Proxy Gemini na Vercel Edge |
| `supabase/functions/ai-chat/index.ts` | Proxy OpenAI no Supabase |
| `vercel.json` | Build Vite e rewrites SPA |
| `supabase/config.toml` | `verify_jwt = false` para `ai-chat` |

---

## 3. Deploy na Vercel

### 3.1 Características

- **Framework**: Vite + React (SPA)
- **Build**: `npm run build` → pasta `dist/`
- **Roteamento**: rewrite em `vercel.json` para suportar refresh em rotas internas
- **Edge Function**: `api/gemini.ts` roda em Edge Runtime quando o modo Gemini está ativo

### 3.2 Configuração

Conecte o repositório à Vercel e defina as variáveis em **Settings → Environment Variables**:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AI_PROVIDER=proxy

# Se usar Gemini via Vercel (alternativa ao proxy Supabase)
# VITE_GEMINI_ENABLED=true
# VITE_GEMINI_MODEL=gemini-2.0-flash
# GEMINI_API_KEY=AIza...   # server-side, sem VITE_
```

> Variáveis `VITE_*` são lidas em **tempo de build**. Após alterá-las, dispare um novo deploy.

**Deploy via CLI:**

```bash
npm i -g vercel
vercel login
vercel link
vercel --prod
```

### 3.3 Proxy Gemini (`api/gemini.ts`)

O frontend chama `POST /api/gemini`. A função lê `GEMINI_API_KEY` do servidor e encaminha para a API do Google — a chave nunca vai para o bundle.

```
Browser → POST /api/gemini → Vercel Edge → generativelanguage.googleapis.com
```

Implementação: [`api/gemini.ts`](../api/gemini.ts). Consumo: `chatCompleteGemini` em [`src/services/ai.ts`](../src/services/ai.ts).

**Casos de uso ideais:**

- Produção com Gemini sem expor chave no browser
- Ambientes que já usam billing Google Cloud

---

## 4. Deploy no Supabase

### 4.1 Características

- **Auth + PostgREST**: login, refresh e acesso às tabelas via RLS
- **Edge Functions**: lógica server-side (criação de usuários, proxy de IA)
- **Secrets**: chaves de LLM ficam no servidor, não no frontend

### 4.2 Configuração inicial

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Migrations em `supabase/migrations/`:

- `20260519_appointments_rls.sql` — políticas RLS de agendamentos
- `20260519_appointments_patient_booking.sql` — reserva pelo paciente
- `20260519_freed_slots_and_waitlist.sql` — slots liberados e fila de espera

### 4.3 Edge Function `ai-chat` (produção recomendada)

**Configuração:**

```bash
supabase secrets set OPENAI_API_KEY=sk-sua-chave-openai
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://seu-app.vercel.app
supabase functions deploy ai-chat --no-verify-jwt
```

**Por que `--no-verify-jwt`?** O preflight CORS (`OPTIONS`) não envia `Authorization`. Com `verify_jwt = true` no gateway, o preflight falha e o browser reporta erro de CORS. A função valida o Bearer JWT manualmente no código ([`ai-chat/index.ts`](../supabase/functions/ai-chat/index.ts)); o `supabase/config.toml` já define `verify_jwt = false`.

**CORS (`AI_CHAT_ALLOWED_ORIGIN`):**

| Valor | Comportamento |
|-------|---------------|
| Não definida | Aceita qualquer origem; em dev, `localhost:5173` já é liberado |
| `*` | Aceita qualquer origem |
| Lista separada por vírgula | Apenas origens listadas |

**Modo proxy no frontend:**

```env
VITE_AI_PROVIDER=proxy
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Deixe `VITE_GROQ_API_KEY`, `VITE_GEMINI_ENABLED` e `VITE_OPENAI_API_KEY` vazios (ou omitidos).

**Casos de uso ideais:**

- **Produção** (recomendado)
- Compliance com LGPD — chave OpenAI nunca no bundle
- Ambientes multi-tenant

### 4.4 Outras Edge Functions

| Função | Obrigatória | Observação |
|--------|:-----------:|------------|
| `create-user-with-password` | Sim | Criação de staff e pacientes |
| `delete-user` | Sim | Remoção em `auth.users` |
| `ai-chat` | Não | Proxy de IA; alternativas no front |
| Demais | Não | Deploy sob demanda |

---

## 5. CI/CD

O repositório ainda não inclui workflow GitHub Actions. A pipeline abaixo segue os scripts de `package.json` e a arquitetura Vercel + Supabase.

### 5.1 Integração contínua (CI)

Disparo sugerido: push e pull request para `main`.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: placeholder-key-for-ci-build
```

| Etapa | Comando | Objetivo |
|-------|---------|----------|
| Lint | `npm run lint` | Padrões ESLint |
| Testes | `npm run test` | Vitest em `src/**/*.test.ts` |
| Build | `npm run build` | Valida TypeScript e build Vite |

### 5.2 Entrega contínua (CD)

| Ambiente | Trigger | Destino |
|----------|---------|---------|
| Preview | PR aberto | URL de preview da Vercel |
| Staging | merge em `develop` | Vercel + Supabase staging |
| Production | merge em `main` ou tag `v*` | Vercel Production |

Deploy das Edge Functions (opcional em CI):

```bash
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase functions deploy ai-chat --no-verify-jwt
```

**Boas práticas:**

- Nunca commitar `.env` ou chaves de API
- `VITE_*` e `GEMINI_API_KEY` no painel da Vercel
- `OPENAI_API_KEY` e `AI_CHAT_ALLOWED_ORIGIN` como secrets do Supabase
- Rotacionar chaves após vazamento (Gemini bloqueia chaves vazadas automaticamente)

---

## 6. Troubleshooting

### 6.1 Autenticação e Supabase

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Login chama `undefined/auth/v1/token` | `VITE_SUPABASE_URL` ausente no build | Definir no Vercel e redeploy |
| 401 após login | Token expirado ou RLS restritivo | Logout/login; revisar policies |
| `[mediconnect] Configuracao do Supabase ausente` | Build sem env vars | Ver [`src/services/api.ts`](../src/services/api.ts) |

### 6.2 Assistente de IA

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| "Assistente indisponivel" | Nenhum provider configurado | Verificar `.env`; ver `getAIMode()` em [`ai.ts`](../src/services/ai.ts) |
| Erro CORS em `ai-chat` | Preflight bloqueado | Redeploy com `--no-verify-jwt`; configurar `AI_CHAT_ALLOWED_ORIGIN` |
| "Edge Function ai-chat nao encontrada" | Função não deployada | `supabase functions deploy ai-chat --no-verify-jwt` |
| "Sua sessao expirou" | JWT inválido | Refazer login |
| Gemini 500 "Configuração de IA ausente" | `GEMINI_API_KEY` ausente no Vercel | Adicionar como secret server-side |
| Groq/Gemini 429 | Rate limit ou cota | Aguardar; fallbacks automáticos tentam outros modelos |

### 6.3 Build e contexto

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Rotas 404 após refresh | Rewrite SPA ausente | Confirmar `vercel.json` |
| `/api/gemini` 404 em dev | Proxy não ativo | Usar `npm run dev:vercel` |
| Assistente com dados desatualizados | Snapshot estático da sessão | Botão **Atualizar** na tela; reabrir assistente |

O snapshot é montado em [`aiContext.ts`](../src/services/aiContext.ts) a partir dos dados já carregados — não há re-fetch automático durante a conversa.

---

## 7. Métricas de Desempenho e Custos

Valores derivados de [`ai.ts`](../src/services/ai.ts) e [`aiContext.ts`](../src/services/aiContext.ts).

### 7.1 Latência

| Provider | Latência média | Observação |
|----------|:--------------:|------------|
| Groq | **< 500 ms** | Ideal para desenvolvimento |
| OpenAI via proxy | **600–1000 ms** | Referência de qualidade |
| Gemini via Vercel | **800–1500 ms** | Fallback automático de modelos |
| Proxy Supabase → OpenAI | **700–1200 ms** | Inclui latência da Edge Function |

Timeout REST da aplicação: **15 s** (`REQUEST_TIMEOUT_MS` em [`api.ts`](../src/services/api.ts)).

### 7.2 Consumo de tokens

| Componente | Tokens estimados | Controle no código |
|------------|:----------------:|--------------------|
| System prompt | 400–800 | `buildSystemPrompt()` |
| Snapshot de contexto | 1500–2500 | `MAX_SNAPSHOT_CHARS = 7500` |
| Resposta | até 600 | `DEFAULT_MAX_TOKENS = 600` |
| **Total típico por turno** | **2500–3900** | — |

Limites por categoria: `MAX_PATIENTS=20`, `MAX_APPOINTMENTS=14`, `MAX_STAFF=12`, `MAX_RX=8`.

### 7.3 Custos por provider

| Provider | Modelo padrão | Custo | Tier free |
|----------|---------------|-------|-----------|
| Groq | `llama-3.3-70b-versatile` | R$ 0 | ~30 RPM / 14.400 RPD |
| Gemini | `gemini-2.0-flash` | R$ 0* | *Requer billing Google Cloud |
| OpenAI | `gpt-4o-mini` | ~US$ 0,0009/turno† | Pago ($0,15/1M in, $0,60/1M out) |

† Estimativa com ~3500 tokens por turno.

**Exemplo mensal** (100 conversas/dia, 3 turnos, proxy OpenAI): ~31,5M tokens → **~US$ 5–8/mês**.

### 7.4 Alertas sugeridos

- Rate limit (429) > 5% das requisições
- Latência > 3s em 10% das requisições
- Taxa de erro > 1% em janela de 5 min
- Pico de fallback de modelo (modelo descontinuado ou sem free tier)

O proxy Supabase retorna `usage.prompt_tokens` e `usage.completion_tokens` em cada resposta ([`ai-chat/index.ts`](../supabase/functions/ai-chat/index.ts)).

---

## 8. Conformidade LGPD

### 8.1 Princípios aplicados

| Princípio | Implementação |
|-----------|---------------|
| **Minimização** | Snapshot limitado por `MAX_*`; truncamento em 7500 caracteres |
| **Finalidade** | Contexto usado só para respostas do assistente |
| **Segurança** | Chaves de IA no servidor; JWT obrigatório em `ai-chat` |
| **Segregação** | RLS no Supabase; financeiro só para `manager`/`financial` |
| **Anonimização** | CPF mascarado (`***.***.***-**`); telefone e endereço omitidos |

### 8.2 Dados enviados ao provider de LLM

Quando o assistente está ativo, um resumo textual montado por `buildAIApiContextFromAppState` entra no system prompt e segue para o provider escolhido (Groq, Gemini, OpenAI ou proxy).

**Incluído (conforme perfil):** nomes, status, agenda, totais financeiros agregados, receitas resumidas.

**Excluído ou mascarado:**

- CPF completo (sempre mascarado)
- Telefone, endereço, prontuário completo
- Tokens, senhas e dados de cartão/conta bancária

### 8.3 Recomendações para produção

1. Usar `VITE_AI_PROVIDER=proxy` — chave OpenAI apenas como secret Supabase
2. Configurar `AI_CHAT_ALLOWED_ORIGIN` com domínios explícitos
3. Formalizar DPA com o provedor de LLM escolhido
4. Publicar política de privacidade informando envio de resumos a APIs externas

Detalhes de anonimização no prompt: [Engenharia de Prompt § 6.5](./ENGENHARIA_PROMPT.md#65-anonimização-e-conformidade-lgpd).

---

## 9. Referências

### Documentação interna

- [Integração de IA](./INTEGRACAO_IA.md) — arquitetura multi-provider e roteamento
- [Engenharia de Prompt](./ENGENHARIA_PROMPT.md) — system prompts e contexto dinâmico
- [README](../README.md) — visão geral, endpoints e contrato de dados
- [ai-chat README](../supabase/functions/ai-chat/README.md) — contrato da Edge Function

### Código-fonte

- [`src/services/ai.ts`](../src/services/ai.ts) — providers, fallbacks, `chatComplete`
- [`src/services/aiContext.ts`](../src/services/aiContext.ts) — snapshot LGPD-safe
- [`supabase/functions/ai-chat/index.ts`](../supabase/functions/ai-chat/index.ts) — proxy OpenAI, CORS, JWT
- [`api/gemini.ts`](../api/gemini.ts) — proxy Gemini (Vercel Edge)

### Referências externas

- [Documentação Vercel — Deploy Vite](https://vercel.com/docs/frameworks/vite)
- [Supabase CLI — Edge Functions](https://supabase.com/docs/guides/functions)
- [Lei nº 13.709/2018 (LGPD)](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Groq Console](https://console.groq.com/keys)
- [Google AI Studio](https://aistudio.google.com/apikey)
- [OpenAI API Pricing](https://openai.com/api/pricing/)

---

*Documento técnico elaborado para trabalho de conclusão de curso (TCC) - Versão 1.0*
