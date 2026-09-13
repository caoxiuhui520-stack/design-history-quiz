/** 全局类型定义。字段规范见 docs/03-知识库与数据规范.md */

export type QuestionType = 'single' | 'multiple' | 'judge' | 'blank';

export interface Option {
  key: string;
  text: string;
}

export interface Answer {
  /** 机器判分用：选项字母数组 / ["T"|"F"] / 填空答案数组 */
  value: string[];
  /** 展示用 */
  display: string;
  /** 容错候选 */
  accepted: string[];
}

export interface QuestionSource {
  homework: number;
  workId: string;
  no: number;
  typeName: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  chapter: string;
  stem: string;
  options: Option[];
  answer: Answer;
  explain: string;
  tags: string[];
  source: QuestionSource;
  /** 填空题：按 [??] 切分的题干片段，长度 = 空位数 + 1 */
  stemParts?: string[];
  blankCount?: number;
}

export interface Bank {
  schemaVersion: string;
  course: string;
  generatedFrom: { homework: number; workId: string; file: string }[];
  stats: {
    total: number;
    byType: Record<string, number>;
    byChapter: Record<string, number>;
  };
  questions: Question[];
}

export interface ConceptCard {
  id: string;
  chapter: string;
  title: string;
  aliases: string[];
  definition: string;
  points: string[];
  slides: number[];
  tags: string[];
  examType: string[];
}

export interface ConceptBank {
  schemaVersion: string;
  course: string;
  source: string;
  usage: string;
  cards: ConceptCard[];
}

export interface KeyPoint {
  text: string;
  aliases: string[];
  score: number;
}

export interface Essay {
  id: string;
  chapter: string;
  title: string;
  prompt: string;
  totalScore: number;
  keyPoints: KeyPoint[];
  reference: string;
  slides: number[];
  relatedQuestions: string[];
}

export interface EssayBank {
  schemaVersion: string;
  course: string;
  description: string;
  essays: Essay[];
}

/* ---------------------------------------------------------- 解析与知识地图 */

export interface ExplanationBank {
  schemaVersion: string;
  course: string;
  description: string;
  explanations: Record<string, string>;
}

export interface EraFigure {
  name: string;
  note: string;
}

export interface Era {
  id: string;
  title: string;
  span: string;
  century: string;
  kind: string;
  regions: string[];
  moves: string[];
  summary: string;
  points: string[];
  figures: EraFigure[];
  works: EraFigure[];
  questions: string[];
  bridge: string | null;
}

export interface TimelineLink {
  from: string;
  to: string;
  label: string;
}

export interface Confusion {
  pair: string[];
  note: string;
}

export interface TimelineBank {
  schemaVersion: string;
  course: string;
  description: string;
  eras: Era[];
  links: TimelineLink[];
  confusions: Confusion[];
}

/* ------------------------------------------------------------------ 判分 */

export type JudgeMode = 'exact' | 'alias' | 'synonym' | 'numeric' | 'fuzzy' | 'miss';

export interface BlankResult {
  input: string;
  expected: string;
  ok: boolean;
  mode: JudgeMode;
}

export interface JudgeResult {
  correct: boolean;
  /** set = 单/多选按集合判定；partial = 填空部分正确 */
  mode: JudgeMode | 'set' | 'partial';
  blanks?: BlankResult[];
  /** 多选：多选的项 */
  extra?: string[];
  /** 多选：漏选的项 */
  missed?: string[];
}

/* -------------------------------------------------------------- 记忆状态 */

export interface QRecord {
  /** 作答次数 */
  seen: number;
  correct: number;
  wrong: number;
  lastAnswer: string[];
  lastCorrect: boolean;
  lastWrongInput?: string[];
  lastAt: number;
  /** Leitner 盒 0–4 */
  box: 0 | 1 | 2 | 3 | 4;
  /** 下次到期时间戳 */
  due: number;
  streak: number;
  lapses: number;
}

export interface ProgressStore {
  version: number;
  records: Record<string, QRecord>;
  totals: {
    answered: number;
    correct: number;
    sessions: number;
    startedAt: number;
  };
  prefs: {
    nickname: string;
    shuffleOptions: boolean;
  };
}

/* ---------------------------------------------------------------- 练习 */

export interface PracticeConfig {
  mode: 'sequence' | 'random' | 'wrongOnly' | 'due' | 'chapter' | 'type';
  label: string;
  questions: Question[];
}
