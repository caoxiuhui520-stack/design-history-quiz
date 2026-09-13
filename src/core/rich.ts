/**
 * 富文本分词：把解析/要点文本切成带语义类型的片段，供渲染层上色。
 *
 * 着色规则（对应用户提出的「时间一个颜色，重点用红色」）：
 *   em     红色 —— 作者用 **双星号** 显式标记的重点
 *   time   蓝色 —— 年份、世纪、年代
 *   person 靛紫 —— 人物
 *   work   青色 —— 作品（《书名号》或词典命中）
 *   move   中性加粗 —— 运动 / 流派
 *
 * 词典从题库标签与知识地图动态构建，保证与数据一致，不需要单独维护一份颜色词表。
 */

export type TokenKind = 'text' | 'em' | 'time' | 'person' | 'work' | 'move';

export interface Token {
  kind: TokenKind;
  text: string;
}

export interface RichDict {
  person: string[];
  work: string[];
  move: string[];
}

/** 时间表达式：2026年 / 20世纪 / 20世纪60年代 / 1960—1990 / 一九二二 */
const TIME_SOURCE =
  '(?:\\d{4}\\s*[—~～-]\\s*\\d{4}|\\d{4}\\s*年|\\d{1,2}\\s*世纪(?:\\s*\\d{1,2}\\s*年代)?|\\d{2,4}\\s*年代|[〇零一二三四五六七八九十百千]{2,6}\\s*年)';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const cache = new WeakMap<RichDict, { re: RegExp; kinds: Map<string, TokenKind> }>();

function build(dict: RichDict) {
  const cached = cache.get(dict);
  if (cached) return cached;

  const kinds = new Map<string, TokenKind>();
  // 长词优先，避免「密斯」抢先匹配掉「密斯·凡·德·洛」
  const words = [...dict.move, ...dict.person, ...dict.work]
    .filter(Boolean)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .sort((a, b) => b.length - a.length);

  for (const w of dict.move) kinds.set(w, 'move');
  for (const w of dict.person) kinds.set(w, 'person');
  for (const w of dict.work) kinds.set(w, 'work');

  const nameAlt = words.map(escapeRe).join('|');
  const source = [
    '(?<em>\\*\\*[^*]+\\*\\*)',
    '(?<work>《[^》]+》)',
    `(?<time>${TIME_SOURCE})`,
    nameAlt ? `(?<name>${nameAlt})` : null,
  ]
    .filter(Boolean)
    .join('|');

  const built = { re: new RegExp(source, 'g'), kinds };
  cache.set(dict, built);
  return built;
}

export function tokenize(input: string, dict: RichDict): Token[] {
  if (!input) return [];
  const { re, kinds } = build(dict);
  re.lastIndex = 0;

  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(input)) !== null) {
    if (m.index > last) tokens.push({ kind: 'text', text: input.slice(last, m.index) });

    const g = m.groups ?? {};
    if (g.em) {
      tokens.push({ kind: 'em', text: g.em.slice(2, -2) });
    } else if (g.work) {
      tokens.push({ kind: 'work', text: g.work });
    } else if (g.time) {
      tokens.push({ kind: 'time', text: g.time });
    } else if (g.name) {
      // 关键词命中时以词典语义为准（《》里已单独处理过）
      tokens.push({ kind: kinds.get(g.name) ?? 'text', text: g.name });
    } else {
      tokens.push({ kind: 'text', text: m[0] });
    }
    last = m.index + m[0].length;
  }

  if (last < input.length) tokens.push({ kind: 'text', text: input.slice(last) });
  return tokens;
}

/** 纯文本（去掉 ** 标记），用于导出、复制、测试断言 */
export function plain(input: string): string {
  return input.replace(/\*\*([^*]+)\*\*/g, '$1');
}
