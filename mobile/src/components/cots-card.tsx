// The Calendar of the Soul on Home: the week's first lines, the whole verse with a tap, the German original, the
// mirror and southern weeks and other translations. Moved out of the Home screen unchanged (2026-11-25).
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Body, Card, Kicker } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import cotsDe from '@/data/cots-de.json';
import cotsEn from '@/data/cots-en.json';
import { t } from '@/lib/i18n';
import { cotsWeek } from '@/lib/year';

export function CotsCard() {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [showDe, setShowDe] = useState(false);
  const w = cotsWeek();
  const enVerse = (cotsEn as Record<string, string[]>)[String(w.week)] || [];
  const deVerse = (cotsDe as Record<string, string[]>)[String(w.week)] || [];
  const verse = enVerse.length ? enVerse : deVerse;
  if (!verse.length) return null;
  return (
    <Card>
      <Kicker>{t('cots.title', 'Calendar of the Soul')} · {t('cots.week', 'Week')} {w.week}</Kicker>
      <View style={styles.verse} accessible accessibilityLabel={verse.join(' ')}>
        {(open ? verse : verse.slice(0, 3)).map((ln, i) => (
          <Text key={i} style={[styles.verseLine, { color: c.text }]} selectable>{ln}{!open && i === 2 && verse.length > 3 ? ' ...' : ''}</Text>
        ))}
      </View>
      {open ? (
        <>
          <Text style={[styles.verseBy, { color: c.textMuted }]}>
            {enVerse.length ? 'Rudolf Steiner, Calendar of the Soul (1912). ' + t('app.cots_english_by', 'English rendering: Sophia Commons') : 'Rudolf Steiner, Anthroposophischer Seelenkalender (1912)'}
          </Text>
          {enVerse.length && deVerse.length ? (
            <Pressable onPress={() => setShowDe(!showDe)} accessibilityRole="button" accessibilityState={{ expanded: showDe }} hitSlop={8}>
              <Text style={[styles.link, { color: c.goldText }]}>{showDe ? t('app.cots_hide_german', 'Hide the German original') : t('app.cots_show_german', 'Show the German original')}</Text>
            </Pressable>
          ) : null}
          {showDe ? <View style={styles.verse}>{deVerse.map((ln, i) => <Text key={i} style={[styles.verseDe, { color: c.textSecondary }]} selectable>{ln}</Text>)}</View> : null}
          <Body muted>{t('cots.mirror', 'Mirror verse')}: {t('cots.week', 'Week')} {w.mirror} · {t('cots.southern', 'Southern Hemisphere')}: {t('cots.week', 'Week')} {w.southern}</Body>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(w.url(w.week))} accessibilityRole="link" hitSlop={8}>
            <Text style={[styles.link, { color: c.goldText }]}>{t('app.cots_other_translations', 'Other translations')} ↗</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8} style={styles.linkRow}>
        <Text style={[styles.link, { color: c.goldText }]}>{open ? t('app.cots_less', 'Show less') : t('app.cots_read', 'Read the whole verse')}</Text>
        {open ? null : <Icon name="arrow" size={15} color={c.goldText} />}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  verse: { gap: 2, paddingVertical: 4 },
  verseLine: { fontFamily: Fonts.heading, fontStyle: 'italic', fontSize: 17, lineHeight: 25 },
  verseDe: { fontFamily: Fonts.body, fontSize: 15.5, lineHeight: 24 },
  verseBy: { fontFamily: Fonts.body, fontSize: 12.5 },
  link: { fontFamily: Fonts.bodyBold, fontSize: 14, paddingVertical: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
});
