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
```

O frontend consome diretamente:

- `POST /auth/v1/token?grant_type=password`
- `POST /functions/v1/user-info`
- `POST /create-user-with-password`
- `POST /functions/v1/create-patient`
- `POST /functions/v1/register-patient`
- `POST /functions/v1/create-doctor`
- `/rest/v1/patients`
- `/rest/v1/appointments`
- `POST /functions/v1/get-available-slots`
- `/rest/v1/doctors`
- `/rest/v1/profiles`
- `/rest/v1/reports`
- `/rest/v1/doctor_availability`
- `/rest/v1/doctor_exceptions`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Contrato De Dados

O app usa IDs de banco como `string` para pacientes, equipe, agenda, prontuários, receitas e financeiro. Campos enviados ao Supabase seguem `snake_case`; o frontend converte para os modelos em `camelCase` nos arquivos em `src/services`.

Principais tabelas e funções usadas:

- `patients`: cadastro do paciente, incluindo `full_name`, `cpf`, `email`, `phone_mobile`, `birth_date` e `created_by` quando o cadastro for direto pela tabela.
- `appointments`: agenda com `patient_id`, `doctor_id`, `scheduled_at`, `duration_minutes` e `created_by`.
- `reports`: laudos com `patient_id`, `exam`, `diagnosis`, `conclusion`, `content_html`, `cid_code` e `status`.
- `doctors` e `profiles`: equipe e nomes exibidos na agenda/prontuários.
- `doctor_availability` e `doctor_exceptions`: horários recorrentes e bloqueios/exceções de agenda médica.
- `reports` também armazena, provisoriamente, prontuários, receitas e financeiro com marcadores no campo `exam` enquanto a API não publica endpoints dedicados para esses módulos.

## Observações

A integração ativa é feita pelos serviços em `src/services/*` usando Supabase REST e Edge Functions.
