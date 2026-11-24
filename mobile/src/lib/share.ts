// The Share buttons: opens the phone's share sheet and counts the share (anonymously, see analytics.ts).
import { Share, type ShareContent } from 'react-native';

import { track } from '@/lib/analytics';

export async function shareItem(kind: string, content: ShareContent): Promise<void> {
  try {
    const r = await Share.share(content);
    if (r.action === Share.sharedAction) track('shared', { kind });
  } catch { /* the share sheet was closed or is not available */ }
}
