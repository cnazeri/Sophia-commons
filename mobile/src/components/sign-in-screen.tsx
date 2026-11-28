// The sign-in screen opened from Settings and from Chat (2026-11-24 redesign): the existing AuthForm on its own page,
// so the tabs show a short account card or the room list instead of a full form. ?mode=signup opens "Create account".
// Once signed in it goes back to the tab that opened it.
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { AuthForm } from '@/components/auth-form';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function SignInScreen({ home }: { home: Href }) {
  const { session } = useAuth();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  useEffect(() => {
    if (!session) return;
    if (router.canGoBack()) router.back();
    else router.replace(home);
  }, [session, home]);

  return (
    <Screen underHeader>
      <AuthForm chatIntro={false} initialMode={mode === 'signup' ? 'signup' : 'signin'} />
    </Screen>
  );
}
