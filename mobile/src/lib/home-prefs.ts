// Which cards the Home page shows (owner, 2026-11-22: a member can take the festival/Advent card and the Calendar of the
// Soul off Home). Kept on the phone. Changed on a festival day's own page or in Settings > Home page.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'sc_home_v1';
export type HomePrefs = { days: boolean; cots: boolean };
let state: HomePrefs = { days: true, cots: true };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

AsyncStorage.getItem(KEY).then((raw) => {
  if (!raw) return;
  try { state = { ...state, ...JSON.parse(raw) }; emit(); } catch { /* keep defaults */ }
}).catch(() => {});

export function useHomePrefs(): HomePrefs {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

export function setHomePref(k: keyof HomePrefs, on: boolean) {
  state = { ...state, [k]: on };
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  emit();
}
