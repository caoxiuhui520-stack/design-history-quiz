import { describe, expect, it } from 'vitest';
import { feedbackHeadline, judge } from './grader';
import { cn2num, fuzzyLimit, isSynonym, levenshtein, normalize } from './normalize';
import { questions } from './data';
import {
  BOX_INTERVAL,
  buildReviewQueue,
  createRecord,
  dueCount,
  questionStatus,
  questionWeight,
  updateRecord,
  weightedSample,
} from './scheduler';
import { buildPractice, shuffleQuestionOptions } from './practice';
import type { QRecord, Question } from './types';

/**
 * 测试用确定性伪随机（mulberry32）。
 * 不要用线性同余：连续种子的首个输出存在相关性，会让「抽样比例」的统计断言偏差，
 * 从而把「逻辑没问题」误判成失败（这个坑踩过一次）。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ normalize */

describe('normalize 答案归一化', () => {
  it('全角 → 半角', () => {
    expect(normalize('ＡＴ＆Ｔ')).toBe('att');
    expect(normalize('１９２２')).toBe('1922');
  });

  it('去除间隔号差异（· ・ · 都归零）', () => {
    expect(normalize('密斯·凡·德·洛')).toBe(normalize('密斯・凡・德・洛'));
    expect(normalize('约翰· 纳什')).toBe(normalize('约翰·纳什'));
  });

  it('去除首尾与中间空白、标点', () => {
    expect(normalize(' 水晶宫。 ')).toBe('水晶宫');
    expect(normalize('.新艺术运动')).toBe('新艺术运动');
    expect(normalize('1922')).toBe('1922');
  });

  it('中文数字 → 阿拉伯数字', () => {
    expect(normalize('一九二二')).toBe('1922');
    expect(normalize('二十')).toBe('20');
    expect(normalize('十二')).toBe('12');
    expect(normalize('一百二十三')).toBe('123');
    expect(cn2num('〇')).toBe('0');
  });

  it('英文大小写归一', () => {
    expect(normalize('AEG')).toBe('aeg');
  });
});

