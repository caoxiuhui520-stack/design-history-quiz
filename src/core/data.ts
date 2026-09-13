/**
 * 数据装配层。
 *
 * 题库 JSON 采用**打包进产物**（Vite 原生 JSON import）而不是运行期 fetch，原因：
 *   1. 没有网络请求 → 不会白屏、不会 404、不受 Pages 子路径影响；
 *   2. 数据随 JS 一起被缓存 → 离线天然可用；
 *   3. 更新题库只需重新部署（本项目走 Actions 自动构建，成本为零）。
 * 代价是改题库需要重新构建，对本场景无影响。
 *
 * `explanations.json` 是人工撰写的策展内容，与脚本生成的 questions.json 分开存放，
 * 在这里按 id 合并进题目对象 —— 这样重跑 parse_bank.py 不会覆盖掉人工解析。
 */

import bankJson from '../../data/questions.json';
import conceptsJson from '../../data/concepts.json';
import essaysJson from '../../data/essays.json';
import explanationsJson from '../../data/explanations.json';
import timelineJson from '../../data/timeline.json';
import type {
  Bank,
  ConceptBank,
  Era,
  Essay,
  EssayBank,
  ExplanationBank,
  Question,
  TimelineBank,
} from './types';

export const bank = bankJson as unknown as Bank;
export const conceptBank = conceptsJson as unknown as ConceptBank;
export const essayBank = essaysJson as unknown as EssayBank;
export const explanationBank = explanationsJson as unknown as ExplanationBank;
export const timelineBank = timelineJson as unknown as TimelineBank;

/** 合并人工解析后的题库 */
export const questions: Question[] = bank.questions.map((q) => ({
  ...q,
  explain: explanationBank.explanations[q.id] || q.explain || '',
}));

export const concepts = conceptBank.cards;
export const essays: Essay[] = essayBank.essays;
export const eras: Era[] = timelineBank.eras;

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

export function questionsByIds(ids: string[]): Question[] {
  return ids.map((id) => INDEX.get(id)).filter((q): q is Question => Boolean(q));
}

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

/** 某时期包含的题目数量（知识地图上显示） */
export function eraQuestionCount(era: Era): number {
  return questionsByIds(era.questions).length;
}

/* ------------------------------------------------------------ 高亮词典 */

/**
 * 从题库标签 + 知识地图动态构建高亮词典，避免维护一份会过期的独立词表。
 * 概念类词条归入 move（中性加粗），因为它们的视觉角色与运动名一致。
 */
function buildRichDict() {
  const person = new Set<string>();
  const work = new Set<string>();
  const move = new Set<string>();

  const eat = (tag: string) => {
    const [kind, name] = tag.split(':');
    if (!name) return;
    if (kind === '人物') person.add(name);
    else if (kind === '作品') work.add(name);
    else if (kind === '运动' || kind === '概念') move.add(name);
  };

  for (const q of questions) q.tags.forEach(eat);
  for (const era of eras) {
    era.figures.forEach((f) => person.add(f.name));
    era.works.forEach((w) => work.add(w.name));
    era.moves.forEach((m) => move.add(m));
  }
  for (const card of concepts) {
    move.add(card.title);
    card.aliases.forEach((a) => move.add(a));
  }

  return {
    person: [...person].sort((a, b) => b.length - a.length),
    work: [...work].sort((a, b) => b.length - a.length),
    move: [...move].sort((a, b) => b.length - a.length),
  };
}

export const richDict = buildRichDict();

/** 知识地图上的「易混淆对照」，供脉络页与解析页复用 */
export const confusions = timelineBank.confusions;
export const timelineLinks = timelineBank.links;

