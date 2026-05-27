# Automação WhatsApp e lembretes

## Edge Functions

```bash
supabase functions deploy process-whatsapp-inbound
supabase functions deploy run-appointment-reminders
supabase secrets set CRON_SECRET=seu-segredo-forte
```

### Webhook Evolution API

Aponte o webhook de mensagens recebidas para:

`https://<projeto>.supabase.co/functions/v1/process-whatsapp-inbound`

Header opcional para cron: `x-cron-secret: <CRON_SECRET>`

### Cron de lembretes (recomendado 1x por hora)

`POST https://<projeto>.supabase.co/functions/v1/run-appointment-reminders`  
Header: `x-cron-secret: <CRON_SECRET>`

## Tabelas opcionais (SQL)

```sql
-- Fila de mensagens recebidas (se não usar só webhook inline)
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  phone_number text not null,
  message text not null,
  patient_id uuid references patients(id),
  appointment_id uuid,
  processed boolean default false,
  created_at timestamptz default now()
);

-- Evita lembrete duplicado no servidor
create table if not exists appointment_reminder_sent (
  appointment_id uuid not null,
  rule_key text not null,
  sent_at timestamptz default now(),
  primary key (appointment_id, rule_key)
);
```

Sem essas tabelas, o app ainda envia lembretes com deduplicação em `localStorage` enquanto o painel estiver aberto.
