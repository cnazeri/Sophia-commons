// Community board (owner, 2026-11-27): members post to the board and comment on posts. Same tables as the website
// (board_posts, board_comments; backend/migrations/RUN_THIS_2026-11-27_board.sql). Members only. The database sets
// user_id and username from the member's profile, and keeps comment_count and last_activity on each post.
// The topics are the old chat rooms (same slugs), so the earlier chat of a topic stays readable as an archive.
import { getLang, localDate, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export type Topic = { slug: string; key: string; label: string };
export type BoardPost = {
  id: string; user_id: string; username: string; topic: string; title: string; body: string;
  comment_count: number; last_activity: string; created_at: string;
};
export type BoardComment = { id: string; post_id: string; user_id: string; username: string; body: string; created_at: string };

// Same slugs and order as the chat rooms (lib/chat.ts ROOMS); `key` matches the chat room keys
export const TOPICS: Topic[] = [
  { slug: 'general', key: 'general', label: 'General' },
  { slug: 'waldorf-education', key: 'waldorf', label: 'Waldorf education' },
  { slug: 'biodynamic', key: 'biodynamic', label: 'Biodynamic' },
  { slug: 'study-groups', key: 'study', label: 'Study groups' },
  { slug: 'eurythmy-arts', key: 'eurythmy', label: 'Eurythmy and arts' },
  { slug: 'medicine', key: 'medicine', label: 'Medicine' },
  { slug: 'christian-community', key: 'cc', label: 'The Christian Community' },
  { slug: 'meetups', key: 'meetups', label: 'Meetups' },
  { slug: 'new-members', key: 'newmembers', label: 'New members' },
];

export const LIMITS = { titleMin: 3, titleMax: 140, bodyMax: 5000, commentMax: 2000 } as const;

export const topicOf = (slug: string) => TOPICS.find((x) => x.slug === slug);
export const topicLabel = (slug: string) => {
  const x = topicOf(slug);
  return x ? t('board.topic_' + x.key, x.label) : slug;
};

const POST_COLS = 'id,user_id,username,topic,title,body,comment_count,last_activity,created_at';
const COMMENT_COLS = 'id,post_id,user_id,username,body,created_at';

export async function fetchPosts(topic?: string, limit = 50): Promise<BoardPost[]> {
  let q = supabase.from('board_posts').select(POST_COLS).order('last_activity', { ascending: false }).limit(limit);
  if (topic) q = q.eq('topic', topic);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as BoardPost[];
}

export async function fetchPost(id: string): Promise<BoardPost | null> {
  const { data, error } = await supabase.from('board_posts').select(POST_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BoardPost) || null;
}

/** Comments on a post, oldest first */
export async function fetchComments(postId: string, limit = 500): Promise<BoardComment[]> {
  const { data, error } = await supabase.from('board_comments').select(COMMENT_COLS)
    .eq('post_id', postId).order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as BoardComment[];
}

export async function createPost(topic: string, title: string, body: string): Promise<BoardPost> {
  const { data, error } = await supabase.from('board_posts')
    .insert({ topic, title: title.trim(), body: body.trim() }).select(POST_COLS).single();
  if (error) throw new Error(error.message);
  return data as BoardPost;
}

export async function createComment(postId: string, body: string): Promise<BoardComment> {
  const { data, error } = await supabase.from('board_comments')
    .insert({ post_id: postId, body: body.trim() }).select(COMMENT_COLS).single();
  if (error) throw new Error(error.message);
  return data as BoardComment;
}

async function remove(table: 'board_posts' | 'board_comments', id: string): Promise<void> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error || !data?.length) throw new Error(error?.message || 'NOTHING_DELETED');
}
export const deletePost = (id: string) => remove('board_posts', id);
export const deleteComment = (id: string) => remove('board_comments', id);

/** A validation message for a new post, or '' when it can be sent */
export function postProblem(title: string, body: string): string {
  const tl = title.trim().length;
  if (tl < LIMITS.titleMin) return t('board.err_title_short', 'The title needs at least {n} characters.', { n: LIMITS.titleMin });
  if (tl > LIMITS.titleMax) return t('board.err_title_long', 'The title can be at most {n} characters.', { n: LIMITS.titleMax });
  const bl = body.trim().length;
  if (!bl) return t('board.err_body_empty', 'Please write something in the post.');
  if (bl > LIMITS.bodyMax) return t('board.err_body_long', 'The post can be at most {n} characters.', { n: LIMITS.bodyMax });
  return '';
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (!isFinite(s)) return '';
  if (s < 60) return t('board.just_now', 'just now');
  if (s < 3600) return t('board.min_ago', '{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('board.hours_ago', '{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('board.days_ago', '{n} d ago', { n: Math.floor(s / 86400) });
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return localDate(iso, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "1 comment" / "4 comments" */
export function commentCount(n: number): string {
  if (n === 1) return t('board.one_comment', '1 comment');
  // Russian has three plural forms
  if (getLang() === 'ru') {
    const m10 = n % 10, m100 = n % 100;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return t('board.few_comments', '{n} comments', { n });
  }
  return t('board.n_comments', '{n} comments', { n });
}
