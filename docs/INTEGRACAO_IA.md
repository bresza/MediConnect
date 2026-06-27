# Integração de IA no MediConnect

## 1. Visão Geral da Arquitetura

O MediConnect implementa um sistema de assistente virtual baseado em Large Language Models (LLMs) com arquitetura multi-provider e fallback automático. A solução foi projetada para oferecer alta disponibilidade, flexibilidade de custos e conformidade com requisitos de segurança e privacidade de dados médicos.

### 1.1 Arquitetura de Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    Camada de Apresentação                    │
│              (AIAssistant.tsx - Interface React)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Camada de Orquestração                     │
│         (ai.ts - Seleção de Provider e Roteamento)          │
└──┬────────┬─────────┬──────────┬──────────┬────────────────┘
   │        │         │          │          │
   │ Groq   │ Gemini  │ OpenAI   │ Proxy    │ Puter (opt-in)
   │ (free) │ (free)  │ (pago)   │ Supabase │ (dev/demo)
   │        │         │          │          │
   ▼        ▼         ▼          ▼          ▼
┌──────────────────────────────────────────────────────────────┐
│                 Provedores de LLM (APIs)                     │
│   • api.groq.com      • generativelanguage.googleapis.com    │
│   • api.openai.com    • Edge Function ai-chat (Supabase)     │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes Principais

#### 1.2.1 Serviço de IA (src/services/ai.ts)

Responsável por:
- **Detecção automática de provider**: Avalia chaves de API disponíveis e seleciona o provider adequado
- **Fallback inteligente**: Implementa múltiplos níveis de redundância para garantir disponibilidade
- **Normalização de interface**: Abstrai diferenças entre APIs de diferentes provedores
- **Tratamento de erros**: Converte mensagens de erro técnicas em orientações em português

#### 1.2.2 Serviço de Contexto (src/services/aiContext.ts)

Responsável por:
- **Construção de snapshot de contexto**: Monta resumo estruturado dos dados da sessão
- **Anonimização de dados sensíveis**: Remove/mascara CPF e informações identificáveis
- **Otimização de tokens**: Limita tamanho do contexto para controle de custos
- **Priorização de dados**: Seleciona informações mais relevantes por perfil de usuário

#### 1.2.3 Edge Function (supabase/functions/ai-chat/index.ts)

Responsável por:
- **Proxy seguro**: Mantém chaves de API no servidor (não expostas ao navegador)
- **Validação de autenticação**: Verifica token bearer antes de processar requisições
- **CORS configurável**: Gerencia origens permitidas para chamadas cross-origin
- **Rate limiting**: Proteção contra abuso através da infraestrutura Supabase

#### 1.2.4 API Gateway Gemini (api/gemini.ts)

Responsável por:
- **Roteamento para Gemini API**: Proxy específico para Google Generative Language API
- **Configuração edge**: Deploy em edge runtime (Vercel) para baixa latência
- **Tratamento de erros**: Mensagens de erro humanizadas em português

### 1.3 Fluxo End-to-End de Requisição

```
Usuário digita mensagem no AIAssistant.tsx
        │
        ▼
buildAIApiContextFromAppState()  →  snapshot LGPD-safe (aiContext.ts)
        │
        ▼
buildSystemPrompt()              →  BASE + ROLE + contexto (ai.ts)
        │
        ▼
chatComplete()                   →  getAIMode() seleciona o provider
        │
        ├── groq   → api.groq.com
        ├── gemini → /api/gemini (Vercel Edge)
        ├── direct → api.openai.com
        ├── proxy  → /functions/v1/ai-chat (Supabase)
        └── puter  → js.puter.com (opt-in)
        │
        ▼
Resposta renderizada no widget
```

Deploy e variáveis de ambiente: [Guia de Implantação](./GUIA_IMPLANTACAO.md). System prompts e contexto: [Engenharia de Prompt](./ENGENHARIA_PROMPT.md).

