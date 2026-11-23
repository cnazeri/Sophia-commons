// Settings > Home page: turn the festival/Advent card and the Calendar of the Soul on or off (owner, 2026-11-22).
import { HomeToggles } from '@/components/home-toggles';
import { Body, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';

export default function HomePageSettings() {
  return (
    <Screen underHeader title={t('app.home_page', 'Home page')}>
      <Body muted>{t('app.home_page_intro', 'Choose what shows at the top of the Home page. You can turn them back on here at any time.')}</Body>
      <HomeToggles />
    </Screen>
  );
}
