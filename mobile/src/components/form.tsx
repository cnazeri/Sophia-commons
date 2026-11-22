// Form pieces for the Post screens: a labelled text field, a date picker (plain views, so no new native code and the
// app can get it as an instant update) and a result message.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

type FieldProps = Omit<TextInputProps, 'onChange'> & { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string };

export function Field({ label, value, onChange, error, hint, multiline, ...rest }: FieldProps) {
  const c = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: c.textMuted }]}>{hint}</Text> : null}
      <TextInput value={value} onChangeText={onChange} multiline={multiline} accessibilityLabel={label}
        placeholderTextColor={c.textMuted} textAlignVertical={multiline ? 'top' : 'center'} {...rest}
        style={[styles.input, multiline && styles.multi, { backgroundColor: c.elevated, borderColor: error ? '#B3261E' : c.border, color: c.text }]} />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

// A bold label for a group of chips or a switch, matching the field labels
export function Label({ children }: { children: string }) {
  const c = useTheme();
  return <Text style={[styles.label, { color: c.text }]}>{children}</Text>;
}

export function FormMessage({ text, error }: { text: string; error?: boolean }) {
  const c = useTheme();
  if (!text) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.msg, { color: error ? '#B3261E' : c.sage, borderColor: error ? '#B3261E' : c.sage }]}>{text}</Text>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// A date as YYYY-MM-DD. Tapping the field opens a month calendar; days before `min` are greyed out.
export function DateField({ label, value, onChange, min, error, optional }: {
  label: string; value: string; onChange: (v: string) => void; min?: string; error?: string; optional?: boolean;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const start = value ? new Date(value + 'T12:00') : min ? new Date(min + 'T12:00') : new Date();
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const first = (month.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shown = value ? new Date(value + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const step = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={label + (shown ? ': ' + shown : '')}
        style={[styles.input, styles.dateBtn, { backgroundColor: c.elevated, borderColor: error ? '#B3261E' : c.border }]}>
        <Text style={{ color: shown ? c.text : c.textMuted, fontFamily: Fonts.body, fontSize: 16 }}>
          {shown || t('app.pick_date', 'Choose a date')}
        </Text>
        <MaterialIcons name="calendar-month" size={20} color={c.goldText} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {open ? (
        <View style={[styles.cal, { backgroundColor: c.elevated, borderColor: c.border }]}>
          <View style={styles.calHead}>
            <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('app.prev_month', 'Previous month')}>
              <MaterialIcons name="chevron-left" size={26} color={c.goldText} />
            </Pressable>
            <Text style={[styles.calTitle, { color: c.text }]}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('app.next_month', 'Next month')}>
              <MaterialIcons name="chevron-right" size={26} color={c.goldText} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEK.map((w) => <Text key={w} style={[styles.cell, styles.wk, { color: c.textMuted }]}>{w}</Text>)}
            {cells.map((d, i) => {
              if (!d) return <View key={'e' + i} style={styles.cell} />;
              const iso = isoDay(new Date(month.getFullYear(), month.getMonth(), d));
              const off = !!min && iso < min, on = iso === value;
              return (
                <Pressable key={iso} disabled={off} onPress={() => { onChange(iso); setOpen(false); }}
                  accessibilityRole="button" accessibilityState={{ selected: on, disabled: off }} accessibilityLabel={iso}
                  style={[styles.cell, styles.day, on && { backgroundColor: c.gold }]}>
                  <Text style={{ color: off ? c.border : on ? c.onGold : c.text, fontFamily: on ? Fonts.bodyBold : Fonts.body }}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          {optional && value ? (
            <Pressable onPress={() => { onChange(''); setOpen(false); }} accessibilityRole="button" style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={{ color: c.goldText, fontFamily: Fonts.bodyBold }}>{t('app.clear_date', 'Clear date')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// "7:30" or "19.30" -> "07:30" / "19:30"; "" stays ""; anything else -> null
export function normTime(v: string): string | null {
  const s = v.trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return pad(+m[1]) + ':' + m[2];
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  hint: { fontFamily: Fonts.body, fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, fontFamily: Fonts.body, fontSize: 16 },
  multi: { minHeight: 140, paddingTop: 12, paddingBottom: 12 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { color: '#B3261E', fontFamily: Fonts.bodySemi, fontSize: 13 },
  msg: { fontFamily: Fonts.bodySemi, fontSize: 15, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  cal: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm, gap: Spacing.xs },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  calTitle: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  wk: { fontFamily: Fonts.bodySemi, fontSize: 12, textAlignVertical: 'center', textAlign: 'center', lineHeight: 40 },
  day: { borderRadius: 20 },
});
