/**
 * 判分内核。全部为纯函数，无 IO、无副作用 —— 这是「即时反馈」能做到零延迟的前提。
 *
 * 判定规则（与学习通保持一致）：
 *   单选  选项集合相等
 *   多选  严格集合相等（漏选、多选均判错）
 *   判断  T/F 归一化相等
 *   填空  精确 → 别名 → 同义词 → 带单位数字 → 编辑距离容错
 */

import type { BlankResult, Essay, JudgeResult, Question } from './types';
import { fuzzyLimit, isSynonym, levenshtein, normalize } from './normalize';

const UNIT_RE = /(年代|年间|年|月|日)/g;

function matchBlank(input: string, expected: string, aliases: string[]): BlankResult {
  const base: BlankResult = { input, expected, ok: false, mode: 'miss' };
  const a = normalize(input);
  if (!a) return base;

  const e = normalize(expected);
  if (a === e) return { ...base, ok: true, mode: 'exact' };

  for (const alias of aliases ?? []) {
    if (a === normalize(alias)) return { ...base, ok: true, mode: 'alias' };
  }

  if (isSynonym(a, e)) return { ...base, ok: true, mode: 'synonym' };

  // 带单位数字容错：1922年 ≈ 1922
  const aNum = a.replace(UNIT_RE, '');
  const eNum = e.replace(UNIT_RE, '');
  if (aNum && /\d/.test(aNum) && aNum === eNum) {
    return { ...base, ok: true, mode: 'numeric' };
  }

  const limit = fuzzyLimit(e.length);
  if (limit > 0) {
    const d = levenshtein(a, e);
    if (d > 0 && d <= limit) return { ...base, ok: true, mode: 'fuzzy' };
  }

  return base;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function judge(question: Question, answer: string[]): JudgeResult {
  const key = question.answer.value;

  switch (question.type) {
    case 'single': {
      const picked = answer[0] ?? '';
      return { correct: picked !== '' && picked === key[0], mode: 'set' };
    }

    case 'judge': {
      const picked = answer[0] ?? '';
      return { correct: picked !== '' && picked === key[0], mode: 'set' };
    }

    case 'multiple': {
      const picked = [...answer].sort();
      const expected = [...key].sort();
      const correct = picked.length > 0 && sameSet(picked, expected);
      const extra = picked.filter((x) => !expected.includes(x));
      const missed = expected.filter((x) => !picked.includes(x));
      return { correct, mode: 'set', extra, missed };
    }

    case 'blank': {
      const blanks: BlankResult[] = key.map((expected, i) =>
        matchBlank(answer[i] ?? '', expected, question.answer.accepted),
      );
      const hit = blanks.filter((b) => b.ok).length;
      return {
        correct: hit === blanks.length,
        mode: hit > 0 && hit < blanks.length ? 'partial' : 'set',
        blanks,
      };
    }

    default:
      return { correct: false, mode: 'miss' };
  }
}

/** 把作答键值转成可读文本，用于反馈面板 */
export function describeAnswer(question: Question, keys: string[]): string {
  if (question.type === 'judge') {
    return keys[0] === 'T' ? '对（正确）' : '错（错误）';
  }
  if (question.type === 'blank') return keys.join(' / ');
  return keys
    .map((k) => {
      const opt = question.options.find((o) => o.key === k);
      return opt ? `${k}. ${opt.text}` : k;
    })
    .join('　');
}

/** 反馈结果条文案（见 docs/04 第 5.3 节） */
export function feedbackHeadline(question: Question, result: JudgeResult): string {
  if (result.correct) {
    const fuzzy = result.blanks?.some((b) => b.mode === 'fuzzy' || b.mode === 'synonym');
    return fuzzy ? '判为正确（与你输入不完全一致）' : '回答正确';
  }
  if (result.mode === 'partial' && result.blanks) {
    const hit = result.blanks.filter((b) => b.ok).length;
    return `${result.blanks.length} 个空对了 ${hit} 个`;
  }
  if (question.type === 'multiple') {
    const parts: string[] = [];
    if (result.missed?.length) parts.push(`少选了 ${result.missed.length} 个`);
    if (result.extra?.length) parts.push(`多选了 ${result.extra.length} 个`);
    return parts.length ? `回答错误（${parts.join('，')}）` : '回答错误';
  }
  if (question.type === 'judge') {
    return `回答错误（正确答案是「${question.answer.display}」）`;
  }
  return '回答错误';
}

/* -------------------------------------------------------------- 大题评分 */

export interface EssayScore {
  score: number;
  total: number;
  hits: { index: number; hit: boolean; text: string; score: number }[];
}

/**
 * 大题踩分点命中评分。
 * 说明：结果仅作提示，不作终判 —— 界面必须引导用户自行核对（见 docs/04 第 5 节）。
 */
export function scoreEssay(essay: Essay, input: string): EssayScore {
  const text = normalize(input);
  let score = 0;
  const hits = essay.keyPoints.map((kp, index) => {
    const candidates = [kp.text, ...(kp.aliases ?? [])].map(normalize).filter(Boolean);
    const hit = candidates.some((c) => text.includes(c));
    if (hit) score += kp.score;
    return { index, hit, text: kp.text, score: kp.score };
  });
  return { score, total: essay.totalScore, hits };
}
