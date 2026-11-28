// Reporting a member's post (an event, a community post): the store rules for user content ask for a way to flag it.
// Signed in, the report goes to the reports table (Admin > Reports on the website, reviewed within 24 hours).
// Signed out, it opens an email to hello@sophiacommons.org with the item filled in.
import { Alert, Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export type ReportItem = { type: 'event' | 'blog_post' | 'board_post' | 'board_comment'; id: string; title: string; url: string };
type Item = ReportItem;

async function send(item: Item, reporterId: string, reason: string) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId, item_type: item.type, item_id: item.id, reason, details: (item.title + '\n' + item.url).slice(0, 1000),
  });
  if (error) throw new Error(error.message);
}

export function reportItem(item: Item, session: Session | null, onDone?: () => void) {
  if (!session) {
    const subject = encodeURIComponent('Report: ' + item.title);
    const body = encodeURIComponent(item.url + '\n\n' + t('app.report_email_body', 'What is wrong with it?') + '\n');
    Linking.openURL(`mailto:hello@sophiacommons.org?subject=${subject}&body=${body}`).catch(() =>
      Alert.alert(t('app.report_title', 'Report'), t('app.report_email_fallback', 'Please email hello@sophiacommons.org with the link.')));
    return;
  }
  const done = (reason: string) => send(item, session.user.id, reason)
    .then(() => (onDone ? onDone() : Alert.alert(t('app.reported', 'Thank you. We will review it within 24 hours.'))))
    .catch(() => Alert.alert(t('app.chat_report_error', 'The report could not be sent. Please try again.')));
  Alert.alert(t('app.report_title', 'Report'), t('app.report_why', 'What is wrong with it?'), [
    { text: t('app.reason_wrong', 'Wrong or misleading'), onPress: () => done('misleading') },
    { text: t('app.reason_offensive', 'Offensive or inappropriate'), onPress: () => done('inappropriate') },
    { text: t('app.chat_reason_spam', 'Spam'), onPress: () => done('spam') },
    { text: t('app.cancel', 'Cancel'), style: 'cancel' },
  ]);
}
