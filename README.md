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

# Defaults de UI do assistente (opcionais)
VITE_OPENAI_MODEL=gpt-4o-mini
VITE_OPENAI_MAX_TOKENS=600
```

## Assistente (ChatGPT)

O widget de IA disponivel em todas as telas autenticadas chama a Edge Function
[`supabase/functions/ai-chat`](./supabase/functions/ai-chat/README.md), que
guarda a chave da OpenAI como **secret** do projeto Supabase. A chave nunca
sai do servidor e nao aparece no bundle do front.

Setup (uma unica vez):

```bash
# Login + link com o projeto
supabase login
supabase link --project-ref SEU_PROJECT_REF

# Guarda a chave como secret no servidor
supabase secrets set OPENAI_API_KEY=sk-sua-chave-aqui

# (opcional) restringe CORS ao seu dominio
supabase secrets set AI_CHAT_ALLOWED_ORIGIN=https://app.suaclinica.com

# Deploy — o flag --no-verify-jwt e obrigatorio porque a funcao valida o
# Bearer JWT manualmente e precisa responder o preflight CORS do browser.
supabase functions deploy ai-chat --no-verify-jwt
```

Se voce nao quiser deploy via Supabase agora, o widget exibe uma mensagem
clara avisando que a funcao nao esta implantada.

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
| `ai-chat`                      | **Sim***     | * apenas se o assistente IA for utilizado     |
| `user-info`                    | Nao          | leitura direta em `profiles`/`patients`/`doctors` |
| `register-patient`             | Nao          | cai em `create-user-with-password`            |
| `request-password-reset`       | Nao          | cai em `/auth/v1/recover`                     |
| `create-doctor`                | Nao          | PATCH em `/rest/v1/doctors` apos criar o user |
| `create-patient`               | Nao          | insert direto em `/rest/v1/patients`          |
| `get-available-slots`          | Nao          | calculo de slots no cliente                   |
| `send-sms`                     | Nao          | mensagem de erro tratada                      |

Para o assistente IA ver a secao acima sobre `ai-chat`. Para as demais,
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
