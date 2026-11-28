// The custom line icons from the website redesign (owner, 2026-11-24: anthroposophical motifs, never emoji or a stock
// set), drawn as SVG and tinted with expo-image, so they need no new native code and can ship as an instant update.
// Same drawings as _mockups/site2/icons.js on the website side.
import { Image } from 'expo-image';

const PATHS = {
  home: '<path d="M4 11.5C6.2 7.6 9 5.2 12 4c3 1.2 5.8 3.6 8 7.5"/><path d="M6.2 9.8V20h11.6V9.8"/><path d="M10.4 20v-3.2a1.6 1.6 0 0 1 3.2 0V20"/>',
  events: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m12 12.3.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
  directory: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/><path d="m15 9-1.9 4.1L9 15l1.9-4.1z"/>',
  resources: '<path d="M3.5 8.5c2.8-1 5.8-.8 8.5 1 2.7-1.8 5.7-2 8.5-1V19c-2.8-1-5.8-.8-8.5 1-2.7-1.8-5.7-2-8.5-1z"/><path d="M12 9.5V20"/><path d="m12 2.6.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z"/>',
  memorial: '<path d="M12 3.2c1.5 1.8 2.3 3.1 2.3 4.2a2.3 2.3 0 0 1-4.6 0c0-1.1.8-2.4 2.3-4.2z"/><path d="M9.3 11.5h5.4V20H9.3zM6.8 20h10.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  share: '<path d="M12 4v11M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  calplus: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5S14.4 18 12 20.5C9.6 18 8.5 15.2 8.5 12S9.6 6 12 3.5z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.8 1.1 5.4L12 16.2 7.1 18.8l1.1-5.4-4-3.8 5.4-.6z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><circle cx="16.9" cy="7.1" r=".9" fill="#000" stroke="none"/>',
  x: '<path d="M5 4.5h3.6L19 19.5h-3.6zM18.6 4.5 13.4 10.4M10.6 13.6 5.4 19.5"/>',
  // Settings (2026-11-24)
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20.5c.8-3.9 3.6-6.2 7.2-6.2s6.4 2.3 7.2 6.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5M12 14.5v2.4"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2 4-4.2"/>',
  chat: '<path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v6.5A2.5 2.5 0 0 1 17 16h-6l-4.5 3.8V16H7a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 7 4.5z"/>',
  post: '<path d="M7 3.5h7l4.5 4.5v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5"/>',
  // Home, Take part and Talks (2026-11-25, from home2.js)
  pen: '<path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 6.5l3 3"/>',
  play: '<path d="M9 7.5v9l7.5-4.5z"/>',
  // Admin (2026-11-25)
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/>',
  flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5c4-2 7 2 13 0v9c-6 2-9-2-13 0"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  // the categories
  waldorf: '<path d="M3.5 12c0-2.3 1.6-3.7 3.6-3.7 3.6 0 6.2 7.4 9.8 7.4 2 0 3.6-1.4 3.6-3.7s-1.6-3.7-3.6-3.7c-3.6 0-6.2 7.4-9.8 7.4-2 0-3.6-1.4-3.6-3.7z"/>',
  biodynamic: '<path d="M12 20.5v-7.5"/><path d="M12 13c-3.4 0-5.2-1.9-5.2-5.2 3.4 0 5.2 1.9 5.2 5.2zM12 15.4c2.9 0 4.4-1.5 4.4-4.4-2.9 0-4.4 1.5-4.4 4.4z"/><path d="M7.5 20.5h9"/><path d="M18.6 2.8a2.9 2.9 0 1 0 2.3 4.7 2.3 2.3 0 0 1-2.3-4.7z"/>',
  christian: '<circle cx="12" cy="3.6" r="1.6"/><path d="M6.8 7h10.4c0 3.9-2.3 6.6-5.2 6.6S6.8 10.9 6.8 7z"/><path d="M12 13.6v3.6"/><path d="M8.4 20.6c.3-1.9 1.7-3.4 3.6-3.4s3.3 1.5 3.6 3.4z"/>',
  camphill: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.2V20h12V9.2"/><path d="M12 17.6s-3-1.7-3-3.7a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.7-3 3.7z"/>',
  societies: '<path d="M3.5 20.5h17"/><path d="M5 20.5V14l2.6-4.5h8.8L19 14v6.5"/><path d="m7.6 9.5 1.9-4.5h5l1.9 4.5"/><path d="M10 20.5v-4.2a2 2 0 0 1 4 0v4.2"/>',
  eurythmy: '<circle cx="12" cy="4.6" r="1.7"/><path d="M12 7.8v6"/><path d="M12 9.4C9 9 6.6 7.2 5.4 4.4M12 9.4c3-.4 5.4-2.2 6.6-5"/><path d="M12 13.8c-2.4 1.5-3.9 3.6-4.5 6.7h9c-.6-3.1-2.1-5.2-4.5-6.7z"/>',
  medicine: '<path d="M12 21v-6.5M12 14.5l-4-4M12 14.5l4-4"/><path d="M8 10.5c-2.6-.4-4-1.9-4.3-4.3 2.4.3 3.9 1.8 4.3 4.3zM8 10.5c-.7-2.3-.2-4.3 1.4-5.9.9 2.1.5 4.1-1.4 5.9zM16 10.5c2.6-.4 4-1.9 4.3-4.3-2.4.3-3.9 1.8-4.3 4.3zM16 10.5c.7-2.3.2-4.3-1.4-5.9-.9 2.1-.5 4.1 1.4 5.9z"/><circle cx="12" cy="11.2" r="1.2"/>',
  eldercare: '<g transform="translate(0 -2.6)"><path d="M3.5 19.5c2.5-2.4 5.2-2.9 8.5-1.4 3.3-1.5 6-1 8.5 1.4"/><path d="M8.4 16.2a3.6 3.6 0 0 1 7.2 0"/><path d="M12 9.2v1.6M7.2 11.2l1.1 1.1M16.8 11.2l-1.1 1.1M5.2 15.6h1.5M17.3 15.6h1.5"/></g>',
} as const;

export type IconName = keyof typeof PATHS;

const uri = (name: IconName) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + PATHS[name] + '</svg>');
// Every icon prepared once, when the app loads
const URIS = Object.fromEntries((Object.keys(PATHS) as IconName[]).map((n) => [n, uri(n)])) as Record<IconName, string>;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <Image source={{ uri: URIS[name] }} style={{ width: size, height: size }} tintColor={color} contentFit="contain" accessible={false} />;
}
