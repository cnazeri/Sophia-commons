// A tappable row that opens a web page in the in-app browser.
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LinkRow({ title, meta, body, url, image, wide }: { title: string; meta?: string; body?: string; url: string; image?: string | null; wide?: boolean }) {
  const c = useTheme();
  return (
    <Pressable onPress={() => WebBrowser.openBrowserAsync(url)} accessibilityRole="link" accessibilityLabel={title}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.row, { borderColor: c.border }]}>
        {image ? <Image source={image} style={wide ? styles.wide : styles.square} contentFit="cover" transition={150} /> : null}
        <View style={styles.main}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>{title}</Text>
          {meta ? <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>{meta}</Text> : null}
          {body ? <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={3}>{body}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  square: { width: 48, height: 48, borderRadius: Radius.sm },
  wide: { width: 120, height: 68, borderRadius: Radius.sm },
  main: { flex: 1, gap: 3 },
  title: { fontFamily: Fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: Fonts.body, fontSize: 12.5 },
  body: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 18 },
});
