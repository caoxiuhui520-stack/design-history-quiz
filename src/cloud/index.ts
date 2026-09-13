/**
 * 云服务能力封装。
 *
 * 只依赖 @tencent-ai/workbuddy-cloud-sdk 一个客户端；初始化一次，Auth 与 Database 共用。
 * 登录后数据库请求会自动带上会话，因此这里**不手动传 token / user id / owner_id**。
 */

import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { CLOUD_ENDPOINT, CLOUD_PUBLISHABLE_KEY } from './config';
import type { QRecord } from '../core/types';

export const cloud = createWorkBuddyCloud({
  endpoint: CLOUD_ENDPOINT,
  publishableKey: CLOUD_PUBLISHABLE_KEY,
});

const TABLE = 'progress';

/**
 * SDK 的 database 是泛型接口；不传 schema 类型时行类型退化为 `never`。
 * 这里用一个宽松别名，避免为一次性的行结构生成完整 schema 类型。
 * 查询构建器的运行行为与 supabase-js 完全一致（见 database/code-generation.md），
 * 只是不参与静态类型检查。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseFrom = (table: string) => any;
const db = cloud.database as unknown as { from: LooseFrom };

/* ------------------------------------------------------------ 错误信息 */

interface CloudErr {
  message?: string;
  kind?: string;
  code?: string;
}

/** 把云端错误翻译成人能看懂的话；不要暴露原始行数据 */
export function cloudErrorText(error: unknown): string {
  const e = (error ?? {}) as CloudErr;
  const kind = e.kind ?? '';
  if (kind === 'network' || kind === 'backend-unavailable') return '网络不稳定，请稍后重试';
  if (kind === 'unauthenticated' || kind === 'invalid_grant') return '登录状态已失效，请重新登录';
  if (e.code === '23505') return '该记录已存在';
  if (e.code === '42501') return '没有权限执行该操作';

  const msg = e.message ?? String(error ?? '');
  if (/origin/i.test(msg)) return '当前域名未登记，云端功能仅在发布版可用';
  if (/Failed to fetch|NetworkError/i.test(msg)) return '连不上云端，请检查网络';
  // 云环境身份源未开启「邮箱+密码」登录时，后端会返回这句提示。
  // 此时验证码登录依然可用（注册时走的就是验证码），引导用户切过去。
  if (/身份源|用户名密码/.test(msg)) {
    return '密码登录在当前环境还没开启。请切到「邮箱验证码」登录 —— 你的账号用验证码就能直接进。';
  }
  return msg || '云端操作失败';
}

/* ---------------------------------------------------------------- 会话 */

export interface CloudUser {
  id: string;
  email?: string;
}

export async function getSignedInUser(): Promise<CloudUser | null> {
  const { data, error } = await cloud.auth.getSession();
  if (error || !data) return null;
  const session = data as unknown as { user?: CloudUser };
  return session.user ?? null;
}

export function onAuthChange(cb: (user: CloudUser | null) => void): () => void {
  const sub = cloud.auth.onAuthStateChange((_event, session) => {
    const s = session as unknown as { user?: CloudUser } | null;
    cb(s?.user ?? null);
  });
  return typeof sub === 'function' ? (sub as () => void) : () => {};
}

export async function signOut(): Promise<void> {
  await cloud.auth.signOut();
}

/* ------------------------------------------------------- 邮箱认证流程 */

export async function signInWithPassword(email: string, password: string) {
  return cloud.auth.signInWithPassword({ email, password });
}

/** 邮箱验证码登录（已注册用户 / 首次注册皆可） */
export async function signInWithOtp(email: string) {
  return cloud.auth.signInWithOtp({ email });
}

/** 注册第一步：发送验证码，拿到 verificationId 与 isExistingUser */
export async function sendOtp(email: string) {
  return cloud.auth.sendOtp({ email });
}

