// The body of a review page: messages on top, a spinner while loading, the empty note, then one card per item.
import { type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { Banner, EmptyNote } from '@/components/admin/admin-ui';
import type { ReviewList } from '@/components/admin/use-review';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsk } from '@/lib/admin';
import { t } from '@/lib/i18n';

type Props<T> = { list: ReviewList<T>; empty: string; top?: ReactNode; render: (item: T) => ReactNode };

export function ReviewFrame<T extends { id: string }>({ list, empty, top, render }: Props<T>) {
  const c = useTheme();
  return (
    <>
      <Banner text={list.error} onClose={list.clearError} />
      <Banner text={list.note} tone="note" onClose={list.clearNote} />
      {top}
      {list.rows === null ? <ActivityIndicator color={c.gold} style={{ marginTop: 24 }} accessibilityLabel={t('app.loading', 'Loading')} /> : null}
      {list.rows && !list.rows.length ? <EmptyNote text={empty} /> : null}
      {(list.rows || []).map(render)}
    </>
  );
}

/** Decline-type actions ask first; nothing happens unless the editor confirms */
export async function askThen(message: string, ok: string, go: () => void): Promise<void> {
  if (await confirmAsk(ok, message, ok)) go();
}

/** "From the app" for items members sent from the app, as the website's source tag */
export const sourcePill = (source?: string | null): string[] => (source === 'app' ? [t('app.admin_from_app', 'From the app')] : []);
