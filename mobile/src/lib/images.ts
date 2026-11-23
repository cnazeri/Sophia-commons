// Pictures for posts (owner, 2026-11-22). The member picks one from their photos (cropping is offered); it is sent
// either inline to the event-save function (events, as on the website) or uploaded to the post-images bucket in the
// member's own folder (community posts, jobs, places). jpg/png/webp, at most 5 MB.
import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';

import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export type Picked = { uri: string; base64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number };
const MAX_BYTES = 5 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Opens the photo library. Returns null when the member cancels. Throws a readable message if the picture can't be used. */
export async function pickImage(): Promise<Picked | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.75, base64: true, exif: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  if (!a.base64) throw new Error(t('app.img_err_read', 'This picture could not be read. Please try another one.'));
  // The editor saves crops as JPEG; anything else unusual (HEIC, GIF) is treated as JPEG after the picker's conversion
  const mime = a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
  if ((a.base64.length * 3) / 4 > MAX_BYTES) throw new Error(t('app.img_err_big', 'This picture is larger than 5 MB. Please choose a smaller one.'));
  return { uri: a.uri, base64: a.base64, mime, width: a.width, height: a.height };
}

/** For the event-save function: "data:image/jpeg;base64,..." */
export const dataUrl = (p: Picked) => `data:${p.mime};base64,${p.base64}`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytes(b64: string): Uint8Array {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Uploads to post-images/<member id>/<time>.<ext> and returns the public https address. */
export async function uploadPostImage(p: Picked, s: Session): Promise<string> {
  const path = `${s.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${EXT[p.mime]}`;
  const { error } = await supabase.storage.from('post-images').upload(path, bytes(p.base64), { contentType: p.mime, upsert: false });
  if (error) throw new Error(t('app.img_err_upload', 'The picture could not be uploaded. Please try again.') + ' (' + error.message + ')');
  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