/** 注册第二步：验证码 + 密码，一步完成注册与登录 */
export async function verifyOtpForSignup(params: {
  verificationId: string;
  token: string;
  email: string;
  isExistingUser: boolean;
  password?: string;
}) {
  return cloud.auth.verifyOtp(params);
}

export async function resetPasswordForEmail(email: string) {
  return cloud.auth.resetPasswordForEmail(email);
}

/* ------------------------------------------------------------ 进度同步 */

export interface CloudProgress {
  records: Record<string, QRecord>;
  totals: { answered: number; correct: number; sessions: number; startedAt: number };
}

/** 云端存取只需要这两块，不需要把 prefs / version 一起传上去 */
export type ProgressSnapshot = CloudProgress;

export interface CloudRow {
  owner_id: string;
  nickname: string;
  answered: number;
  correct: number;
  mastered: number;
  updated_at: string;
}

/** 自动分配一个用户名（用户可自行修改） */
export function autoNickname(): string {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `设计史同学${n}`;
}

export function summarize(snapshot: ProgressSnapshot) {
  const records = Object.values(snapshot.records);
  return {
    answered: records.reduce((n, r) => n + r.seen, 0),
    correct: records.reduce((n, r) => n + r.correct, 0),
    mastered: records.filter((r) => r.box >= 3).length,
  };
}

/** 读取我自己的进度行；没有则返回 null */
export async function loadMyProgress(): Promise<{
  row: CloudRow | null;
  progress: CloudProgress | null;
}> {
  const user = await getSignedInUser();
  if (!user) return { row: null, progress: null };

  const { data, error } = await db
    .from(TABLE)
    .select('owner_id, nickname, answered, correct, mastered, payload, updated_at')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { row: null, progress: null };

  const row = data as CloudRow & { payload?: string | null };
  let progress: CloudProgress | null = null;
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload) as CloudProgress;
      if (parsed && typeof parsed === 'object' && parsed.records) progress = parsed;
    } catch {
      progress = null; // 荷载损坏时宁可当作没有，也不要用半截数据覆盖本地
    }
  }
  return { row, progress };
}

/** 写入（存在则更新）我的进度 */
export async function saveMyProgress(snapshot: ProgressSnapshot, nickname: string): Promise<void> {
  const sum = summarize(snapshot);

  const { error } = await db.from(TABLE).upsert(
    {
      nickname,
      answered: sum.answered,
      correct: sum.correct,
      mastered: sum.mastered,
      payload: JSON.stringify(snapshot),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' },
  );

  if (error) throw error;
}

export async function updateNickname(nickname: string): Promise<void> {
  const user = await getSignedInUser();
  if (!user) throw new Error('未登录');

  const { data, error } = await db
    .from(TABLE)
    .update({ nickname, updated_at: new Date().toISOString() })
    .eq('owner_id', user.id)
    .select('owner_id');

  if (error) throw error;
  // RLS 会过滤掉非本人的行：空数组代表「没改到」，不是成功
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('这条记录不属于当前账号，未做修改');
  }
}

/* ------------------------------------------------------------ 排行榜 */

export interface LeaderRow {
  rank: number;
  nickname: string;
  correct: number;
  answered: number;
  mastered: number;
  isMe: boolean;
}

/** 按答对题数排行（表为公共只读，写入仅限本人） */
export async function fetchLeaderboard(limit = 50): Promise<LeaderRow[]> {
  const user = await getSignedInUser();

  const { data, error } = await db
    .from(TABLE)
    .select('owner_id, nickname, answered, correct, mastered')
    .order('correct', { ascending: false })
    .order('answered', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as CloudRow[];
  return rows.map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname || '匿名同学',
    correct: r.correct ?? 0,
    answered: r.answered ?? 0,
    mastered: r.mastered ?? 0,
    isMe: Boolean(user && r.owner_id === user.id),
  }));
}

/* ------------------------------------------------------------- 合并 */

// 记录合并逻辑放在 core/store.mergeRecords（纯函数、有单测），这里只做云端存取。
export { mergeRecords } from '../core/store';
