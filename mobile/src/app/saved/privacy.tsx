// Settings > Privacy (owner, 2026-11-23): turn anonymous usage statistics (PostHog, see lib/analytics.ts) on or off.
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Body, Screen } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setAnalyticsSharing, useAnalyticsSharing } from '@/lib/analytics';
import { t } from '@/lib/i18n';

export default function PrivacyScreen() {
  const c = useTheme();
  const on = useAnalyticsSharing();
  const label = t('app.privacy_share', 'Share anonymous usage data');
  return (
    <Screen underHeader title={t('app.privacy_title', 'Privacy')}>
      <Body muted>{t('app.privacy_intro', 'To see which parts of the app are used, Sophia Commons counts screens opened and actions like saving or searching. These counts are anonymous: no name, email, account or search words are sent. PostHog, the service that counts them, works out only your rough country and city from your connection.')}</Body>
      <View style={[styles.box, { backgroundColor: c.elevated, borderColor: c.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.label, { color: c.text }]}>{label}</Text>
          <Text style={[styles.desc, { color: c.textSecondary }]}>{t('app.privacy_share_desc', 'Helps us improve the app. You can turn it off at any time.')}</Text>
        </View>
        <Switch value={on} onValueChange={(v) => { setAnalyticsSharing(v).catch(() => {}); }} trackColor={{ true: c.gold }} thumbColor="#FFFFFF" accessibilityLabel={label} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  label: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  desc: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19 },
});
