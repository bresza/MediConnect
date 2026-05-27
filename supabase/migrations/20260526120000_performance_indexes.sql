-- Performance indexes for list/search queries (001-app-performance)
-- Apply via Supabase SQL editor or migration deploy.

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON public.patients (full_name);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON public.appointments (scheduled_at DESC);
