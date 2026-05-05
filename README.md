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
- `POST /functions/v1/create-user-with-password`
- `POST /functions/v1/create-doctor`
- `/rest/v1/patients`
- `/rest/v1/appointments`
- `/rest/v1/doctors`
- `/rest/v1/profiles`
- `/rest/v1/reports`
- `/rest/v1/medical_records`
- `/rest/v1/prescriptions`
- `/rest/v1/financial_records`

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

O diretório `backend/` não é usado pelo frontend atual. A integração ativa é feita pelos serviços em `src/services/*` usando Supabase REST e Edge Functions..
