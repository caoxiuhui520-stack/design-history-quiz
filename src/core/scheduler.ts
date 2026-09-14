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
  /** 注入随机源，便于测试；默认 Math.random */
  rand?: () => number;
}

/* ---------------------------------------------------------------- 权重 */

/**
 * 刷题权重常量。集中放在这里，方便解释「为什么这题又出现了」。
 *
 * 目标（按用户诉求）：
 *   没刷过的最优先 → 刷得少的、错得多的次之 → 已经熟了的明显少出现（但不消失）
 */
export const WEIGHT = {
  /** 完全没刷过：绝对优先，直接给最高分 */
  fresh: 100,
  /** 刷得少：seen=1 加 36、seen=2 加 18、≥3 不加 */
  thinStep: 18,
  thinUpTo: 3,
  /** 正确率：全错 +40，全对 +0（线性） */
  accuracySpan: 40,
  /** 已掌握：进 box3 扣 22、box4 扣 45 */
  box3Penalty: 22,
  box4Penalty: 45,
  /** 到期：逾期每天 +4 分，最多 +30 */
  overduePerDay: 4,
  overdueCap: 30,
  /** 还没到复习时间：扣 25 分（用户想刷还是能刷到，只是概率低） */
  notDuePenalty: 25,
  /** 历史累计答错：每次 +10，最多算 4 次（错得多的要明显多出现） */
  lapseStep: 10,
  lapseCap: 4,
  /** 权重下限：保证任何题都还有出现机会（「少出现」而不是「不出现」） */
  floor: 3,
};

/**
 * 单题权重。0 表示最不需要刷，越大越该出现。
 * 没刷过 → WEIGHT.fresh（100），熟透的沉到 floor（3）。
 */
export function questionWeight(rec: QRecord | undefined, now: number): number {
  if (!rec || rec.seen === 0) return WEIGHT.fresh;

  let score = 0;

  // 刷得少 → 加权（还没形成记忆）
  score += Math.max(0, WEIGHT.thinUpTo - Math.min(rec.seen, WEIGHT.thinUpTo)) * WEIGHT.thinStep;

  // 正确率低 → 加权
  score += (1 - rec.correct / Math.max(1, rec.seen)) * WEIGHT.accuracySpan;

  // 已经进了掌握盒 → 降权（这就是「比较熟的少出现」）
  if (rec.box >= 4) score -= WEIGHT.box4Penalty;
  else if (rec.box >= 3) score -= WEIGHT.box3Penalty;

  // 到期越久越该复习；还没到期则降权
  if (rec.due <= now) {
    score += Math.min(WEIGHT.overdueCap, ((now - rec.due) / 86_400_000) * WEIGHT.overduePerDay);
  } else {
    score -= WEIGHT.notDuePenalty;
  }

  // 累计答错越多，越该再见面
  score += Math.min(WEIGHT.lapseCap, rec.lapses) * WEIGHT.lapseStep;

  return Math.max(WEIGHT.floor, score);
}

/** 题目状态标签，用于界面上告诉用户「这题为什么出现」 */
export type QuestionStatus = 'new' | 'weak' | 'learning' | 'mastered';

export function questionStatus(rec: QRecord | undefined): QuestionStatus {
  if (!rec || rec.seen === 0) return 'new';
  const accuracy = rec.correct / Math.max(1, rec.seen);
  if (rec.box >= 4 || (rec.seen >= 3 && accuracy >= 0.85)) return 'mastered';
  if (rec.wrong > 0 && accuracy < 0.6) return 'weak';
  return 'learning';
}

export const STATUS_LABEL: Record<QuestionStatus, string> = {
  new: '新题',
  weak: '待加强',
  learning: '巩固中',
  mastered: '已掌握',
};

/**
 * 按权重做无放回抽样。
 *
 * 选「加权抽样」而不是「按权重排序」的原因：排序会让熟题永远排在最后、再也不会出现，
 * 而用户要的是「少出现」——抽样能在保证新题/错题优先的同时，让熟题仍有机会被抽到。
 */
export function weightedSample<T>(
  items: T[],
  weights: number[],
  n: number,
  rand: () => number = Math.random,
): T[] {
  const pool = items.map((item, i) => ({ item, w: Math.max(0, weights[i] ?? 0) }));
  const out: T[] = [];
  const take = Math.min(n, pool.length);

  for (let k = 0; k < take; k++) {
    const sum = pool.reduce((s, p) => s + p.w, 0);
    if (sum <= 0) {
      // 全部权重为 0：退化成按原顺序取，保证不空转
      out.push(pool.shift()!.item);
      continue;
    }
    let r = rand() * sum;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return out;
}

/**
 * 今日复习队列：按权重抽样。
 *
 * 旧实现是「错题 → 到期 → 新题」的固定顺序，新题排在最后，
 * 与「没刷过的优先」的诉求正好相反，因此改为统一权重。
 */
export function buildReviewQueue(
  questions: Question[],
  records: Record<string, QRecord>,
  { now, limit, rand }: QueueOptions,
): Question[] {
  const weights = questions.map((q) => questionWeight(records[q.id], now));
  return weightedSample(questions, weights, limit, rand);
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
