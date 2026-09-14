/**
 * 用真实题库验证加权出题的实际效果。
 *
 * 这组测试关心的是「一整个 15 题小批次里，各类题的配比是否合理」——
 * 单题权重正确不代表批次配比正确，必须在真实数据上统计才说明问题。
 */

import { afterAll, describe, expect, it } from 'vitest';
import { questions } from './data';
import { buildReviewQueue, questionWeight, createRecord } from './scheduler';
import type { QRecord } from './types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Group = 'fresh' | 'weak' | 'okay' | 'mastered';

/**
 * 造一个贴近真实使用的进度：总共 107 题
 *   前 40 题：完全没刷过
 *   接下来 25 题：薄弱（对 1 错 2，还在盒 0）
 *   接下来 25 题：一般（对 2 错 1，盒 2）
 *   最后 17 题：已掌握（连对 6 次，盒 4）
 */
function makeScenario() {
  const records: Record<string, QRecord> = {};
  const group: Record<string, Group> = {};

  questions.forEach((q, i) => {
    const r = createRecord(NOW);
    let g: Group;
    if (i < 40) {
      g = 'fresh';
    } else if (i < 65) {
      Object.assign(r, { seen: 3, correct: 1, wrong: 2, lapses: 2, box: 0, due: NOW - DAY });
      g = 'weak';
    } else if (i < 90) {
      Object.assign(r, { seen: 3, correct: 2, wrong: 1, lapses: 1, box: 2, due: NOW - DAY });
      g = 'okay';
    } else {
      Object.assign(r, { seen: 6, correct: 6, box: 4, due: NOW + DAY });
      g = 'mastered';
    }
    if (g !== 'fresh') records[q.id] = r;
    group[q.id] = g;
  });

  return { records, group };
}

function simulate(limit: number, runs: number) {
  const { records, group } = makeScenario();
  const tally: Record<Group, number> = { fresh: 0, weak: 0, okay: 0, mastered: 0 };
  for (let s = 0; s < runs; s++) {
    const picked = buildReviewQueue(questions, records, { now: NOW, limit, rand: mulberry32(s + 1) });
    for (const q of picked) tally[group[q.id]] += 1;
  }
  const total = runs * limit;
  return {
    tally,
    share: {
      fresh: tally.fresh / total,
      weak: tally.weak / total,
      okay: tally.okay / total,
      mastered: tally.mastered / total,
    },
  };
}

const single = simulate(15, 400);
const summary = [
  '每组 15 题，抽 400 次（共 6000 题次）的构成占比：',
  `  没刷过 (40 题)  ${(single.share.fresh * 100).toFixed(1)}%   期望最高`,
  `  薄弱   (25 题)  ${(single.share.weak * 100).toFixed(1)}%`,
  `  一般   (25 题)  ${(single.share.okay * 100).toFixed(1)}%`,
  `  已掌握 (17 题)  ${(single.share.mastered * 100).toFixed(1)}%   期望最低但不是 0`,
].join('\n');

afterAll(() => {
  // 让 `vitest run` 的输出里带上这份分布，便于人工核对
  console.log('\n' + summary + '\n');
});

describe('真实题库上的加权配比', () => {
  it('没刷过的题占比最高', () => {
    expect(single.share.fresh).toBeGreaterThan(single.share.weak);
    expect(single.share.fresh).toBeGreaterThan(single.share.okay);
    expect(single.share.fresh).toBeGreaterThan(single.share.mastered);
  });

  it('薄弱的题比「一般」的更容易被抽到（错得多 → 多出现）', () => {
    expect(single.share.weak).toBeGreaterThan(single.share.okay);
  });

  it('已掌握的题明显少出现，但不会完全不出现', () => {
    expect(single.share.mastered).toBeLessThan(0.12);
    expect(single.tally.mastered).toBeGreaterThan(0);
  });

  it('没刷过的题确实优先：占比明显高于它在题库中的题量占比（40/107≈37%）', () => {
    expect(single.share.fresh).toBeGreaterThan(0.45);
  });

  it('权重关系在真实数据上成立：新题 > 薄弱 > 一般 > 已掌握', () => {
    const { records } = makeScenario();
    const byGroup: Record<Group, number[]> = { fresh: [], weak: [], okay: [], mastered: [] };
    const { group } = makeScenario();
    for (const q of questions) byGroup[group[q.id]].push(questionWeight(records[q.id], NOW));

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const wFresh = avg(byGroup.fresh);
    const wWeak = avg(byGroup.weak);
    const wOkay = avg(byGroup.okay);
    const wMastered = avg(byGroup.mastered);

    expect(wFresh).toBeGreaterThan(wWeak);
    expect(wWeak).toBeGreaterThan(wOkay);
    expect(wOkay).toBeGreaterThan(wMastered);
    expect(wMastered).toBeGreaterThan(0);
  });
});
