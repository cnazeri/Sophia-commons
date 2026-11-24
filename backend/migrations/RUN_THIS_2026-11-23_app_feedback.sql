-- App feedback (2026-11-23): Settings > Send feedback in the app writes one row here.
-- Anyone can send (signed in or not); only admins can read. Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  message       text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform      text CHECK (platform IN ('android', 'ios', 'web')),
  app_version   text CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  handled       boolean NOT NULL DEFAULT false
);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

-- Table rights (the policies below then decide which rows)
GRANT INSERT ON public.app_feedback TO anon, authenticated;
GRANT SELECT, UPDATE ON public.app_feedback TO authenticated;

-- Signed-out visitors may send without an account; a signed-in member may only send as themselves
DROP POLICY IF EXISTS "app_feedback: anon insert" ON public.app_feedback;
CREATE POLICY "app_feedback: anon insert"
  ON public.app_feedback FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL AND handled = false);

DROP POLICY IF EXISTS "app_feedback: authenticated insert" ON public.app_feedback;
CREATE POLICY "app_feedback: authenticated insert"
  ON public.app_feedback FOR INSERT
  TO authenticated
  WITH CHECK ((user_id IS NULL OR user_id = auth.uid()) AND handled = false);

DROP POLICY IF EXISTS "app_feedback: admin read" ON public.app_feedback;
CREATE POLICY "app_feedback: admin read"
  ON public.app_feedback FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "app_feedback: admin update" ON public.app_feedback;
CREATE POLICY "app_feedback: admin update"
  ON public.app_feedback FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS app_feedback_created_idx ON public.app_feedback (created_at DESC);
