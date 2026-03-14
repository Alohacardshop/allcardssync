-- Staff PIN login table
CREATE TABLE public.staff_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name text NOT NULL,
  pin_hash text NOT NULL,
  pin_salt text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast name lookup
CREATE INDEX idx_staff_pins_display_name ON public.staff_pins (lower(display_name));

-- RLS: only service role can access (edge functions use service role)
ALTER TABLE public.staff_pins ENABLE ROW LEVEL SECURITY;

-- Admin can read staff pins (for management UI)
CREATE POLICY "Admins can read staff_pins" ON public.staff_pins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No direct insert/update/delete from client - all managed via edge functions