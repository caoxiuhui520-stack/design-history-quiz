# -*- coding: utf-8 -*-
"""
题库导入流水线：把 xxt-export 导出的 Markdown 题库解析为站点可直接消费的 questions.json。

用法:
    python parse_bank.py <输入目录或文件...> <输出json>

设计目标:
  1. 幂等 —— 同一批 markdown 多次运行结果一致。
  2. 可追溯 —— 每题保留 source(homework/workId/no) 溯源信息。
  3. 可判分 —— 空白题切分为 stemParts，答案做归一化候选列表。
"""
import json
import os
import re
import sys

# ---------------------------------------------------------------- 标签词典
# 复习站需要按「人物 / 运动 / 作品」做交叉检索，这里用词典做自动打标。
DICT = {
    "运动": [
        "工艺美术运动", "新艺术运动", "装饰艺术运动", "现代主义设计", "国际主义风格",
        "后现代主义", "波普设计", "波普", "激进设计", "孟菲斯", "风格派", "构成主义", "包豪斯",
        "青年风格", "维也纳分离派", "格拉斯哥学派", "新古典主义", "流线型运动",
        "高科技风格", "微建筑风格", "微电子风格", "减少主义", "解构主义", "新建筑运动",
        "工作同盟", "图画现代主义",
    ],
    "人物": [
        "儒勒·舍雷", "莫里斯", "拉斯金", "马克穆多", "沃赛", "斯各特", "阿什比",
        "霍塔", "威尔德", "高迪", "吉马德", "麦金托什", "霍夫曼", "奥尔布里希",
        "克里姆特", "瓦格纳", "贝伦斯", "格罗皮乌斯", "密斯", "柯布西耶", "阿尔托",
        "穆特修斯", "里特维德", "塔特林", "李西斯基", "康定斯基", "蒙特里安", "赖特",
        "文丘里", "约翰逊", "伍重", "贝聿铭", "罗维", "索扎斯", "门迪尼", "斯塔克",
        "比希", "阿伦", "兰柏", "纳什", "比尔", "埃尔·李西斯基",
    ],
    "作品": [
        "红屋", "水晶宫", "悉尼歌剧院", "AT＆T大厦", "蓬皮杜", "克莱斯勒大厦",
        "帝国大厦", "洛克非勒中心", "西格莱姆大厦", "栗子山别墅", "流水别墅",
        "朗香教堂", "萨伏伊别墅", "巴塞罗那椅子", "红黄蓝椅子", "闪电椅子",
        "普鲁斯特椅子", "纽约的日落", "塔塞尔公寓", "米拉公寓", "圣家族教堂",
        "奎尔公园", "文森公寓", "巴特罗住宅", "第三国际纪念塔", "红楔子攻打白色",
        "施罗德住宅", "艾非尔铁塔", "法格斯鞋楦工厂", "考工记", "新精神宫",
    ],
}

# 章节归属规则：命中第一个即归入该章（顺序即优先级）
CHAPTER_RULES = [
    ("工业革命前设计", ["新古典主义", "维多利亚风格", "巴洛克", "洛可可", "纳什", "凯旋门"]),
    ("工艺美术运动", ["工艺美术", "莫里斯", "拉斯金", "红屋", "阿什比", "马克穆多", "沃赛", "斯各特"]),
    ("新艺术运动", ["新艺术", "霍塔", "威尔德", "高迪", "吉马德", "麦金托什", "分离派",
                    "奥尔布里希", "克里姆特", "瓦格纳", "霍夫曼", "青年风格", "艾非尔铁塔"]),
    ("装饰艺术运动", ["装饰艺术", "克莱斯勒", "帝国大厦", "洛克非勒", "西格莱姆", "阿伦",
                      "兰柏", "图画现代主义"]),
    ("现代主义设计萌起", ["新建筑", "工作同盟", "德意志", "穆特修斯", "贝伦斯", "AEG",
                          "科隆大争论", "科隆大展"]),
    ("包豪斯", ["包豪斯", "格罗皮乌斯", "迈耶", "魏玛", "德绍", "柏林时期", "乌尔姆"]),
    ("荷兰风格派", ["风格派", "里特维德", "蒙特里安", "施罗德", "红黄蓝椅子", "闪电椅"]),
    ("俄国构成主义", ["构成主义", "塔特林", "李西斯基", "第三国际"]),
    ("工业设计与国际主义", ["工业设计", "流线型", "罗维", "人机工程", "国际主义", "少则多",
                            "密斯", "巴塞罗那椅", "少就是多"]),
    ("后现代主义设计", ["后现代", "波普", "激进设计", "孟菲斯", "索扎斯", "门迪尼",
                        "文丘里", "栗子山", "约翰逊", "AT＆T", "普鲁斯特", "斯塔克",
                        "微建筑", "减少主义", "解构", "高科技风格", "蓬皮杜", "比希"]),
]

TYPE_MAP = {
    "单选题": "single",
    "多选题": "multiple",
    "判断题": "judge",
    "填空题": "blank",
}

# ---------------------------------------------------------------- 归一化
PUNCT = "，。、；：（）()《》“”\"'·．.,;:!?！？-—_ 　\t"


def norm(s: str) -> str:
    """答案归一化：全角转半角、去标点空格、繁简不处理（题库为简体）。"""
    s = s.strip()
    out = []
    for ch in s:
        code = ord(ch)
        if code == 0x3000:
            code = 32
        elif 0xFF01 <= code <= 0xFF5E:
            code -= 0xFEE0
        out.append(chr(code))
    s = "".join(out)
    s = s.replace("Ａ", "A")
    return "".join(c for c in s if c not in PUNCT).lower()


