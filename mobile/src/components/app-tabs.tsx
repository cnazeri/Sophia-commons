// Five native tabs: Apple's SF Symbols on iPhone, Material icons on Android.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/hooks/use-theme';

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

type TabDef = { name: string; label: string; sf: string; md: keyof typeof MaterialIcons.glyphMap };

export default function AppTabs() {
  const c = useTheme();
  const tabs: TabDef[] = [
    { name: '(home)', label: cap(t('nav.home', 'Home')), sf: 'house', md: 'home' },
    { name: 'events', label: cap(t('nav.events', 'Events')), sf: 'calendar', md: 'event' },
    { name: 'directory', label: cap(t('nav.directory', 'Directory')), sf: 'map', md: 'map' },
    { name: 'chat', label: cap(t('app.tab_chat', 'Chat')), sf: 'bubble.left.and.bubble.right', md: 'forum' },
    // The bottom-right tab is Settings (Saved, My posts, Change password, Account); its folder stays 'saved' so links keep working
    { name: 'saved', label: cap(t('app.tab_settings', 'Settings')), sf: 'gearshape', md: 'settings' },
  ];
  return (
    <NativeTabs
      backgroundColor={c.background}
      indicatorColor={c.surface}
      labelVisibilityMode="labeled"
      iconColor={{ default: c.textMuted, selected: c.goldText }}
      labelStyle={{ default: { color: c.textMuted }, selected: { color: c.goldText } }}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          {Platform.OS === 'ios' ? (
            <NativeTabs.Trigger.Icon sf={tab.sf as never} />
          ) : (
            <NativeTabs.Trigger.Icon src={<VectorIcon family={MaterialIcons} name={tab.md} />} renderingMode="template" />
          )}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