## 2. Providers de IA Suportados

### 2.1 Groq (Recomendado - Free Tier)

**Características:**
- **Modelo padrão**: `llama-3.3-70b-versatile`
- **Free tier**: ~30 RPM / 14.400 RPD (sem necessidade de cartão)
- **Latência**: Ultra-baixa (<500ms média) graças a hardware especializado (LPUs)
- **API**: Compatível com OpenAI Chat Completions
- **CORS**: Aberto para chamadas diretas do navegador

**Configuração:**
```env
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=gsk_...
VITE_GROQ_MODEL=llama-3.3-70b-versatile
```

**Fallback de modelos:**
Sistema tenta automaticamente na ordem:
1. `llama-3.3-70b-versatile` (configurado)
2. `llama-3.1-8b-instant` (mais rápido)
3. `llama3-70b-8192` (modelo anterior)
4. `llama3-8b-8192` (compacto)
5. `mixtral-8x7b-32768` (alternativa)

**Casos de uso ideais:**
- Desenvolvimento e testes
- MVP sem necessidade de cartão de crédito
- Clínicas com orçamento limitado

### 2.2 Google Gemini (Free Tier com Billing)

**Características:**
- **Modelo padrão**: `gemini-2.0-flash`
- **Free tier**: Varia por projeto (requer Google Cloud billing ativado)
- **Latência**: Moderada (800-1500ms média)
- **Contexto**: Suporte a contextos longos (até 1M tokens em modelos Pro)
- **Multimodal**: Suporte nativo a imagens (não usado no MediConnect v1)

**Configuração:**
```env
VITE_AI_PROVIDER=gemini
VITE_GEMINI_ENABLED=true
VITE_GEMINI_MODEL=gemini-2.0-flash

# Vercel / .env local (server-side — sem prefixo VITE_)
GEMINI_API_KEY=AIza...
```

> O modo direto no browser foi removido por segurança. Toda chamada passa por `/api/gemini` ([`api/gemini.ts`](../api/gemini.ts)).

**Fallback de modelos:**
Sistema tenta automaticamente na ordem:
1. `gemini-2.0-flash` (configurado)
2. `gemini-2.0-flash-lite` (mais barato)
3. `gemini-1.5-flash-latest` (versão anterior)
4. `gemini-1.5-flash-8b-latest` (compacto)
5. `gemini-2.5-flash` (experimental)
6. `gemini-1.5-pro-latest` (mais robusto)

**Tratamento especial de erros:**
- **429 com `limit: 0`**: Indica modelo sem free tier para chave atual → tenta próximo modelo
- **429 transitório**: Rate limiting normal → não tenta outros modelos, orienta aguardar
- **404**: Modelo não existe → tenta próximo modelo
- **Leaked key**: Detecta vazamento e orienta criação de nova chave

**Casos de uso ideais:**
- Produção com necessidade de contextos longos
- Integração futura com análise de imagens médicas
- Ambientes com billing Google Cloud já configurado

### 2.3 OpenAI (Modo Direto - Pago)

**Características:**
- **Modelo padrão**: `gpt-4o-mini`
- **Custo**: $0.150/1M input tokens, $0.600/1M output tokens (gpt-4o-mini)
- **Latência**: Baixa-moderada (600-1000ms média)
- **Qualidade**: Referência da indústria para tarefas complexas
- **Disponibilidade**: 99.9% SLA

**Configuração:**
```env
VITE_AI_PROVIDER=direct
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600
```

**Segurança:**
⚠️ **AVISO**: Chave exposta no bundle JavaScript. Usar apenas para:
- Protótipos e desenvolvimento local
- Demos com chaves temporárias
- **Nunca em produção sem proxy**

**Casos de uso ideais:**
- Ambientes onde qualidade é prioridade absoluta
- Tarefas complexas de raciocínio clínico
- Produção com proxy (modo "proxy" abaixo)

