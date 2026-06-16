-- ============================================================================
-- Fila de espera (`appointment_waitlist`) e vagas liberadas (`freed_appointment_slots`)
--
-- Usado pelo MediConnect para sugestões de encaixe após cancelamento/ausência.
-- Idempotente: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS antes de CREATE.
-- Requer `public.current_user_role()` (migration appointments_rls).
-- ============================================================================

BEGIN;

-- ── Fila de espera ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.appointment_waitlist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       uuid NOT NULL,
  patient_name     text NOT NULL,
  specialty        text,
  doctor_id        uuid,
  doctor_name      text,
  cid10            text,
  clinical_notes   text,
  flags            jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_color   text NOT NULL CHECK (priority_color IN ('red', 'yellow', 'green', 'blue')),
  entered_at       timestamptz NOT NULL DEFAULT now(),
  due_by           date NOT NULL,
  last_no_show_at  timestamptz,
  added_by         uuid,
  added_by_name    text,
  status           text NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting', 'scheduled', 'removed')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_status
  ON public.appointment_waitlist (status, entered_at);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_doctor
  ON public.appointment_waitlist (doctor_id)
  WHERE status = 'waiting';

ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist_staff_all" ON public.appointment_waitlist;
CREATE POLICY "waitlist_staff_all"
ON public.appointment_waitlist
FOR ALL
TO authenticated
USING (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria', 'medico')
)
WITH CHECK (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria', 'medico')
);

-- ── Vagas liberadas (cancelamento / ausência) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.freed_appointment_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL,
  patient_id      uuid NOT NULL,
  patient_name    text NOT NULL,
  doctor_id       uuid NOT NULL,
  doctor_name     text NOT NULL,
  slot_date       date NOT NULL,
  slot_time       time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  appointment_type text NOT NULL DEFAULT 'consultation',
  trigger         text NOT NULL
                  CHECK (trigger IN ('patient_cancellation', 'staff_cancellation', 'no_show')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'filled', 'dismissed')),
  freed_at        timestamptz NOT NULL DEFAULT now(),
  filled_at       timestamptz,
  filled_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freed_slots_pending
  ON public.freed_appointment_slots (status, freed_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.freed_appointment_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freed_slots_staff_all" ON public.freed_appointment_slots;
CREATE POLICY "freed_slots_staff_all"
ON public.freed_appointment_slots
FOR ALL
TO authenticated
USING (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria', 'medico')
)
WITH CHECK (
  public.current_user_role() IN ('admin', 'gestor', 'secretaria', 'medico')
);

COMMIT;
