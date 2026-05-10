# Edge Function: `ai-chat`

Proxy seguro para a API da OpenAI Chat Completions. A chave fica somente como
segredo do projeto Supabase e nunca e exposta ao front.

## Deploy

```bash
# 1. Faca login no Supabase CLI e linke o projeto
supabase login
supabase link --project-ref SEU_PROJECT_REF

# 2. Define a chave da OpenAI como secret do projeto
supabase secrets set OPENAI_API_KEY=sk-sua-chave-aqui

# (opcional) restringe CORS a apenas o seu dominio
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://app.suaclinica.com

# 3. Deploy (com --no-verify-jwt OU usando o config.toml deste repositorio)
supabase functions deploy ai-chat --no-verify-jwt
```

> Por que `--no-verify-jwt`? O gateway do Supabase, com `verify_jwt = true`,
> rejeita o preflight `OPTIONS` do navegador (porque preflight nao manda
> Authorization), causando erro de CORS no front. Esta funcao valida o
> Bearer JWT manualmente no codigo, entao desligar o `verify_jwt` no gateway
> e seguro e necessario.

## Request

`POST {SUPABASE_URL}/functions/v1/ai-chat`

Headers obrigatorios:

```
Authorization: Bearer <jwt do usuario logado>
apikey: <ANON_KEY do projeto>
Content-Type: application/json
```

Body:

```json
{
  "messages": [
    { "role": "system",    "content": "Voce e o assistente..." },
    { "role": "user",      "content": "Como confirmar consulta?" }
  ],
  "model":       "gpt-4o-mini",
  "temperature": 0.4,
  "max_tokens":  600
}
```

## Response

```json
{
  "content": "Para confirmar, voce pode...",
  "model":   "gpt-4o-mini",
  "usage":   { "prompt_tokens": 120, "completion_tokens": 80, "total_tokens": 200 }
}
```

Em caso de erro, retorna `{ "error": "mensagem" }` com o `status` da OpenAI ou
do servidor.