### 2.4 Proxy Supabase (Produção Recomendada)

**Características:**
- **Segurança**: Chave OpenAI mantida como secret no servidor
- **Autenticação**: Valida token bearer do Supabase
- **CORS**: Configurável via `AI_CHAT_ALLOWED_ORIGIN`
- **Monitoramento**: Logs centralizados no Supabase Dashboard

**Configuração:**
```env
# Frontend (.env.local)
VITE_AI_PROVIDER=proxy
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Supabase (secrets)
OPENAI_API_KEY=sk-...
AI_CHAT_ALLOWED_ORIGIN=https://mediconnect.vercel.app
```

**Deploy:**
```bash
supabase functions deploy ai-chat
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://seu-dominio.com
```

**Casos de uso ideais:**
- **Produção** (recomendado)
- Ambientes multi-tenant
- Compliance com LGPD/HIPAA

### 2.5 Puter.js (Desenvolvimento - Opt-in)

**Características:**
- **Sem chave**: Usa conta Puter.com do usuário final
- **Free tier**: Saldo limitado por usuário
- **Providers**: Roteia para OpenAI/Claude/Gemini
- **Limitações**: Requer login do usuário, não adequado para produção

**Configuração:**
```env
VITE_AI_PROVIDER=puter
VITE_PUTER_AI_ENABLED=true
VITE_PUTER_AI_MODEL=gpt-4o-mini
```

**Casos de uso ideais:**
- Demos isoladas sem backend
- Testes de interface sem configurar chaves
- **Não usar em produção**

## 3. Fluxo de Seleção de Provider

### 3.1 Modo Automático (VITE_AI_PROVIDER=auto ou não definido)

```
┌─────────────────────────────────┐
│   VITE_GROQ_API_KEY definida?   │
├─────────────────────────────────┤
│           SIM → Groq            │
│           NÃO → próximo         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  VITE_GEMINI_ENABLED = true?    │
├─────────────────────────────────┤
│          SIM → Gemini           │
│          NÃO → próximo          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ VITE_OPENAI_API_KEY definida?   │
├─────────────────────────────────┤
│         SIM → OpenAI            │
│         NÃO → próximo           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Supabase configurado?          │
├─────────────────────────────────┤
│       SIM → Proxy Supabase      │
│       NÃO → NONE (desabilitado) │
└─────────────────────────────────┘
```

**Nota**: Puter.js **não** entra no modo automático (requer opt-in explícito).

### 3.2 Modo Explícito

Força uso de provider específico via `VITE_AI_PROVIDER`:
- `groq`: Força Groq (requer `VITE_GROQ_API_KEY`)
- `gemini`: Força Gemini (requer `VITE_GEMINI_ENABLED=true` + `GEMINI_API_KEY` no servidor)
- `direct`: Força OpenAI direto (requer `VITE_OPENAI_API_KEY`)
- `proxy`: Força proxy Supabase (requer Supabase configurado)
- `puter`: Força Puter.js (requer `VITE_PUTER_AI_ENABLED=true`)
- `none`: Desabilita assistente

## 4. Implementação Técnica

### 4.1 Interface Unificada

```typescript
interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatRequestOptions {
  signal?: AbortSignal      // Cancelamento de requisição
  temperature?: number      // 0.0-2.0 (padrão: 0.4)
  maxTokens?: number        // Padrão: 600
  model?: string            // Sobrescreve modelo padrão
}

async function chatComplete(
  messages: ChatMessage[],
  options?: ChatRequestOptions
): Promise<string>
```

### 4.2 Tratamento de Erros

Todos os providers lançam `AIError` com mensagens humanizadas:

```typescript
class AIError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown)
}
```

**Exemplos de mensagens de erro tratadas:**
- Chave inválida → "Chave do Groq invalida (VITE_GROQ_API_KEY)."
- Rate limit → "Limite de uso do Groq atingido. Aguarde alguns segundos."
- Modelo inexistente → Fallback automático para próximo modelo
- Chave vazada (Gemini) → "A chave da API foi bloqueada pelo Google por vazamento. Crie uma chave nova..."

