/**
 * 间隔重复调度（Leitner 定长盒）。
 *
 * 选 Leitner 而非 SM-2 的原因：SM-2 的 ease factor 需要多轮数据才能收敛，
 * 而本项目的场景是「考前 2 天冲刺」，定长盒更快见效。
 *
 * 时间通过参数注入（now），不直接读 Date.now() —— 否则无法单测。
 */

import type { QRecord, Question } from './types';

/** 盒 0–4 对应的复习间隔 */
export const BOX_INTERVAL: number[] = [
  10 * 60_000,        // 0 新题 / 答错后：10 分钟后重现
  60 * 60_000,        // 1 答对 1 次：1 小时
  4 * 60 * 60_000,    // 2 答对 2 次：4 小时
  24 * 60 * 60_000,   // 3 答对 3 次：1 天
  3 * 24 * 60 * 60_000, // 4 已掌握：3 天
];

export function createRecord(now: number): QRecord {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    lastAnswer: [],
    lastCorrect: false,
    lastAt: 0,
    box: 0,
    due: now,
    streak: 0,
    lapses: 0,
  };
}

export function updateRecord(
  prev: QRecord | undefined,
  correct: boolean,
  answer: string[],
  now: number,
): QRecord {
  const rec = prev ? { ...prev } : createRecord(now);
  rec.seen += 1;
  rec.lastAnswer = [...answer];
  rec.lastCorrect = correct;
  rec.lastAt = now;

  if (correct) {
    rec.correct += 1;
    rec.streak += 1;
    rec.box = Math.min(4, rec.box + 1) as QRecord['box'];
  } else {
    rec.wrong += 1;
    rec.lapses += 1;
    rec.streak = 0;
    rec.box = 0;
  }
  rec.due = now + BOX_INTERVAL[rec.box];
  return rec;
}

/** 题目掌握度 0–1（用于章节进度条） */
export function mastery(rec: QRecord | undefined): number {
  if (!rec || rec.seen === 0) return 0;
  if (rec.box >= 4) return 1;
  return Math.min(1, rec.box / 4 + 0.1);
}

export interface QueueOptions {
  now: number;
  limit: number;
}

/**
 * 今日复习队列，优先级：
 *   1. 错题（box=0 且已到期）
 *   2. 其他到期题
 *   3. 未做过的新题
 */
export function buildReviewQueue(
  questions: Question[],
  records: Record<string, QRecord>,
  { now, limit }: QueueOptions,
): Question[] {
  const wrong: Question[] = [];
  const due: Question[] = [];
  const fresh: Question[] = [];

  for (const q of questions) {
    const rec = records[q.id];
    if (!rec || rec.seen === 0) {
      fresh.push(q);
    } else if (rec.box === 0) {
      wrong.push(q);
    } else if (rec.due <= now) {
      due.push(q);
    }
  }

  const rank = (q: Question) => records[q.id]?.due ?? 0;
  wrong.sort((a, b) => rank(a) - rank(b));
  due.sort((a, b) => rank(a) - rank(b));

  return [...wrong, ...due, ...fresh].slice(0, limit);
}

/** 今日待复习总数（首页展示用） */
export function dueCount(
  questions: Question[],
  records: Record<string, QRecord>,
  now: number,
): { wrong: number; due: number; fresh: number; total: number } {
  let wrong = 0;
  let due = 0;
  let fresh = 0;
  for (const q of questions) {
    const rec = records[q.id];
    if (!rec || rec.seen === 0) fresh += 1;
    else if (rec.box === 0) wrong += 1;
    else if (rec.due <= now) due += 1;
  }
  return { wrong, due, fresh, total: wrong + due + fresh };
}

/** 章节掌握度汇总 */
export function chapterStats(
  questions: Question[],
  records: Record<string, QRecord>,
): { chapter: string; total: number; mastered: number; accuracy: number; seen: number }[] {
  const map = new Map<string, { total: number; score: number; correct: number; seen: number }>();
  for (const q of questions) {
    const rec = records[q.id];
    const cur = map.get(q.chapter) ?? { total: 0, score: 0, correct: 0, seen: 0 };
    cur.total += 1;
    cur.score += mastery(rec);
    if (rec) {
      cur.correct += rec.correct;
      cur.seen += rec.seen;
    }
    map.set(q.chapter, cur);
  }
  return [...map.entries()]
    .map(([chapter, v]) => ({
      chapter,
      total: v.total,
      mastered: Math.round(v.score * 10) / 10,
      accuracy: v.seen ? v.correct / v.seen : 0,
      seen: v.seen,
    }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------ 工具 */

export function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const TYPE_LABEL: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  blank: '填空题',
};
