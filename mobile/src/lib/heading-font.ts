// Headings in Baar Zeitgeist (Lutz Baar, 2002; the AnthroWiki heading face), as on the website: the owner's heading
// font going forward (2026-11-25). It has 231 characters (Latin with accents, no Cyrillic), so a heading uses it only
// when every character is in the font; otherwise it keeps the usual heading font (Russian always does).
import { Fonts } from '@/constants/theme';
import { getLang } from '@/lib/i18n';

const ZEITGEIST = new Set(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿıŁłŒœŠšŸŽžƒˆˇˉ˘˙˚˛˜˝Δμ‐‘’‚“”„†‡•…‰‹›⁄€™∆−∙');

/** True when Baar Zeitgeist can draw every character of `text` */
export function displayCovers(text: string): boolean {
  for (const ch of text) if (!ZEITGEIST.has(ch)) return false;
  return true;
}

/** The font family for a heading: Baar Zeitgeist when it covers the text, else the usual bold heading font */
export function headingFont(text: string): string {
  return getLang() !== 'ru' && displayCovers(text) ? Fonts.display : Fonts.headingBold;
}