### 4.3 Mapeamento de Mensagens

#### OpenAI/Groq (compatível)
```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

#### Gemini (transformação)
```json
{
  "systemInstruction": {
    "role": "system",
    "parts": [{ "text": "..." }]
  },
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] }
  ]
}
```

**Diferenças:**
- Gemini usa `"model"` no lugar de `"assistant"`
- System prompts viram `systemInstruction` global
- Múltiplos system prompts são concatenados

## 5. Configurações de Produção

### 5.1 Variáveis de Ambiente

#### Frontend (Vite)
```env
# Provider (auto, groq, gemini, direct, proxy, puter, none)
VITE_AI_PROVIDER=proxy

# Groq (free tier recomendado para dev/MVP)
VITE_GROQ_API_KEY=
VITE_GROQ_MODEL=llama-3.3-70b-versatile

# Gemini (proxy seguro via Vercel)
VITE_GEMINI_ENABLED=false
VITE_GEMINI_MODEL=gemini-2.0-flash
# GEMINI_API_KEY=   # server-side no Vercel; sem prefixo VITE_

# OpenAI direto (⚠️ chave exposta no bundle)
VITE_OPENAI_API_KEY=
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600

# Supabase (proxy seguro - recomendado produção)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Puter.js (opt-in apenas)
VITE_PUTER_AI_ENABLED=false
VITE_PUTER_AI_MODEL=gpt-4o-mini
```

#### Backend (Supabase Secrets)
```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://seu-dominio.com
```

### 5.2 Recomendações por Ambiente

#### Desenvolvimento Local
```env
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=gsk_...
```
**Justificativa**: Free tier generoso, baixa latência, sem necessidade de cartão

#### Staging
```env
VITE_AI_PROVIDER=proxy
VITE_SUPABASE_URL=https://staging.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
**Justificativa**: Ambiente idêntico à produção para testes completos

