/**
 * 答案归一化。
 *
 * 归一化必须覆盖题库里真实存在的写法差异（见 docs/03 第 4.1 节）：
 *   1. 全角 → 半角（ＡＴ＆Ｔ → AT&T，１２３ → 123）
 *   2. 去除全部标点、符号与空白（含 · ・ · ，。；：（）《》"" 等，用 Unicode 类别一次性覆盖）
 *   3. 英文统一小写
 *   4. 中文数字 → 阿拉伯数字（一九二二 → 1922，二十 → 20）
 *
 * 归一化是**对称**的：答案与用户输入走同一条管线，因此即使出现「误合并」
 * （如「统一」→「统1」）也不会导致误判。
 */

/** \p{P} 标点 + \p{Z} 分隔符(含空格) + \p{S} 符号 + 制表/换行 */
const PUNCT = /[\p{P}\p{Z}\p{S}\t\n\r]/gu;

const CN_DIGIT: Record<string, string> = {
  零: '0', 〇: '0', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4',
  五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
};

const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 把一段纯中文数字转为阿拉伯数字字符串；无法解析时返回 null */
export function cn2num(text: string): string | null {
  if (!text) return null;

  // 无单位词时按「逐字读」处理：一九二二 → 1922
  if (!/[十百千]/.test(text)) {
    let out = '';
    for (const ch of text) {
      const d = CN_DIGIT[ch];
      if (d === undefined) return null;
      out += d;
    }
    return out;
  }

  let section = 0;
  let num = 0;
  let seen = false;
  for (const ch of text) {
    const d = CN_DIGIT[ch];
    if (d !== undefined) {
      num = Number(d);
      seen = true;
      continue;
    }
    const u = CN_UNIT[ch];
    if (u === undefined) return null;
    section += (num === 0 ? 1 : num) * u;
    num = 0;
    seen = true;
  }
  if (!seen) return null;
  return String(section + num);
}

export function normalize(input: string): string {
  let s = '';
  for (const ch of (input ?? '').trim()) {
    const code = ch.codePointAt(0)!;
    if (code === 0x3000) {
      s += ' '; // 全角空格
    } else if (code >= 0xff01 && code <= 0xff5e) {
      s += String.fromCharCode(code - 0xfee0); // 全角 ASCII → 半角
    } else {
      s += ch;
    }
  }
  s = s.replace(PUNCT, '').toLowerCase();
  if (!s) return '';
  // 中文数字 → 阿拉伯数字（含混排时也尽量转换）
  return s.replace(/[零〇一二两三四五六七八九十百千]+/g, (m) => cn2num(m) ?? m);
}

/* ------------------------------------------------------------ 同义词表 */

/**
 * 译名 / 表述差异的等价组。组内任意两个写法互判为正确。
 * 用途：题库与课件之间存在译名不一致（格罗皮乌斯 / 格罗佩斯）。
 */
const SYNONYM_GROUPS: string[][] = [
  ['格罗皮乌斯', '格罗佩斯', '格罗披乌斯', '格罗比乌斯', '沃尔特·格罗皮乌斯'],
  ['密斯·凡·德·洛', '密斯·凡·德罗', '米斯·凡·德罗', '密斯·凡德洛', '密斯凡德洛'],
  ['勒·柯布西耶', '柯布西耶', '柯比意', '柯布西埃', '勒柯布西耶'],
  ['里特维德', '里特维尔德', '格利特·里特维德', '格里特·里特维德'],
  ['威廉·莫里斯', '莫里斯'],
  ['罗伯特·文丘里', '文丘里'],
  ['维也纳分离派', '分离派'],
  ['威尔德', '亨利·凡·德·维尔德', '亨利·凡·德·威尔德', '凡·德·威尔德', '维尔德'],
  ['约翰·伍重', '伍重', '约恩·乌松', '乌松'],
  ['罗维', '雷蒙德·罗维'],
  ['阿伦', '威廉·凡·阿伦', '威廉·范·阿伦'],
  ['塔特林', '弗拉基米尔·塔特林'],
  ['李西斯基', '埃尔·李西斯基', '利西茨基'],
  ['索扎斯', '埃托尔·索扎斯'],
  ['门迪尼', '亚历山德罗·门迪尼'],
  ['斯塔克', '菲力普·斯塔克'],
  ['霍夫曼', '约瑟夫·霍夫曼'],
  ['纳什', '约翰·纳什'],
  ['比尔', '马克斯·比尔'],
  ['摩天大楼', '摩天楼'],
  ['水晶宫', '水晶宫展览馆'],
  ['新艺术运动', '新艺术'],
  ['工艺美术运动', '工艺美术'],
  ['装饰艺术运动', '装饰艺术'],
  ['国际主义风格', '国际风格', '国际主义'],
  ['俄国构成主义', '俄国的构成主义', '构成主义', '俄国构成主义运动'],
  ['现代主义设计', '现代主义'],
  ['荷兰风格派', '风格派'],
  ['杜塞尔多夫', '杜塞多夫'],
  ['魏玛', '魏玛共和国'],
  ['双轨制', '双轨'],
  ['教授制', '教授'],
  ['莫里斯', '威廉莫里斯'],
  ['纽约的日落', '纽约日落'],
];

/** 归一化写法 → 同义词组索引 */
const SYNONYM_INDEX = (() => {
  const idx = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const members = new Set(group.map(normalize));
    for (const m of members) {
      const bucket = idx.get(m) ?? new Set<string>();
      for (const x of members) bucket.add(x);
      idx.set(m, bucket);
    }
  }
  return idx;
})();

/** 两个归一化字符串是否属于同一同义词组 */
export function isSynonym(a: string, b: string): boolean {
  if (a === b) return true;
  const bucket = SYNONYM_INDEX.get(a);
  return bucket ? bucket.has(b) : false;
}

/* ------------------------------------------------------------ 编辑距离 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 模糊匹配容错阈值（见 docs/03 第 4.3 节）。
 * 答案越短，容错越严——避免把错答判对。
 */
export function fuzzyLimit(expectedLength: number): number {
  if (expectedLength <= 2) return 0;
  if (expectedLength <= 5) return 1;
  return 2;
}
