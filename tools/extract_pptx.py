# -*- coding: utf-8 -*-
"""从 PPTX 中抽取全部文字，按幻灯片序号输出到文本文件。"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

src = sys.argv[1]
dst = sys.argv[2]

z = zipfile.ZipFile(src)
names = [n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)]
names.sort(key=lambda n: int(re.search(r"(\d+)", n.split("/")[-1]).group(1)))

lines = []
for n in names:
    idx = int(re.search(r"(\d+)", n.split("/")[-1]).group(1))
    root = ET.fromstring(z.read(n))
    texts = []
    for p in root.iter(A + "p"):
        buf = "".join(t.text or "" for t in p.iter(A + "t"))
        buf = buf.strip()
        if buf:
            texts.append(buf)
    # 备注
    notes = ""
    nn = "ppt/notesSlides/notesSlide%d.xml" % idx
    if nn in z.namelist():
        nroot = ET.fromstring(z.read(nn))
        nbuf = []
        for p in nroot.iter(A + "p"):
            s = "".join(t.text or "" for t in p.iter(A + "t")).strip()
            if s and not s.isdigit():
                nbuf.append(s)
        notes = " | ".join(nbuf)
    lines.append("### Slide %d" % idx)
    lines.extend(texts)
    if notes:
        lines.append("[备注] " + notes)
    lines.append("")

out = "\n".join(lines)
with open(dst, "w", encoding="utf-8") as f:
    f.write(out)
print("slides:", len(names), "chars:", len(out))
