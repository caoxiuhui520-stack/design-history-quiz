import { TYPE_LABEL, buildReviewQueue, shuffle } from './scheduler';
import type { QRecord, Question, QuestionType } from './types';

export interface PracticeSpec {
  mode: 'all' | 'type' | 'chapter' | 'wrong' | 'due';
  type?: QuestionType;
  chapter?: string;
  order?: 'sequence' | 'random';
  limit?: number;
}

export interface PracticeSessionSpec {
  label: string;
  questions: Question[];
}

/**
 * 把界面上的选择翻译成一份可执行的题单。
 * 所有筛选都走这里 —— 界面层不直接操作题目数组，避免各处逻辑漂移。
 */
export function buildPractice(
  spec: PracticeSpec,
  all: Question[],
  records: Record<string, QRecord>,
  now = Date.now(),
): PracticeSessionSpec {
  const order = spec.order ?? 'sequence';
  let label = '';
  let list: Question[];

  switch (spec.mode) {
    case 'all': {
      list = [...all];
      label = `全量题库 ${list.length} 题`;
      break;
    }
    case 'type': {
      const t = spec.type!;
      list = all.filter((q) => q.type === t);
      label = `${TYPE_LABEL[t] ?? t} ${list.length} 题`;
      break;
    }
    case 'chapter': {
      list = all.filter((q) => q.chapter === spec.chapter);
      label = `${spec.chapter} ${list.length} 题`;
      break;
    }
    case 'wrong': {
      list = all.filter((q) => records[q.id] && records[q.id].box === 0);
      label = `错题重做 ${list.length} 题`;
      break;
    }
    case 'due': {
      list = buildReviewQueue(all, records, { now, limit: spec.limit ?? 60 });
      label = `今日复习 ${list.length} 题`;
      break;
    }
    default:
      list = [...all];
      label = `全量题库`;
  }

  if (order === 'random') {
    list = shuffle(list);
    label += ' · 乱序';
  }
  if (spec.limit && spec.limit < list.length) {
    list = list.slice(0, spec.limit);
    label = `${label.split(' ')[0]} 前 ${spec.limit} 题`;
  }

  return { label, questions: list };
}

/** 全选题型 / 章节时的选项列表 */
export function typeTiles(all: Question[]): { type: QuestionType; count: number }[] {
  const order: QuestionType[] = ['single', 'multiple', 'judge', 'blank'];
  return order
    .map((type) => ({ type, count: all.filter((q) => q.type === type).length }))
    .filter((x) => x.count > 0);
}
