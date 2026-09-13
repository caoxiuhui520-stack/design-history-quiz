/**
 * 数据装配层。
 *
 * 题库 JSON 采用**打包进产物**（Vite 原生 JSON import）而不是运行期 fetch，原因：
 *   1. 没有网络请求 → 不会白屏、不会 404、不受 Pages 子路径影响；
 *   2. 数据随 JS 一起被 PWA 预缓存 → 离线天然可用；
 *   3. 更新题库只需重新部署（本项目走 Actions 自动构建，成本为零）。
 * 代价是改题库需要重新构建，对本场景无影响。
 */

import bankJson from '../../data/questions.json';
import conceptsJson from '../../data/concepts.json';
import essaysJson from '../../data/essays.json';
import type { Bank, ConceptBank, Essay, EssayBank, Question } from './types';

export const bank = bankJson as unknown as Bank;
export const conceptBank = conceptsJson as unknown as ConceptBank;
export const essayBank = essaysJson as unknown as EssayBank;

export const questions: Question[] = bank.questions;
export const concepts = conceptBank.cards;
export const essays: Essay[] = essayBank.essays;

/** 考试日期（倒计时用） */
export const EXAM_DATE = '2026-09-15T08:00:00+08:00';

/** 章节展示顺序（按设计史时间线，而非题量） */
export const CHAPTER_ORDER = [
  '工业革命前设计',
  '工艺美术运动',
  '新艺术运动',
  '装饰艺术运动',
  '现代主义设计萌起',
  '包豪斯',
  '荷兰风格派',
  '俄国构成主义',
  '工业设计与国际主义',
  '后现代主义设计',
  '综合',
];

export function chapters(): string[] {
  const present = new Set(questions.map((q) => q.chapter));
  const ordered = CHAPTER_ORDER.filter((c) => present.has(c));
  const rest = [...present].filter((c) => !CHAPTER_ORDER.includes(c)).sort();
  return [...ordered, ...rest];
}

const INDEX = new Map(questions.map((q) => [q.id, q]));
export const questionById = (id: string): Question | undefined => INDEX.get(id);

/** 相关知识点：按标签把题目映射到知识卡 */
export function relatedConcepts(q: Question, limit = 3) {
  const tagSet = new Set(q.tags);
  const scored = concepts
    .map((card) => {
      let hit = card.tags.filter((t) => tagSet.has(t)).length;
      if (card.chapter === q.chapter) hit += 1;
      return { card, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  return scored.slice(0, limit).map((x) => x.card);
}

export function conceptsByChapter(): { chapter: string; cards: typeof concepts }[] {
  const map = new Map<string, typeof concepts>();
  for (const card of concepts) {
    const list = map.get(card.chapter) ?? [];
    list.push(card);
    map.set(card.chapter, list);
  }
  return [...map.entries()].map(([chapter, cards]) => ({ chapter, cards }));
}
