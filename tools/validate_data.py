# -*- coding: utf-8 -*-
"""
数据质量校验：questions / concepts / essays 三个数据文件。
在 CI 中作为部署门禁执行，任一规则失败则以非零退出码中断构建。

用法:
    python validate_data.py <data目录>
"""
import json
import os
import re
import sys

RESULT = []


def check(rule, ok, detail=""):
    RESULT.append((rule, bool(ok), detail))
    return ok


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "data"

    # ---------- V1 三个文件均可解析 ----------
    try:
        q = load(os.path.join(base, "questions.json"))
        c = load(os.path.join(base, "concepts.json"))
        e = load(os.path.join(base, "essays.json"))
        check("V1 JSON 可解析", True, "3/3 文件解析成功")
    except Exception as ex:  # noqa: BLE001
        check("V1 JSON 可解析", False, str(ex))
        return report()

    questions = q["questions"]

    # ---------- V2 题目总数 ----------
    check("V2 题目总数一致", len(questions) == q["stats"]["total"],
          "实际 %d / 声明 %d" % (len(questions), q["stats"]["total"]))

    # ---------- V3 题型统计 ----------
    actual = {}
    for item in questions:
        actual[item["type"]] = actual.get(item["type"], 0) + 1
    check("V3 题型统计一致", actual == q["stats"]["byType"],
          "实际 %s / 声明 %s" % (actual, q["stats"]["byType"]))

    # ---------- V4 答案非空 ----------
    empty = [x["id"] for x in questions if not x["answer"].get("value")]
    check("V4 答案非空", not empty, "空答案: %s" % (empty or "无"))

    # ---------- V5 选择题答案字母必须存在于选项 ----------
    bad = []
    for x in questions:
        if x["type"] in ("single", "multiple"):
            keys = {o["key"] for o in x["options"]}
            for a in x["answer"]["value"]:
                if a not in keys:
                    bad.append("%s(答案 %s 不在选项 %s)" % (x["id"], a, sorted(keys)))
    check("V5 选择题答案合法", not bad, "; ".join(bad) or "全部合法")

    # ---------- V6 填空题位与答案数量匹配 ----------
    bad = []
    for x in questions:
        if x["type"] == "blank":
            n = x.get("blankCount", -1)
            if n != len(x["answer"]["value"]):
                bad.append("%s(空位 %s / 答案 %s)" % (x["id"], n, len(x["answer"]["value"])))
            if len(x.get("stemParts", [])) != n + 1:
                bad.append("%s(stemParts 长度与 blankCount 不符)" % x["id"])
    check("V6 填空题位匹配", not bad, "; ".join(bad) or "全部匹配")

    # ---------- V7 判断题取值 ----------
    bad = [x["id"] for x in questions
           if x["type"] == "judge" and x["answer"]["value"] not in (["T"], ["F"])]
    check("V7 判断题取值合法", not bad, "异常: %s" % (bad or "无"))

    # ---------- V8 ID 唯一 ----------
    ids = [x["id"] for x in questions]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    check("V8 题目 ID 唯一", not dup, "重复: %s" % (dup or "无"))

    # ---------- V9 题干无选项残留 ----------
    leftover = re.compile(r"\b[A-E][.、]\s*\S")
    bad = [x["id"] for x in questions
           if x["type"] in ("single", "multiple") and leftover.search(x["stem"])]
    check("V9 题干无选项残留", not bad, "残留: %s" % (bad or "无"))

    # ---------- V10 大题分值自洽 ----------
    bad = ["%s(%d≠%d)" % (x["id"], sum(k["score"] for k in x["keyPoints"]), x["totalScore"])
           for x in e["essays"]
           if sum(k["score"] for k in x["keyPoints"]) != x["totalScore"]]
    check("V10 大题分值自洽", not bad, "; ".join(bad) or
          "%d 道大题 / %d 个得分点全部自洽" % (len(e["essays"]),
                                              sum(len(x["keyPoints"]) for x in e["essays"])))

    # ---------- V11 标签格式 ----------
    tagre = re.compile(r"^(运动|人物|作品|概念):.+$")
    bad = sorted({t for x in questions for t in x["tags"] if not tagre.match(t)})
    check("V11 标签格式合法", not bad, "非法: %s" % (bad or "无"))

    # ---------- V12 课件页码合法 ----------
    bad = []
    for x in c["cards"]:
        for p in x["slides"]:
            if not (1 <= p <= 30):
                bad.append("%s(页码 %s)" % (x["id"], p))
    for x in e["essays"]:
        for p in x["slides"]:
            if not (1 <= p <= 30):
                bad.append("%s(页码 %s)" % (x["id"], p))
    check("V12 课件页码合法", not bad, "; ".join(bad) or "全部在 1–30 范围内")

    return report()


def report():
    fails = [r for r in RESULT if not r[1]]
    for rule, ok, detail in RESULT:
        print("[%s] %-22s %s" % ("PASS" if ok else "FAIL", rule, detail))
    print("-" * 60)
    if fails:
        print("校验失败：%d / %d 项未通过" % (len(fails), len(RESULT)))
        raise SystemExit(1)
    print("全部通过：%d / %d 项" % (len(RESULT), len(RESULT)))


if __name__ == "__main__":
    main()