#### Produção
```env
VITE_AI_PROVIDER=proxy
VITE_SUPABASE_URL=https://prod.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
**Justificativa**: Máxima segurança (chave no servidor), conformidade LGPD

## 6. Observabilidade e Monitoramento

### 6.1 Logs de Requisição

Cada chamada registra:
- Provider utilizado (`getAIMode()`)
- Modelo efetivo (pode diferir do configurado por fallback)
- Número de mensagens no contexto
- Status da resposta (sucesso/erro)

### 6.2 Métricas de Desempenho e Custos

Valores derivados de [`ai.ts`](../src/services/ai.ts) e [`aiContext.ts`](../src/services/aiContext.ts).

**Latência de referência:**

| Provider | Latência média |
|----------|:--------------:|
| Groq | **< 500 ms** |
| OpenAI direto / proxy | **600–1000 ms** |
| Gemini via Vercel | **800–1500 ms** |

Timeout REST: **15 s** (`REQUEST_TIMEOUT_MS` em [`api.ts`](../src/services/api.ts)).

**Consumo de tokens por turno:**

| Componente | Tokens estimados |
|------------|:----------------:|
| System prompt | 400–800 |
| Snapshot de contexto | 1500–2500 |
| Resposta | até 600 |
| **Total típico** | **2500–3900** |

Limites no snapshot: `MAX_SNAPSHOT_CHARS=7500`, `MAX_PATIENTS=20`, `MAX_APPOINTMENTS=14`, `MAX_STAFF=12`, `MAX_RX=8`.

**Custos por provider:**

| Provider | Modelo padrão | Custo | Tier free |
|----------|---------------|-------|-----------|
| Groq | `llama-3.3-70b-versatile` | R$ 0 | ~30 RPM / 14.400 RPD |
| Gemini | `gemini-2.0-flash` | R$ 0* | *Billing Google Cloud |
| OpenAI | `gpt-4o-mini` | ~US$ 0,0009/turno† | Pago ($0,15/1M in, $0,60/1M out) |

† ~3500 tokens por turno. Exemplo: 100 conversas/dia × 3 turnos × 30 dias ≈ **~US$ 5–8/mês** via proxy.

**Disponibilidade:**
- Taxa de sucesso por provider (alvo > 99%)
- Frequência de fallback de modelo
- Tempo médio de resposta (p95 < 3 s)

**Custos:**
- Tokens consumidos (`usage` retornado por `ai-chat`)
- Custo estimado por conversa e por perfil de usuário

**Qualidade:**
- Taxa de feedback positivo/negativo
- Conversas abandonadas
- Tempo médio de resolução

### 6.3 Alertas Sugeridos

- Rate limit atingido (429) > 5% das requisições
- Latência > 3s em 10% das requisições
- Taxa de erro > 1% em janela de 5min
- Chave vazada detectada (Google)

## 7. Conformidade LGPD

### 7.1 Tratamento de dados

O assistente envia um **resumo textual** ao provider LLM — não o banco completo. A montagem ocorre em `buildAIApiContextFromAppState` ([`aiContext.ts`](../src/services/aiContext.ts)) antes de `chatComplete()`.

| Medida | Implementação |
|--------|---------------|
| **Minimização** | Limites `MAX_*` por categoria; truncamento em 7500 caracteres |
| **Anonimização** | CPF mascarado (`***.***.***-**`); telefone/endereço omitidos |
| **Segregação** | Financeiro só para `manager`/`financial`; equipe oculta para pacientes |
| **Segurança** | Modo proxy mantém chave OpenAI no Supabase; Gemini via Vercel Edge |
| **Autenticação** | `ai-chat` exige Bearer JWT válido |

### 7.2 Dados excluídos do contexto

- Prontuários completos e resultados detalhados de exames
- Informações de pagamento (cartão, conta bancária)
- Tokens de autenticação e senhas
- CPF completo (sempre mascarado quando presente)

### 7.3 Recomendações para produção

1. Usar `VITE_AI_PROVIDER=proxy` — chave OpenAI apenas como secret Supabase
2. Configurar `AI_CHAT_ALLOWED_ORIGIN` com domínios explícitos
3. Formalizar DPA com o provedor de LLM escolhido
4. Publicar política de privacidade informando envio de resumos a APIs externas

Detalhes de anonimização no prompt: [Engenharia de Prompt § 6.5](./ENGENHARIA_PROMPT.md#65-anonimização-e-conformidade-lgpd). Deploy: [Guia de Implantação § 8](./GUIA_IMPLANTACAO.md#8-conformidade-lgpd).

## 8. Referências

### Documentação interna

- [Guia de Implantação](./GUIA_IMPLANTACAO.md) — setup, deploy e operação
- [Engenharia de Prompt](./ENGENHARIA_PROMPT.md) — system prompts e contexto dinâmico
- [README](../README.md) — visão geral, endpoints e contrato de dados

### Código-fonte

- [`src/services/ai.ts`](../src/services/ai.ts) — orquestração, fallbacks, system prompts
- [`src/services/aiContext.ts`](../src/services/aiContext.ts) — snapshot LGPD-safe
- [`supabase/functions/ai-chat/index.ts`](../supabase/functions/ai-chat/index.ts) — proxy OpenAI, CORS, JWT
- [`api/gemini.ts`](../api/gemini.ts) — proxy Gemini (Vercel Edge)

### Referências externas

- [Groq API Documentation](https://console.groq.com/docs)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [OpenAI Chat Completions](https://platform.openai.com/docs/guides/chat-completions)
- [Lei nº 13.709/2018 (LGPD)](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

---

*Documento técnico elaborado para trabalho de conclusão de curso (TCC) - Versão 1.0*