describe('levenshtein 与容错阈值', () => {
  it('编辑距离', () => {
    expect(levenshtein('杜塞尔多夫', '杜塞多夫')).toBe(1);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('短答案从严、长答案放宽', () => {
    expect(fuzzyLimit(2)).toBe(0);
    expect(fuzzyLimit(5)).toBe(1);
    expect(fuzzyLimit(8)).toBe(2);
  });
});

describe('同义词表', () => {
  it('译名差异互认', () => {
    expect(isSynonym(normalize('格罗佩斯'), normalize('格罗皮乌斯'))).toBe(true);
    expect(isSynonym(normalize('柯比意'), normalize('勒·柯布西耶'))).toBe(true);
    expect(isSynonym(normalize('分离派'), normalize('维也纳分离派'))).toBe(true);
  });

  it('不同概念不互认', () => {
    expect(isSynonym(normalize('塔特林'), normalize('李西斯基'))).toBe(false);
  });
});

/* ------------------------------------------------------------ 标准答案回归 */

describe('标准答案自测：78 题用标准答案作答必须全部判对', () => {
  it.each(questions.map((q) => [q.id, q] as [string, Question]))(
    '%s 用标准答案判为正确',
    (id, q) => {
      const result = judge(q, q.answer.value);
      // 这条断言同时验证了「数据正确」与「判分逻辑正确」
      expect(result.correct, `${id} 用标准答案却判错`).toBe(true);
    },
  );

  it('题目总数为 107（作业 78 + 复习资料补充 29）', () => {
    expect(questions.length).toBe(107);
  });
});

/* ---------------------------------------------------------------- grader */

const blankQ: Question = {
  id: 't-blank',
  type: 'blank',
  chapter: '测试',
  stem: '[?]年，[?]',
  options: [],
  answer: { value: ['1922', '杜塞尔多夫'], display: '1922；杜塞尔多夫', accepted: ['1922', '杜塞尔多夫'] },
  explain: '',
  tags: [],
  source: { homework: 0, workId: '', no: 1, typeName: '填空题' },
  stemParts: ['', '年，', ''],
  blankCount: 2,
};

describe('填空题判分', () => {
  it('完全一致判对', () => {
    const r = judge(blankQ, ['1922', '杜塞尔多夫']);
    expect(r.correct).toBe(true);
    expect(r.blanks?.every((b) => b.mode === 'exact')).toBe(true);
  });

  it('带单位「年」仍判对', () => {
    const r = judge(blankQ, ['1922年', '杜塞尔多夫']);
    expect(r.correct).toBe(true);
    expect(r.blanks?.[0].mode).toBe('numeric');
  });

  it('中文数字写法判对', () => {
    expect(judge(blankQ, ['一九二二', '杜塞尔多夫']).correct).toBe(true);
  });

  it('标点与空格差异判对', () => {
    expect(judge(blankQ, [' 1922 ', '杜塞尔多夫。']).correct).toBe(true);
  });

  it('同义词判对', () => {
    const q: Question = {
      ...blankQ,
      answer: { value: ['格罗皮乌斯'], display: '格罗皮乌斯', accepted: ['格罗皮乌斯'] },
      blankCount: 1,
    };
    expect(judge(q, ['格罗佩斯']).correct).toBe(true);
  });

  it('编辑距离容错判对', () => {
    const q: Question = {
      ...blankQ,
      answer: { value: ['杜塞尔多夫'], display: '杜塞尔多夫', accepted: ['杜塞尔多夫'] },
      blankCount: 1,
    };
    expect(judge(q, ['杜塞多夫']).correct).toBe(true);
  });

  it('短答案不允许模糊（避免误判为对）', () => {
    const q: Question = {
      ...blankQ,
      answer: { value: ['巴黎'], display: '巴黎', accepted: ['巴黎'] },
      blankCount: 1,
    };
    expect(judge(q, ['巴离']).correct).toBe(false);
  });

  it('部分正确时给出逐空明细', () => {
    const r = judge(blankQ, ['1922', '巴黎']);
    expect(r.correct).toBe(false);
    expect(r.mode).toBe('partial');
    expect(r.blanks?.map((b) => b.ok)).toEqual([true, false]);
  });
});

const singleQ: Question = {
  id: 't-single',
  type: 'single',
  chapter: '测试',
  stem: '题干',
  options: [
    { key: 'A', text: '甲' },
    { key: 'B', text: '乙' },
  ],
  answer: { value: ['A'], display: 'A', accepted: ['A'] },
  explain: '',
  tags: [],
  source: { homework: 0, workId: '', no: 1, typeName: '单选题' },
};

describe('单选题判分', () => {
  it('选对判对', () => expect(judge(singleQ, ['A']).correct).toBe(true));
  it('选错判错', () => expect(judge(singleQ, ['B']).correct).toBe(false));
  it('空答判错', () => expect(judge(singleQ, []).correct).toBe(false));
});

const multiQ: Question = {
  ...singleQ,
  id: 't-multi',
  type: 'multiple',
  options: [
    { key: 'A', text: '甲' },
    { key: 'B', text: '乙' },
    { key: 'C', text: '丙' },
    { key: 'D', text: '丁' },
  ],
  answer: { value: ['A', 'B', 'C'], display: 'ABC', accepted: ['A', 'B', 'C'] },
};

describe('多选题判分（严格集合相等）', () => {
  it('全对判对', () => expect(judge(multiQ, ['A', 'B', 'C']).correct).toBe(true));
  it('顺序不同仍判对', () => expect(judge(multiQ, ['C', 'A', 'B']).correct).toBe(true));
  it('漏选判错并列出漏项', () => {
    const r = judge(multiQ, ['A', 'B']);
    expect(r.correct).toBe(false);
    expect(r.missed).toEqual(['C']);
  });
  it('多选判错并列出多项', () => {
    const r = judge(multiQ, ['A', 'B', 'C', 'D']);
    expect(r.correct).toBe(false);
    expect(r.extra).toEqual(['D']);
  });
});

const judgeQ: Question = {
  ...singleQ,
  id: 't-judge',
  type: 'judge',
  options: [],
  answer: { value: ['F'], display: '错', accepted: ['错'] },
};

describe('判断题判分', () => {
  it('答对判对', () => expect(judge(judgeQ, ['F']).correct).toBe(true));
  it('答错判错', () => expect(judge(judgeQ, ['T']).correct).toBe(false));
  it('错误文案带出正确答案', () => {
    expect(feedbackHeadline(judgeQ, judge(judgeQ, ['T']))).toContain('错');
  });
});

/* -------------------------------------------------------------- 选项乱序 */

describe('选项乱序（防止背位置）', () => {
  const choiceQs = questions.filter((q) => q.type === 'single' || q.type === 'multiple');

  it('覆盖全部 54 道选择题（作业 37 + 复习资料补充 17）', () => {
    expect(choiceQs.length).toBe(54);
  });

  it('乱序后编号连续、答案文本集合不变、判分仍正确', () => {
    for (const q of choiceQs) {
      const s = shuffleQuestionOptions(q);
      const id = q.id;

      expect(s.options.length, `${id} 选项数量不变`).toBe(q.options.length);

      s.options.forEach((o, i) => {
        expect(o.key, `${id} 第 ${i} 项编号应为 ${'ABCDE'[i]}`).toBe('ABCDE'[i]);
      });

      // 答案经过重编号后，指向的文本必须和原来完全一致
      const before = q.answer.value.map((k) => q.options.find((o) => o.key === k)!.text).sort();
      const after = s.answer.value.map((k) => s.options.find((o) => o.key === k)!.text).sort();
      expect(after, `${id} 答案文本集合不变`).toEqual(before);

      expect(judge(s, s.answer.value).correct, `${id} 用重编号后的答案应判对`).toBe(true);
    }
  });

  it('同一题多次乱序，答案文本集合始终一致', () => {
    const q = questions.find((x) => x.id === 'hw3-q14')!; // 五选多的高迪题
    const baseline = q.answer.value.map((k) => q.options.find((o) => o.key === k)!.text).sort();
    for (let i = 0; i < 20; i++) {
      const s = shuffleQuestionOptions(q);
      const now = s.answer.value.map((k) => s.options.find((o) => o.key === k)!.text).sort();
      expect(now, `第 ${i} 次乱序`).toEqual(baseline);
    }
  });

  it('判断题 / 填空题不做乱序', () => {
    const j = questions.find((x) => x.type === 'judge')!;
    const b = questions.find((x) => x.type === 'blank')!;
    expect(shuffleQuestionOptions(j)).toBe(j);
    expect(shuffleQuestionOptions(b)).toBe(b);
  });
});

/* -------------------------------------------------------------- scheduler */

describe('Leitner 调度', () => {
  const now = 1_000_000;

  it('新记录为盒 0 且立即到期', () => {
    const rec = createRecord(now);
    expect(rec.box).toBe(0);
    expect(rec.due).toBe(now);
  });

  it('答对升盒并按盒间隔排期', () => {
    let rec: QRecord | undefined;
    rec = updateRecord(rec, true, ['A'], now);
    expect(rec.box).toBe(1);
    expect(rec.due).toBe(now + BOX_INTERVAL[1]);
    rec = updateRecord(rec, true, ['A'], now);
    expect(rec.box).toBe(2);
  });

  it('答错回盒 0 并在 10 分钟内重现', () => {
    const rec = updateRecord(updateRecord(undefined, true, ['A'], now), false, ['B'], now);
    expect(rec.box).toBe(0);
    expect(rec.due).toBe(now + BOX_INTERVAL[0]);
    expect(rec.streak).toBe(0);
    expect(rec.lapses).toBe(1);
  });

  it('盒上限为 4', () => {
    let rec: QRecord | undefined;
    for (let i = 0; i < 8; i++) rec = updateRecord(rec, true, ['A'], now);
    expect(rec!.box).toBe(4);
  });
});

describe('出题权重：没刷过的优先、错的多的多出现、熟了的沉底', () => {
  const now = 1_000_000;
  const day = 86_400_000;
  const rec = (over: Partial<QRecord>): QRecord => ({ ...createRecord(now), seen: 1, ...over });

  const fresh = () => questionWeight(undefined, now);
  // 刷得少：只见过 1 次且答错
  const thin = () => questionWeight(rec({ seen: 1, correct: 0, wrong: 1, box: 0, due: now - 1 }), now);
  // 错得多：见过 4 次，只对 1 次，累计错 3 次，逾期 3 天
  const weak = () =>
    questionWeight(
      rec({ seen: 4, correct: 1, wrong: 3, lapses: 3, box: 0, due: now - 3 * day }),
      now,
    );
  // 基本都对，但还没完全掌握
  const okay = () =>
    questionWeight(rec({ seen: 3, correct: 2, wrong: 1, lapses: 1, box: 2, due: now - 2 * day }), now);
  // 已掌握：连对多次、box=4、还没到复习时间
  const mastered = () =>
    questionWeight(rec({ seen: 6, correct: 6, box: 4, due: now + day }), now);

  it('新题权重最高', () => {
    expect(fresh()).toBeGreaterThan(weak());
    expect(fresh()).toBeGreaterThan(thin());
    expect(fresh()).toBeGreaterThan(okay());
    expect(fresh()).toBeGreaterThan(mastered());
  });

  it('刷得少的、错得多的都高于「基本都对」的', () => {
    expect(thin()).toBeGreaterThan(okay());
    expect(weak()).toBeGreaterThan(okay());
  });

  it('已掌握的权重最低，但仍然 > 0（少出现 ≠ 不出现）', () => {
    expect(okay()).toBeGreaterThan(mastered());
    expect(mastered()).toBeGreaterThan(0);
    // 熟题出现的概率应当远低于新题
    expect(mastered()).toBeLessThan(fresh() / 10);
  });

  it('正确率相同的两题，进盒越深权重越低', () => {
    const base = { seen: 4, correct: 2, wrong: 2, lapses: 2, due: now - 2 * day } as const;
    const shallow = questionWeight(rec({ ...base, box: 1 }), now);
    const deep = questionWeight(rec({ ...base, box: 4 }), now);
    expect(shallow).toBeGreaterThan(deep);
  });

  it('逾期越久权重越高', () => {
    const a = questionWeight(rec({ seen: 3, correct: 1, wrong: 2, box: 0, due: now }), now);
    const b = questionWeight(rec({ seen: 3, correct: 1, wrong: 2, box: 0, due: now - 5 * day }), now);
    expect(b).toBeGreaterThan(a);
  });

  it('还没到复习时间的题会被降权', () => {
    const notDue = questionWeight(rec({ seen: 3, correct: 0, wrong: 3, box: 0, due: now + day }), now);
    const dueNow = questionWeight(rec({ seen: 3, correct: 0, wrong: 3, box: 0, due: now - 1 }), now);
    expect(dueNow).toBeGreaterThan(notDue);
  });
});

describe('weightedSample：按权重抽样', () => {
  const items = ['A', 'B', 'C'];

  it('权重全为 0 时退化为按原顺序取，不空转', () => {
    expect(weightedSample(items, [0, 0, 0], 2, mulberry32(1))).toEqual(['A', 'B']);
  });

  it('取满时是原集合的一个排列，不重不漏', () => {
    const out = weightedSample(items, [1, 2, 3], 3, mulberry32(7));
    expect([...out].sort()).toEqual(['A', 'B', 'C']);
    expect(out).toHaveLength(3);
  });

  it('n 大于总数时最多返回全部', () => {
    expect(weightedSample(items, [1, 1, 1], 99, mulberry32(3))).toHaveLength(3);
  });

  it('权重极低的项几乎不出现在小样本里', () => {
    // 100 个高权重 + 1 个几乎为 0 的项，反复抽 1 个：低权重项被抽中的次数应极少
    const pool = [...Array.from({ length: 100 }, (_, i) => `big${i}`), 'tiny'];
    const weights = [...Array(100).fill(1000), 0.001];
    let tinyHits = 0;
    for (let s = 0; s < 300; s++) {
      if (weightedSample(pool, weights, 1, mulberry32(s + 1))[0] === 'tiny') tinyHits += 1;
    }
    expect(tinyHits).toBeLessThan(5);
  });

  it('权重高的项被抽中的比例接近其权重占比（3:1 → 约 75%）', () => {
    let first = 0;
    const RUNS = 4000;
    for (let s = 0; s < RUNS; s++) {
      if (weightedSample(['x', 'y'], [3, 1], 1, mulberry32(s + 1))[0] === 'x') first += 1;
    }
    const ratio = first / RUNS;
    expect(ratio).toBeGreaterThan(0.72);
    expect(ratio).toBeLessThan(0.78);
  });
});

describe('复习队列：按权重出题', () => {
  const now = 1_000_000;
  const day = 86_400_000;
  const mk = (id: string): Question => ({
    ...singleQ,
    id,
    answer: { value: ['A'], display: 'A', accepted: ['A'] },
  });
  const list = [mk('fresh'), mk('weak'), mk('done')];

  const records: Record<string, QRecord> = {
    weak: { ...createRecord(now), seen: 4, correct: 1, wrong: 3, lapses: 3, box: 0, due: now - 3 * day },
    done: { ...createRecord(now), seen: 6, correct: 6, box: 4, due: now + day },
  };

  /** 多次抽样统计各题被选中的频率 */
  function hitRate(limit: number, runs = 400) {
    const count: Record<string, number> = { fresh: 0, weak: 0, done: 0 };
    for (let s = 0; s < runs; s++) {
      const rand = mulberry32(s + 1);
      for (const q of buildReviewQueue(list, records, { now, limit, rand })) count[q.id] += 1;
    }
    return count;
  }

  it('新题与错题的命中率明显高于已掌握的题', () => {
    const c = hitRate(2);
    expect(c.fresh).toBeGreaterThan(c.done);
    expect(c.weak).toBeGreaterThan(c.done);
  });

  it('已掌握的题只是「少出现」，仍会被抽到', () => {
    const c = hitRate(3, 200);
    expect(c.done).toBeGreaterThan(0);
  });

  it('limit 生效', () => {
    const rand = () => 0.5;
    expect(buildReviewQueue(list, records, { now, limit: 2, rand })).toHaveLength(2);
    expect(buildReviewQueue(list, records, { now, limit: 1, rand })).toHaveLength(1);
  });

  it('dueCount 分类计数不受影响', () => {
    const c = dueCount(list, records, now);
    expect(c).toEqual({ wrong: 1, due: 0, fresh: 1, total: 2 });
  });
});

describe('buildPractice：智能排序是默认出题方式', () => {
  const now = 1_000_000;
  const day = 86_400_000;
  const mk = (id: string): Question => ({
    ...singleQ,
    id,
    answer: { value: ['A'], display: 'A', accepted: ['A'] },
  });
  const all = [mk('a'), mk('b'), mk('c'), mk('d')];
  const records: Record<string, QRecord> = {
    a: { ...createRecord(now), seen: 6, correct: 6, box: 4, due: now + day }, // 已掌握
    b: { ...createRecord(now), seen: 4, correct: 1, wrong: 3, lapses: 3, box: 0, due: now - day },
  };
  // c、d 没有记录 → 视作新题

  it('默认即为 smart 顺序', () => {
    const s = buildPractice({ mode: 'all' }, all, records, now);
    expect(s.label).toContain('智能排序');
  });

  it('小批量出题时，新题几乎占满名额，已掌握的很少被抽到', () => {
    let masteredPicks = 0;
    let freshPicks = 0;
    const RUNS = 300;
    for (let s = 0; s < RUNS; s++) {
      const rand = mulberry32(s + 1);
      for (const q of buildPractice({ mode: 'all', limit: 2 }, all, records, now, rand).questions) {
        if (q.id === 'a') masteredPicks += 1;
        if (q.id === 'c' || q.id === 'd') freshPicks += 1;
      }
    }
    expect(freshPicks).toBeGreaterThan(masteredPicks * 3);
  });

  it('明确指定 random 时不走智能排序', () => {
    const s = buildPractice({ mode: 'all', order: 'random' }, all, records, now);
    expect(s.label).toContain('乱序');
  });

  it('明确指定 sequence 时保持题库顺序', () => {
    const s = buildPractice({ mode: 'all', order: 'sequence' }, all, records, now);
    expect(s.questions.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('limit 会把权重最高的那批留下', () => {
    const s = buildPractice({ mode: 'all', limit: 2 }, all, records, now, () => 0.99);
    expect(s.questions).toHaveLength(2);
  });
});

describe('题目状态标签', () => {
  const now = 1_000_000;
  const rec = (over: Partial<QRecord>): QRecord => ({ ...createRecord(now), ...over });

  it('没记录 → 新题', () => {
    expect(questionStatus(undefined)).toBe('new');
    expect(questionStatus(rec({ seen: 0 }))).toBe('new');
  });

  it('错得多且正确率低 → 待加强', () => {
    expect(questionStatus(rec({ seen: 3, correct: 1, wrong: 2, box: 0 }))).toBe('weak');
  });

  it('高正确率或多轮连对 → 已掌握', () => {
    expect(questionStatus(rec({ seen: 5, correct: 5, box: 4 }))).toBe('mastered');
    expect(questionStatus(rec({ seen: 3, correct: 3, box: 2 }))).toBe('mastered');
  });

  it('中间状态 → 巩固中', () => {
    expect(questionStatus(rec({ seen: 3, correct: 2, wrong: 1, box: 2 }))).toBe('learning');
  });
});
