// One item waiting for review, as a card: when it came in, the title, its pills, the key fields, a picture, the text,
// and the action buttons (Approve / Decline and the like).
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Pill } from '@/components/admin/admin-ui';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Card, Kicker } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Field = { label: string; value?: string | null; url?: string | null };
export type Action = { label: string; kind: 'primary' | 'secondary' | 'danger'; onPress: () => void };

type ReviewCardProps = {
  kicker?: string; title: string; pills?: string[]; fields?: Field[]; image?: string | null; imageLabel?: string;
  body?: string | null; extra?: ReactNode; actions: Action[];
};

export function ReviewCard({ kicker, title, pills, fields, image, imageLabel, body, extra, actions }: ReviewCardProps) {
  const c = useTheme();
  const shown = (fields || []).filter((f) => f.value);
  return (
    <Card style={styles.card}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{title}</Text>
      {pills?.length ? <View style={styles.pills}>{pills.map((p) => <Pill key={p} label={p} />)}</View> : null}
      {shown.length ? (
        <View style={styles.fields}>
          {shown.map((f) => (
            <View key={f.label} style={styles.field}>
              <Text style={[styles.label, { color: c.textMuted }]}>{f.label}</Text>
              {f.url ? (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(f.url as string)} accessibilityRole="link" style={styles.linkHit}>
                  <Text style={[styles.value, { color: c.goldText, textDecorationLine: 'underline' }]} numberOfLines={2}>{f.value}</Text>
                </Pressable>
              ) : <Text style={[styles.value, { color: c.text }]} selectable>{f.value}</Text>}
            </View>
          ))}
        </View>
      ) : null}
      {image ? (
        <Image source={{ uri: image }} style={[styles.image, { backgroundColor: c.surface }]} contentFit="contain"
          accessibilityLabel={imageLabel || title} transition={150} />
      ) : null}
      {body ? <Text style={[styles.body, { color: c.textSecondary }]} selectable>{body}</Text> : null}
      {extra}
      <View style={styles.actions}>
        {actions.map((a) => <View key={a.label} style={styles.action}><Button label={a.label} kind={a.kind} onPress={a.onPress} /></View>)}
      </View>
    </Card>
  );
}

/** A row that opens a page, inside a card (e.g. "Live now: open the page") */
export function CardLink({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.cardLink} hitSlop={4}>
      <Text style={[styles.cardLinkText, { color: c.goldText }]}>{label}</Text>
      <Icon name="arrow" size={15} color={c.goldText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  title: { fontFamily: Fonts.headingBold, fontSize: 19, lineHeight: 25 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fields: { gap: 6 },
  field: { gap: 1 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 0.4 },
  value: { fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 20 },
  linkHit: { minHeight: 32, justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10 },
  body: { fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  action: { flexGrow: 1, flexBasis: 120 },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  cardLinkText: { fontFamily: Fonts.bodyBold, fontSize: 14.5 },
});
