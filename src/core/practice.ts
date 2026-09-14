import {
  TYPE_LABEL,
  buildReviewQueue,
  questionWeight,
  shuffle,
  weightedSample,
} from './scheduler';
import type { QRecord, Question, QuestionType } from './types';

export interface PracticeSpec {
  mode: 'all' | 'type' | 'chapter' | 'wrong' | 'due';
  type?: QuestionType;
  chapter?: string;
  /**
   * 出题顺序：
   *   smart    —— 按权重抽样（默认）：没刷过的优先，错的多的多出现，熟了的少出现
   *   random   —— 完全随机
   *   sequence —— 按题库顺序
   */
  order?: 'sequence' | 'random' | 'smart';
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
  rand: () => number = Math.random,
): PracticeSessionSpec {
  const order = spec.order ?? 'smart';
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
      // 「今日复习」本身已经是按权重抽的，不再叠加排序
      list = buildReviewQueue(all, records, { now, limit: spec.limit ?? 60, rand });
      label = `今日复习 ${list.length} 题`;
      return { label, questions: list };
    }
    default:
      list = [...all];
      label = `全量题库`;
  }

  if (order === 'random') {
    list = shuffle(list);
    label += ' · 乱序';
  } else if (order === 'smart') {
    // 按权重做无放回抽样，得到一个「最该刷的排前面」的整体顺序
    const weights = list.map((q) => questionWeight(records[q.id], now));
    list = weightedSample(list, weights, list.length, rand);
    label += ' · 智能排序';
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

/**
 * 选项乱序：打乱单选 / 多选的选项显示顺序，并**重新编号**。
 *
 * 为什么不能只调换顺序、保留原编号：那样会出现「屏幕上第一项是 C、
 * 正确答案却写着 A」的错位，用户没法把答案和选项对上。
 * 所以这里按新的显示顺序重排 A/B/C/D/E，并把 answer.value 一并映射过去。
 *
 * 判分仍按字母比较，因此映射后正确性不变（有测试覆盖全部选择题）。
 * 判断题只有「正确 / 错误」两项，乱序反而容易误导，不处理。
 */
export function shuffleQuestionOptions(q: Question): Question {
  if (q.type !== 'single' && q.type !== 'multiple') return q;
  if (q.options.length < 2) return q;

  const letters = 'ABCDE';
  const order = shuffle(q.options);
  const keyMap = new Map<string, string>();

  const options = order.map((opt, i) => {
    const nextKey = letters[i];
    keyMap.set(opt.key, nextKey);
    return { key: nextKey, text: opt.text };
  });

  const value = q.answer.value.map((k) => keyMap.get(k) ?? k);
  const display = q.type === 'multiple' ? value.join('') : value[0] ?? '';

  return {
    ...q,
    options,
    answer: { ...q.answer, value, display, accepted: [...value] },
  };
}

/** 是否需要乱序：按用户偏好决定 */
export function maybeShuffleOptions(
  list: Question[],
  enabled: boolean,
): Question[] {
  return enabled ? list.map(shuffleQuestionOptions) : list;
}
