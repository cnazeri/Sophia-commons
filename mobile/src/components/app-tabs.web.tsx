// Web preview of the five tabs (the phone apps use native tabs in app-tabs.tsx).
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/lib/i18n';

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const TABS = [
  { name: '(home)', href: '/', key: 'nav.home', fb: 'Home', icon: 'home' },
  { name: 'events', href: '/events', key: 'nav.events', fb: 'Events', icon: 'event' },
  { name: 'directory', href: '/directory', key: 'nav.directory', fb: 'Directory', icon: 'map' },
  { name: 'chat', href: '/chat', key: 'app.tab_chat', fb: 'Chat', icon: 'forum' },
  { name: 'saved', href: '/saved', key: 'app.tab_saved', fb: 'Saved', icon: 'bookmark' },
] as const;

function TabButton({ isFocused, label, icon, ref: _ref, ...props }: TabTriggerSlotProps & { label: string; icon: keyof typeof MaterialIcons.glyphMap }) {
  const c = useTheme();
  const color = isFocused ? c.goldText : c.textMuted;
  return (
    <Pressable {...(props as PressableProps)} style={styles.tab}>
      <MaterialIcons name={icon} size={24} color={color} />
      <Text style={[styles.label, { color, fontFamily: isFocused ? Fonts.bodyBold : Fonts.bodySemi }]}>{label}</Text>
    </Pressable>
  );
}

// The router hands the bar its own style; merge it into one flat style object
function TabBar({ style, children, ...props }: TabListProps) {
  const c = useTheme();
  return (
    <View {...props} style={StyleSheet.flatten([styles.bar, { backgroundColor: c.background, borderTopColor: c.border }, style])}>
      {children}
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <TabBar>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton label={cap(t(tab.key, tab.fb))} icon={tab.icon} />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  label: { fontSize: 11 },
});
