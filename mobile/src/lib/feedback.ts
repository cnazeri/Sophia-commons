// Settings > Send feedback: a short note to the owner, stored in app_feedback
// (backend/migrations/RUN_THIS_2026-11-23_app_feedback.sql). Works signed in or out. Never linked to the store's
// rating card: both stores forbid sending only happy users to it.
import type { Session } from '@supabase/supabase-js';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export const FEEDBACK_MAX = 2000;

export async function sendFeedback(message: string, email: string, session: Session | null): Promise<void> {
  const text = message.trim().slice(0, FEEDBACK_MAX);
  if (!text) throw new Error('empty');
  const row = {
    message: text,
    contact_email: email.trim().slice(0, 200) || null,
    platform: Platform.OS,
    app_version: `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`.slice(0, 40),
  };
  let { error } = await supabase.from('app_feedback').insert({ ...row, user_id: session?.user.id ?? null });
  // A sign-in that has quietly expired is refused for a member's id; send the note without it rather than lose it
  if (error && session) ({ error } = await supabase.from('app_feedback').insert({ ...row, user_id: null }));
  if (error) throw new Error(error.message);
  track('feedback_sent');
}
