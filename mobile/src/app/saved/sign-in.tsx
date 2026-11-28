// Settings > Sign in: the shared sign-in screen; back to Settings once signed in.
import { SignInScreen } from '@/components/sign-in-screen';

export default function SettingsSignIn() {
  return <SignInScreen home="/saved" />;
}
