// Community chat: the same nine rooms and messages as the website's chat (chat_messages table, members only).
// Apple's rules for chat apps are covered here: a word filter on sending, reporting a message, blocking a member.
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

export type Room = { name: string; key: string; desc: string; sub: string };
export type Message = { id: string; room: string; username: string | null; user_id: string | null; content: string; created_at: string };

// Same order, names and labels as the website (index.html .ritem list); labels come from its translations.
export const ROOMS: Room[] = [
  { name: 'general', key: 'general', desc: 'Open conversation for all members', sub: 'open discussion' },
  { name: 'waldorf-education', key: 'waldorf', desc: 'Teachers, parents, and students', sub: 'teachers & parents' },
  { name: 'biodynamic', key: 'biodynamic', desc: 'Farms, CSAs, and growers', sub: 'farms & growers' },
  { name: 'study-groups', key: 'study', desc: 'Reading circles and branches', sub: 'reading circles' },
  { name: 'eurythmy-arts', key: 'eurythmy', desc: 'Practitioners and students', sub: 'practitioners' },
  { name: 'medicine', key: 'medicine', desc: 'Practitioners and patients', sub: 'practitioners' },
  { name: 'christian-community', key: 'cc', desc: 'Congregations worldwide', sub: 'congregations' },
  { name: 'meetups', key: 'meetups', desc: 'Local gatherings and events', sub: 'local & regional' },
  { name: 'new-members', key: 'newmembers', desc: 'Introductions and questions', sub: 'introductions' },
];
export const MAX_LEN = 2000;

export async function fetchMessages(room: string, limit = 60): Promise<Message[]> {
  const { data, error } = await supabase.from('chat_messages').select('id,room,username,user_id,content,created_at')
    .eq('room', room).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data || []) as Message[]).reverse();
}

/** Live new and deleted messages for one room. Returns a function that stops listening. */
export function subscribeRoom(room: string, onInsert: (m: Message) => void, onDelete: (id: string) => void): () => void {
  const ch = supabase.channel('app-room-' + room + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'room=eq.' + room },
      (p) => onInsert(p.new as Message))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' },
      (p) => { const id = (p.old as { id?: string }).id; if (id) onDelete(id); })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// Words that stop a message from being sent (whole words, any case). Kept short on purpose: reports and
// admin deletion handle everything else.
const BLOCKED_WORDS = [
  'fuck', 'fucking', 'motherfucker', 'shit', 'bullshit', 'cunt', 'bitch', 'asshole', 'dickhead', 'bastard',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink', 'wetback', 'tranny',
  'fotze', 'wichser', 'arschloch', 'hurensohn', 'schwuchtel',
];
const FILTER = new RegExp('(^|[^\\p{L}])(' + BLOCKED_WORDS.join('|') + ')(?=$|[^\\p{L}])', 'iu');
export const hasBlockedWords = (s: string) => FILTER.test(s);

export async function sendMessage(room: string, content: string, username: string, userId: string): Promise<Message> {
  const text = content.trim().slice(0, MAX_LEN);
  const { data, error } = await supabase.from('chat_messages')
    .insert({ room, username, user_id: userId, content: text }).select('id,room,username,user_id,content,created_at').single();
  if (error) throw new Error(error.message);
  return data as Message;
}

export async function deleteMessage(id: string): Promise<void> {
  const { data, error } = await supabase.from('chat_messages').delete().eq('id', id).select('id');
  if (error || !data?.length) throw new Error('This message could not be deleted.');
}

export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'inappropriate', 'other'] as const;

export async function reportMessage(m: Message, reporterId: string, reason: string): Promise<void> {
  const details = ('[' + m.room + '] ' + (m.username || '') + ': ' + m.content).slice(0, 1000);
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId, item_type: 'chat_message', item_id: m.id, reason, details,
  });
  if (error) throw new Error(error.message);
}

// ── Block list (private to each member, kept in user_blocks) ──
let blocked = new Set<string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function useBlocked(): Set<string> {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => blocked, () => blocked);
}

export async function loadBlocks(): Promise<void> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) return;
  blocked = new Set((data || []).map((r: { blocked_id: string }) => r.blocked_id));
  emit();
}

export async function blockMember(me: string, other: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').upsert({ blocker_id: me, blocked_id: other });
  if (error) throw new Error(error.message);
  blocked = new Set([...blocked, other]); emit();
}

export async function unblockMember(me: string, other: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', other);
  if (error) throw new Error(error.message);
  const next = new Set(blocked); next.delete(other); blocked = next; emit();
}

export const clearBlocks = () => { blocked = new Set(); emit(); };
