import { tokenize, type Token } from '../core/rich';
import { richDict } from '../core/data';

/**
 * 富文本渲染：把解析里的时间、人物、作品、运动自动上色，`**重点**` 渲染为红色。
 * 颜色语义固定，不随主题变化：时间=蓝，人物=靛紫，作品=青，运动=加粗。
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const tokens: Token[] = tokenize(text, richDict);
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === 'text') return <span key={i}>{t.text}</span>;
        return (
          <span key={i} className={`hl hl-${t.kind}`}>
            {t.text}
          </span>
        );
      })}
    </span>
  );
}
