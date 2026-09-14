# 把 docx 按文档顺序抽成纯文本（段落 + 表格），只依赖标准库。
# 与 tools/extract_pptx.py 同一套思路：先把源材料落成文本，再做结构化。

import sys
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def para_text(p):
    parts = []
    for node in p.iter():
        tag = node.tag
        if tag == W + 't':
            parts.append(node.text or '')
        elif tag == W + 'tab':
            parts.append('\t')
        elif tag == W + 'br':
            parts.append('\n')
    return ''.join(parts).strip()


def para_style(p):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return ''
    st = ppr.find(W + 'pStyle')
    if st is None:
        return ''
    return st.get(W + 'val') or ''


def table_rows(tbl):
    rows = []
    for tr in tbl.findall(W + 'tr'):
        cells = []
        for tc in tr.findall(W + 'tc'):
            txt = ' '.join(filter(None, (para_text(p) for p in tc.findall(W + 'p'))))
            cells.append(txt.strip())
        rows.append(cells)
    return rows


def main(path, out):
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml')
    root = ET.fromstring(xml)
    body = root.find(W + 'body')

    lines = []
    for child in body:
        if child.tag == W + 'p':
            txt = para_text(child)
            style = para_style(child)
            if not txt:
                continue
            if style.lower().startswith('heading') or style in ('Title', 'Subtitle'):
                level = ''.join(ch for ch in style if ch.isdigit()) or '1'
                lines.append('')
                lines.append('#' * min(int(level), 6) + ' ' + txt)
            else:
                lines.append(txt)
        elif child.tag == W + 'tbl':
            lines.append('')
            for row in table_rows(child):
                lines.append('| ' + ' | '.join(row) + ' |')
            lines.append('')

    text = '\n'.join(lines)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)
    print('chars=%d lines=%d' % (len(text), len(lines)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
