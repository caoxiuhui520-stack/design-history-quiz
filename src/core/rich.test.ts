import { describe, expect, it } from 'vitest';
import { plain, tokenize, type RichDict } from './rich';
import { essays, questions, richDict } from './data';

const dict: RichDict = {
  person: ['密斯·凡·德·洛', '密斯', '莫里斯'],
  work: ['红屋'],
  move: ['工艺美术运动', '新艺术运动'],
};

const kindsOf = (text: string) => tokenize(text, dict).map((t) => `${t.kind}:${t.text}`);

describe('tokenize 关键词分词', () => {
  it('**双星号** 渲染为红色重点，且保留内部文字', () => {
    const tokens = tokenize('这是**重点内容**结束', dict);
    const em = tokens.find((t) => t.kind === 'em');
    expect(em?.text).toBe('重点内容');
    expect(tokens.map((t) => t.text).join('')).toBe('这是重点内容结束');
  });

  it('年份与世纪识别为时间', () => {
    expect(kindsOf('1919 年成立')).toContain('time:1919 年');
    expect(kindsOf('20 世纪 60 年代')).toContain('time:20 世纪 60 年代');
    expect(kindsOf('1895 — 1910')).toContain('time:1895 — 1910');
  });

  it('《书名号》识别为作品', () => {
    expect(kindsOf('代表作《红黄蓝椅子》')).toContain('work:《红黄蓝椅子》');
  });

  it('词典命中的人物识别为人物', () => {
    expect(kindsOf('莫里斯设计了这栋房子')).toContain('person:莫里斯');
  });

  it('长词优先，不会被短词抢先匹配', () => {
    // 词典里同时有「密斯」和「密斯·凡·德·洛」
    expect(kindsOf('密斯·凡·德·洛是校长')).toContain('person:密斯·凡·德·洛');
  });

  it('运动名识别为 move', () => {
    expect(kindsOf('工艺美术运动起源于英国')).toContain('move:工艺美术运动');
  });

  it('纯文本原样拼接，不丢字符', () => {
    const src = '**重点** 1919 年《红屋》由莫里斯建造，属于新艺术运动';
    expect(tokenize(src, dict).map((t) => t.text).join('')).toBe(plain(src));
  });

  it('空输入返回空数组', () => {
    expect(tokenize('', dict)).toEqual([]);
  });
});

describe('解析数据完整性', () => {
  it('78 题全部有非空解析', () => {
    const missing = questions.filter((q) => !q.explain.trim()).map((q) => q.id);
    expect(missing, `缺少解析：${missing.join(', ')}`).toEqual([]);
  });

  it('解析长度足够（不少于 20 字）', () => {
    const tooShort = questions.filter((q) => plain(q.explain).length < 20).map((q) => q.id);
    expect(tooShort, `解析过短：${tooShort.join(', ')}`).toEqual([]);
  });

  it('解析里不含残留的 ** 标记或分隔线', () => {
    const dirty = questions
      .filter((q) => q.explain.includes('**') === false && /^-{3,}$/.test(q.explain.trim()))
      .map((q) => q.id);
    expect(dirty).toEqual([]);
  });
});

describe('高亮词典', () => {
  it('从数据构建出的人物/作品/运动词条非空', () => {
    expect(richDict.person.length).toBeGreaterThan(10);
    expect(richDict.work.length).toBeGreaterThan(10);
    expect(richDict.move.length).toBeGreaterThan(5);
  });

  it('真实解析能被切出多个高亮片段', () => {
    const withExplain = questions.find((q) => q.id === 'hw1-q19');
    const tokens = tokenize(withExplain!.explain, richDict);
    const highlighted = tokens.filter((t) => t.kind !== 'text');
    expect(highlighted.length).toBeGreaterThanOrEqual(3);
  });
});

describe('大题数据完整性', () => {
  it('共 30 道，覆盖论述 / 对比 / 归纳三类', () => {
    expect(essays.length).toBe(30);
    const kinds = new Set(essays.map((e) => e.kind ?? '论述'));
    expect(kinds).toEqual(new Set(['论述', '对比', '归纳']));
  });

  it('每道题都有答题思路（tip）', () => {
    const missing = essays.filter((e) => !e.tip?.trim()).map((e) => e.id);
    expect(missing, `缺 tip：${missing.join(', ')}`).toEqual([]);
  });

  it('踩分点分值之和等于满分', () => {
    const bad = essays
      .filter((e) => e.keyPoints.reduce((n, k) => n + k.score, 0) !== e.totalScore)
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('每个踩分点都有别名，保证表述差异也能命中', () => {
    const bad = essays.flatMap((e) =>
      e.keyPoints.filter((k) => !k.aliases?.length).map((k) => `${e.id}:${k.text.slice(0, 10)}`),
    );
    expect(bad).toEqual([]);
  });
});
