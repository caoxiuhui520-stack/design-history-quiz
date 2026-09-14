import { describe, expect, it } from 'vitest';
import { feedbackHeadline, judge } from './grader';
import { cn2num, fuzzyLimit, isSynonym, levenshtein, normalize } from './normalize';
import { questions } from './data';
import { BOX_INTERVAL, buildReviewQueue, createRecord, dueCount, updateRecord } from './scheduler';
import { shuffleQuestionOptions } from './practice';
import type { QRecord, Question } from './types';

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

describe('复习队列优先级', () => {
  const now = 1_000_000;
  const mk = (id: string): Question => ({ ...singleQ, id, answer: { value: ['A'], display: 'A', accepted: ['A'] } });
  const list = [mk('fresh'), mk('wrong'), mk('due'), mk('done')];

  const records: Record<string, QRecord> = {
    wrong: { ...createRecord(now), seen: 2, box: 0, due: now - 1 },
    due: { ...createRecord(now), seen: 2, box: 2, due: now - 1 },
    done: { ...createRecord(now), seen: 1, box: 2, due: now + 999_999 },
  };

  it('顺序为 错题 → 到期 → 新题', () => {
    const queue = buildReviewQueue(list, records, { now, limit: 10 });
    expect(queue.map((q) => q.id)).toEqual(['wrong', 'due', 'fresh']);
  });

  it('未到期且已作答的题不进队列', () => {
    const queue = buildReviewQueue(list, records, { now, limit: 10 });
    expect(queue.map((q) => q.id)).not.toContain('done');
  });

  it('limit 生效', () => {
    expect(buildReviewQueue(list, records, { now, limit: 2 })).toHaveLength(2);
  });

  it('dueCount 分类计数', () => {
    const c = dueCount(list, records, now);
    expect(c).toEqual({ wrong: 1, due: 1, fresh: 1, total: 3 });
  });
});
