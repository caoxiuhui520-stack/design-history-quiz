import { useMemo, useState } from 'react';
import { conceptBank, conceptsByChapter } from '../core/data';
import { Bar } from '../components/ui';

export function Flashcards({ onBack }: { onBack: () => void }) {
  const groups = useMemo(() => conceptsByChapter(), []);
  const [chapter, setChapter] = useState<string>('全部');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const list = useMemo(
    () => (chapter === '全部' ? conceptBank.cards : groups.find((g) => g.chapter === chapter)?.cards ?? []),
    [chapter, groups],
  );

  const card = list[Math.min(index, Math.max(0, list.length - 1))];

  const go = (delta: number) => {
    setFlipped(false);
    setIndex((i) => Math.min(list.length - 1, Math.max(0, i + delta)));
  };

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <div>
        <h2>速记卡</h2>
        <div className="tiny">
          共 {conceptBank.cards.length} 张 · 出自课件 30 页 · 点击卡片翻面
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <button className={`chip ${chapter === '全部' ? 'is-on' : ''}`} onClick={() => { setChapter('全部'); setIndex(0); setFlipped(false); }}>
          全部
        </button>
        {groups.map((g) => (
          <button
            key={g.chapter}
            className={`chip ${chapter === g.chapter ? 'is-on' : ''}`}
            onClick={() => { setChapter(g.chapter); setIndex(0); setFlipped(false); }}
          >
            {g.chapter}（{g.cards.length}）
          </button>
        ))}
      </div>

      {card ? (
        <>
          <div className={`flip ${flipped ? 'is-back' : ''}`} onClick={() => setFlipped((f) => !f)}>
            <div className="flip-inner">
              <div className="flip-face front">
                <div className="center">
                  <div className="tiny" style={{ marginBottom: 8 }}>
                    {card.chapter} · 课件 p{card.slides.join('/')}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 500 }}>{card.title}</div>
                  {card.aliases.length ? (
                    <div className="tiny" style={{ marginTop: 8 }}>
                      别名：{card.aliases.join(' / ')}
                    </div>
                  ) : null}
                  <div className="tiny" style={{ marginTop: 18 }}>
                    点击查看要点 ▸
                  </div>
                </div>
              </div>
              <div className="flip-face back">
                <div className="tiny" style={{ marginBottom: 6 }}>
                  {card.title}
                </div>
                <div className="explain" style={{ background: 'transparent', padding: 0, marginBottom: 10 }}>
                  {card.definition}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {card.points.map((p, i) => (
                    <li key={i} style={{ marginBottom: 6, fontSize: 14 }}>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn grow" disabled={index === 0} onClick={() => go(-1)}>
              ← 上一张
            </button>
            <span className="muted nowrap">
              {index + 1} / {list.length}
            </span>
            <button className="btn grow" disabled={index >= list.length - 1} onClick={() => go(1)}>
              下一张 →
            </button>
          </div>

          <Bar value={(index + 1) / list.length} tone="blue" />
        </>
      ) : (
        <div className="empty">该章节暂无知识卡</div>
      )}
    </div>
  );
}