def load_md(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def split_questions(md: str):
    """按 `### N. （题型）` 切块。"""
    pattern = re.compile(r"^###\s*(\d+)\.\s*（(.+?)）\s*$", re.M)
    marks = list(pattern.finditer(md))
    for i, m in enumerate(marks):
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(md)
        yield int(m.group(1)), m.group(2), md[start:end]


def field(block: str, name: str) -> str:
    """取 `**name：** xxx` 到下一个 `**字段：**` 或块尾之间的内容。"""
    m = re.search(r"\*\*" + re.escape(name) + r"：\*\*", block)
    if not m:
        return ""
    rest = block[m.end():]
    nxt = re.search(r"^\*\*[^：\n]{1,8}：\*\*", rest, re.M)
    if nxt:
        rest = rest[:nxt.start()]
    return rest.strip()


def parse_options(block: str):
    opts = []
    for m in re.finditer(r"^-\s*([A-Z])[.、]\s*(.+?)\s*$", block, re.M):
        opts.append({"key": m.group(1), "text": m.group(2)})
    if opts:
        return opts
    # 无字母序号的兜底
    for i, m in enumerate(re.finditer(r"^-\s*(.+?)\s*$", block, re.M)):
        opts.append({"key": "ABCDE"[i], "text": m.group(1)})
    return opts


def parse_answer(qtype: str, block: str):
    raw = field(block, "正确答案").replace("✅", "").strip()
    if qtype == "judge":
        val = "T" if ("对" in raw or "正确" in raw) else "F"
        return {"value": [val], "display": "对" if val == "T" else "错",
                "accepted": ["对", "正确", "T", "true", "√", "是"] if val == "T"
                            else ["错", "错误", "F", "false", "×", "否"]}
    if qtype == "blank":
        items = re.findall(r"^\s*(\d+)[.、]\s*(.+?)\s*$", raw, re.M)
        accepted = [x[1] for x in items] or [x for x in raw.split("；") if x.strip()]
        return {"value": accepted, "display": "；".join(accepted),
                "accepted": accepted}
    letters = re.findall(r"\b([A-E]{1,5})\b", raw.split(" ")[0] or raw)
    keys = sorted(set(letters[0])) if letters else []
    return {"value": keys, "display": "".join(keys), "accepted": keys}


def auto_tags(text: str):
    tags = []
    for cat, words in DICT.items():
        for w in words:
            if w in text:
                tags.append(f"{cat}:{w}")
    return sorted(set(tags))


def auto_chapter(text: str) -> str:
    for chapter, words in CHAPTER_RULES:
        if any(w in text for w in words):
            return chapter
    return "综合"


def main():
    args = sys.argv[1:]
    srcs, dst = args[:-1], args[-1]
    files = []
    for s in srcs:
        if os.path.isdir(s):
            files += [os.path.join(s, f) for f in sorted(os.listdir(s))
                      if f.endswith("题库.md")]
        else:
            files.append(s)

    questions = []
    meta = []
    for path in files:
        md = load_md(path)
        hw = re.search(r"（([一二三四五六七八九十]+)）题库", md)
        hwmap = {"一": 1, "二": 2, "三": 3, "四": 4}
        hw_no = hwmap.get(hw.group(1), 0) if hw else 0
        work = re.search(r"workId\s*\|\s*(\d+)", md)
        work_id = work.group(1) if work else ""
        meta.append({"homework": hw_no, "workId": work_id, "file": os.path.basename(path)})

        for no, tname, block in split_questions(md):
            qtype = TYPE_MAP.get(tname)
            if not qtype:
                continue
            stem = field(block, "题目")
            # 题干只到第一个选项行/分隔线为止，避免把选项吞进题干
            stem = re.split(r"\n\s*-?\s*[A-Z][.、]\s", "\n" + stem)[0]
            stem = re.split(r"\n\s*-{3,}", stem)[0]
            stem = re.sub(r"\*\*.*?\*\*", "", stem)
            stem = re.sub(r"\s+", "", stem).strip()
            stem = stem.lstrip("-—")
            explain = field(block, "解析")
            explain = re.sub(r"^答案解析：?\s*", "", explain).strip()
            answer = parse_answer(qtype, block)
            body = stem + " " + " ".join(o["text"] for o in parse_options(block))
            q = {
                "id": f"hw{hw_no}-q{no:02d}",
                "type": qtype,
                "chapter": auto_chapter(body),
                "stem": stem,
                "options": parse_options(block) if qtype in ("single", "multiple") else [],
                "answer": answer,
                "explain": explain,
                "tags": auto_tags(body),
                "source": {"homework": hw_no, "workId": work_id, "no": no,
                           "typeName": tname},
            }
            if qtype == "blank":
                parts = [p.strip() for p in stem.split("[?]")]
                q["stemParts"] = parts
                q["blankCount"] = len(parts) - 1
            questions.append(q)

    questions.sort(key=lambda x: (x["source"]["homework"], x["source"]["no"]))
    payload = {
        "schemaVersion": "1.0.0",
        "course": "现代设计史",
        "generatedFrom": meta,
        "stats": {
            "total": len(questions),
            "byType": {t: sum(1 for q in questions if q["type"] == t)
                       for t in ("single", "multiple", "judge", "blank")},
            "byChapter": {},
        },
        "questions": questions,
    }
    for q in questions:
        c = q["chapter"]
        payload["stats"]["byChapter"][c] = payload["stats"]["byChapter"].get(c, 0) + 1

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print("OK total=%d %s" % (len(questions), payload["stats"]["byType"]))
    for k, v in sorted(payload["stats"]["byChapter"].items(), key=lambda x: -x[1]):
        print("   %-16s %d" % (k, v))


if __name__ == "__main__":
    main()
