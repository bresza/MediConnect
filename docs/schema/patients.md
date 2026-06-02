# Tabela `patients` (schema de referência)

Fonte: uso estável no app (`getPatientsForReports`, `lookups`, auth).  
**Não adicionar colunas em `select=` sem confirmar no Supabase (Table Editor ou SQL).**

## Colunas confirmadas (listagens)

| Coluna        | Tipo (aprox.) | Uso no front                          |
|---------------|---------------|----------------------------------------|
| id            | uuid          | PK, vínculos                           |
| user_id       | uuid          | dono do registro (RLS) + path do avatar no Storage |
| full_name     | text          | nome exibido                           |
| cpf           | text          | documento                              |
| email         | text          | contato                                |
| phone_mobile  | text          | WhatsApp / SMS                         |
| birth_date    | date          | idade, formulários                     |

## Colunas opcionais (podem não existir no seu projeto)

Se existirem no banco, podem ser pedidas com `fullSelect: true` ou em `getPatientById`:

- `sex` (Masculino/Feminino/Outro — usado em `create-patient` / PATCH estendido), `status`, `gender`, `health_insurance`, `last_visit`, `next_visit`, `photo_url`, endereço, etc.

A coluna `last_visit` **não** entra no `select` da listagem (pode não existir no banco).
A **Última visita** na tela vem do último `appointments.scheduled_at` passado (status ≠ `cancelled`).

## Select seguro para listas

```
id,user_id,full_name,cpf,email,phone_mobile,birth_date
```

Implementado em `CORE_PATIENT_SELECT` em `src/services/patients.ts` (listagens incluem `user_id` para URL de avatar no Storage).

## Avatar (Storage)

Contrato: `POST/GET /storage/v1/object/avatars/{userId}/avatar.{ext}` — ver `src/services/patientPhoto.ts`.
