// Sophia Commons look: the website's warm ivory, ink and gold (sophia_commons_v9.css), plus a warm dark mode.
import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#FDFBF7',
    surface: '#F7F3EC',
    elevated: '#FFFFFF',
    text: '#1E1810',
    textSecondary: '#5A4E42',
    textMuted: '#6F665B',
    gold: '#C9A035',       // fills and borders
    goldText: '#7F6116',   // gold for text and links (AA contrast)
    onGold: '#1E1810',
    sage: '#3F7539',
    border: '#E8E2DA',
    blue: '#2A5DB0',       // the logo mark
  },
  dark: {
    background: '#17120C',
    surface: '#221B13',
    elevated: '#2B2319',
    text: '#F3EDE2',
    textSecondary: '#D4C9B8',
    textMuted: '#A99D8B',
    gold: '#C9A035',
    goldText: '#E0BE5C',
    onGold: '#1E1810',
    sage: '#8DBF86',
    border: '#3A3025',
    blue: '#7EA6E8',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

// Fonts loaded in app/_layout.tsx. The logo font has letters only (A-Z, a-z): use it for the wordmark alone.
export const Fonts = {
  logo: 'SophiaCommonsDisplay',
  heading: 'Lora_600SemiBold',
  headingBold: 'Lora_700Bold',
  body: 'NunitoSans_400Regular',
  bodySemi: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
};

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const MaxContentWidth = 720;
export const isIOS = Platform.OS === 'ios';
