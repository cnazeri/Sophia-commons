// A review list: loads the items, refreshes on pull, and runs an action with the item taken out at once
// (put back in its place, with the reason in plain words, if the action fails).
import { useCallback, useEffect, useState } from 'react';

import { plainError } from '@/lib/admin';
import { t } from '@/lib/i18n';

export type ReviewList<T> = {
  rows: T[] | null; error: string; note: string; refreshing: boolean;
  refresh: () => void; act: (item: T, run: () => Promise<string | void>, done?: string) => Promise<void>;
  clearError: () => void; clearNote: () => void;
};

export function useReview<T extends { id: string }>(load: () => Promise<T[]>): ReviewList<T> {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = useCallback(async (pulled: boolean) => {
    if (pulled) setRefreshing(true);
    try {
      setRows(await load());
      setError('');
    } catch (e) {
      setError(plainError(e));
      setRows((r) => r || []);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // First load, and again when the list changes (e.g. the Reports filter); a late answer for an old list is dropped
  useEffect(() => {
    let live = true;
    load().then((r) => { if (live) { setRows(r); setError(''); } })
      .catch((e: unknown) => { if (live) { setError(plainError(e)); setRows((r) => r || []); } });
    return () => { live = false; };
  }, [load]);

  const act = useCallback(async (item: T, run: () => Promise<string | void>, done?: string) => {
    const at = (rows || []).findIndex((x) => x.id === item.id);
    setError('');
    setNote('');
    setRows((r) => (r || []).filter((x) => x.id !== item.id));
    try {
      const warn = await run();
      if (warn && warn.startsWith('QUEUE:')) {
        setError(t('app.admin_err_queue', 'It worked, but it could not be cleared from the waiting list: {msg}', { msg: warn.slice(6) }));
      } else if (done) setNote(done);
    } catch (e) {
      setRows((r) => {
        const list = (r || []).filter((x) => x.id !== item.id);
        const i = at < 0 ? 0 : Math.min(at, list.length);
        return [...list.slice(0, i), item, ...list.slice(i)];
      });
      setError(plainError(e));
    }
  }, [rows]);

  return {
    rows, error, note, refreshing, act,
    refresh: () => { fetchRows(true); },
    clearError: () => setError(''), clearNote: () => setNote(''),
  };
}
