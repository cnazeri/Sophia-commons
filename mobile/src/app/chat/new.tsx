// Board > New post: pick a topic, write a title and the post, then Post. It appears on the board right away
// (members report, block, admins remove) and opens once it is posted.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { TopicChips } from '@/components/board';
import { Button } from '@/components/button';
import { Field, FormMessage, Label } from '@/components/form';
import { Body, Screen } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { createPost, LIMITS, postProblem, topicOf } from '@/lib/board';
import { hasBlockedWords } from '@/lib/chat';
import { t } from '@/lib/i18n';

export default function NewPost() {
  const c = useTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ topic?: string }>();
  const [topic, setTopic] = useState(params.topic && topicOf(params.topic) ? params.topic : 'general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!session) return <Screen underHeader><Body muted>{t('board.sign_in_first', 'Please sign in to post to the board.')}</Body></Screen>;

  const problem = postProblem(title, body);
  const titleErr = tried && (title.trim().length < LIMITS.titleMin || title.trim().length > LIMITS.titleMax) ? problem : '';
  const bodyErr = tried && !titleErr && problem ? problem : '';

  const submit = async () => {
    setTried(true);
    if (problem) return;
    if (hasBlockedWords(title) || hasBlockedWords(body)) {
      setError(t('board.err_words', 'The post contains words that are not allowed here. Please rephrase it.'));
      return;
    }
    setBusy(true); setError('');
    try {
      const p = await createPost(topic, title, body);
      router.replace({ pathname: '/chat/post/[id]', params: { id: p.id } });
    } catch {
      setError(t('board.err_post', 'Your post was not saved. Check your connection and try again.'));
      setBusy(false);
    }
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('board.new_post', 'New post') }} />
      <Label>{t('board.topic', 'Topic')}</Label>
      <TopicChips value={topic} onChange={setTopic} withAll={false} />
      <Field label={t('board.title', 'Title')} value={title} onChange={setTitle} maxLength={LIMITS.titleMax} error={titleErr}
        placeholder={t('board.title_ph', 'What is your post about?')} returnKeyType="next" />
      <Field label={t('board.body', 'Post')} value={body} onChange={setBody} maxLength={LIMITS.bodyMax} multiline error={bodyErr}
        placeholder={t('board.body_ph', 'Share a question, an idea, a study group or news with the community.')} />
      <Text style={[styles.count, { color: c.textMuted }]}>{body.trim().length} / {LIMITS.bodyMax}</Text>
      <FormMessage text={error} error />
      <Button label={busy ? t('board.posting', 'Posting...') : t('board.post_btn', 'Post')} onPress={submit} disabled={busy} />
      <Body muted style={styles.note}>{t('board.public_note', 'Signed-in members can read your post and comment on it. Your profile name is shown.')}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: Fonts.body, fontSize: 12.5, textAlign: 'right', marginTop: -6 },
  note: { fontSize: 13.5, lineHeight: 19 },
});
