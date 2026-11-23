// "Add a picture" for the Post forms: a button that opens the photo library, then a preview with Change and Remove.
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';
import { type Picked, pickImage } from '@/lib/images';

export function ImageField({ label, hint, value, onChange }: { label: string; hint?: string; value: Picked | null; onChange: (p: Picked | null) => void }) {
  const c = useTheme();
  const [error, setError] = useState('');
  const choose = async () => {
    setError('');
    try { const p = await pickImage(); if (p) onChange(p); } catch (e) { setError((e as Error).message); }
  };
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: c.textMuted }]}>{hint}</Text> : null}
      {value ? (
        <>
          <Image source={{ uri: value.uri }} style={[styles.preview, { borderColor: c.border, aspectRatio: value.width && value.height ? value.width / value.height : 4 / 3 }]}
            contentFit="contain" accessibilityLabel={t('app.img_chosen', 'Chosen picture')} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Button kind="secondary" label={t('app.img_change', 'Change')} onPress={choose} /></View>
            <View style={{ flex: 1 }}><Button kind="secondary" label={t('app.img_remove', 'Remove')} onPress={() => onChange(null)} /></View>
          </View>
        </>
      ) : <Button kind="secondary" label={t('app.img_add', 'Add a picture')} onPress={choose} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  hint: { fontFamily: Fonts.body, fontSize: 13 },
  preview: { width: '100%', maxHeight: 360, borderRadius: Radius.md, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12 },
  error: { color: '#B3261E', fontFamily: Fonts.bodySemi, fontSize: 13 },
});
