-- Community Chat: readable by signed-in members only (owner decision, 2026-10-10).
-- The site already hid chat from logged-out visitors; this closes direct API reads too.
DROP POLICY IF EXISTS "chat: anon read" ON public.chat_messages;
REVOKE SELECT ON public.chat_messages FROM anon;
