import { useMemo, useState } from 'react';
import { essayBank, essays } from '../core/data';
import { scoreEssay } from '../core/grader';
import { CHAPTER_ORDER } from '../core/data';

export function EssayView({ onBack }: { onBack: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [manual, setManual] = useState<Set<number>>(new Set());

  const essay = useMemo(() => essays.find((e) => e.id === activeId) ?? null, [activeId]);
  const auto = useMemo(() => (essay && checked ? scoreEssay(essay, input) : null), [essay, checked, input]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof essays>();
    for (const e of essays) {
      const list = map.get(e.chapter) ?? [];
      list.push(e);
      map.set(e.chapter, list);
    }
    return [...map.entries()].sort(
      (a, b) => CHAPTER_ORDER.indexOf(a[0]) - CHAPTER_ORDER.indexOf(b[0]),
    );
  }, []);

  const open = (id: string) => {
    setActiveId(id);
    setInput('');
    setChecked(false);
    setManual(new Set());
    window.scrollTo({ top: 0 });
  };

  /* ------------------------------------------------------------- 列表页 */
  if (!essay) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <div>
          <h2>大题自测</h2>
          <div className="tiny">
            共 {essayBank.essays.length} 道简答/论述，覆盖 {essayBank.essays.reduce((n, e) => n + e.keyPoints.length, 0)} 个踩分点
          </div>
        </div>

        <div className="card card-flat">
          <div className="tiny">
            用法：先自己在纸上写要点 → 输入关键词 → 检查命中 → 展开参考答案核对。
            机器判分只看「有没有提到这个点」，请以自身理解为准。
          </div>
        </div>

        {grouped.map(([chapter, list]) => (
          <div key={chapter}>
            <div className="optgroup-label">{chapter}</div>
            <div className="list">
              {list.map((e) => (
                <button className="list-item" key={e.id} onClick={() => open(e.id)}>
                  <span className="badge red">{e.totalScore}</span>
                  <span className="grow">
                    <div style={{ fontWeight: 500 }}>{e.title}</div>
                    <div className="tiny">
                      {e.keyPoints.length} 个得分点 · 课件 p{e.slides.join('/')}
                    </div>
                  </span>
                  <span className="muted" aria-hidden>
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ------------------------------------------------------------- 详情页 */
  const confirmed = essay.keyPoints
    .map((kp, i) => ({ kp, i, ok: manual.has(i) || Boolean(auto?.hits[i]?.hit) }))
    .filter((x) => x.ok);
  const score = confirmed.reduce((n, x) => n + x.kp.score, 0);

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setActiveId(null)}>
        ← 返回大题列表
      </button>

      <div className="card stack">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge ghost">{essay.chapter}</span>
          <span className="badge ghost">满分 {essay.totalScore}</span>
          <span className="badge ghost">课件 p{essay.slides.join('/')}</span>
        </div>
        <h2>{essay.title}</h2>
        <div className="stem" style={{ fontSize: 15, fontWeight: 400 }}>
          {essay.prompt}
        </div>
      </div>

      <div>
        <div className="optgroup-label">我的作答（写下关键词即可）</div>
        <textarea
          className="textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如：1850年代 英国 抵制工业化 哥特风格 拉斯金 莫里斯 第一场大规模风格运动……"
        />
      </div>

      {!checked ? (
        <button className="btn btn-primary btn-block" disabled={!input.trim()} onClick={() => setChecked(true)}>
          检查踩分点
        </button>
      ) : (
        <>
          <div className="hero">
            <div className="hero-blocks" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className="tiny">建议得分（含手动确认）</div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 500,
                  lineHeight: 1.1,
                  color: score >= essay.totalScore * 0.7 ? 'var(--ok)' : 'var(--warn)',
                }}
              >
                {score}
              </span>
              <span className="muted">/ {essay.totalScore} 分</span>
            </div>
            <div className="tiny" style={{ marginTop: 6 }}>
              机器命中 {auto?.hits.filter((h) => h.hit).length} 个点 · 手动补勾 {manual.size} 个
            </div>
          </div>

          <div>
            <div className="optgroup-label">踩分点（点一下可手动补勾 / 取消）</div>
            <div className="list">
              {essay.keyPoints.map((kp, i) => {
                const autoHit = Boolean(auto?.hits[i]?.hit);
                const ok = autoHit || manual.has(i);
                return (
                  <button
                    className="list-item"
                    key={i}
                    onClick={() => {
                      if (autoHit) return; // 自动命中的不可取消，避免误操作
                      const next = new Set(manual);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      setManual(next);
                    }}
                    style={{ background: ok ? 'var(--ok-bg)' : undefined }}
                  >
                    <span
                      className="badge"
                      style={{
                        background: ok ? 'var(--ok)' : 'var(--surface-2)',
                        color: ok ? '#fff' : 'var(--text-2)',
                      }}
                    >
                      {ok ? '✓' : '○'}
                    </span>
                    <span className="grow" style={{ fontSize: 14 }}>
                      {kp.text}
                    </span>
                    <span className="tiny nowrap">{kp.score} 分</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="optgroup-label">参考答案</div>
            <div className="card card-flat" style={{ fontSize: 14, lineHeight: 1.85 }}>
              {essay.reference}
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn grow" onClick={() => setChecked(false)}>
              修改作答
            </button>
            <button className="btn btn-primary grow" onClick={() => open(essay.id)}>
              再练一遍
            </button>
          </div>

          <div className="tiny center">
            建议得分仅供参考，请以自身掌握程度判断
          </div>
        </>
      )}
    </div>
  );
}
