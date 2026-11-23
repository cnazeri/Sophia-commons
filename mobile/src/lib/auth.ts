// Member sign-in, the same accounts as sophiacommons.org (email and password).
// Display name in chat = the part of the email before the @, as on the website.
import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { t } from '@/lib/i18n';
import { SITE, supabase } from '@/lib/supabase';

let session: Session | null = null;
let ready = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

supabase.auth.getSession().then(({ data }) => { session = data.session; ready = true; emit(); }).catch(() => { ready = true; emit(); });
supabase.auth.onAuthStateChange((_event, s) => { session = s; ready = true; emit(); });

type AuthState = { session: Session | null; ready: boolean };
let snap: AuthState = { session: null, ready: false };
const getSnap = () => {
  if (snap.session !== session || snap.ready !== ready) snap = { session, ready };
  return snap;
};

export function useAuth(): AuthState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getSnap, getSnap);
}

export const displayName = (s: Session | null) => (s?.user?.email || '').split('@')[0] || 'member';

const clean = (email: string) => email.trim().toLowerCase();

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: clean(email), password });
  if (error) throw error;
}

/** Returns true when the member must confirm their email before signing in (email confirmation is on). */
export async function signUp(email: string, password: string, newsletter: boolean): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: clean(email), password, options: { emailRedirectTo: SITE + '/', data: { newsletter } },
  });
  if (error) throw error;
  return !data.session;
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(clean(email), { redirectTo: SITE });
  if (error) throw error;
}

/** Checks the current password (a fresh sign-in), then sets the new one. Same account as sophiacommons.org. */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  const check = await supabase.auth.signInWithPassword({ email: clean(email), password: current });
  if (check.error) throw new Error(t('app.pw_err_wrong', 'The current password is not right.'));
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Deletes the member's own account through the delete-account server function, then signs out. */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error || !data?.ok) throw new Error(data?.error || 'Your account could not be deleted. Please email hello@sophiacommons.org.');
  await supabase.auth.signOut().catch(() => {});
}
