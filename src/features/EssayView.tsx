import { useMemo, useState } from 'react';
import { essayBank, essays } from '../core/data';
import { scoreEssay } from '../core/grader';
import { RichText } from '../components/RichText';

type Kind = '全部' | '论述' | '对比' | '归纳';

const KIND_ORDER: Kind[] = ['全部', '论述', '对比', '归纳'];
const KIND_NOTE: Record<string, string> = {
  论述: '展开型：按史实线索分段写全，采分点是「背景 / 主张 / 人物 / 作品 / 影响」。',
  对比: '辨析型：先同后异、分点并列，每个差异都要点出「两边分别是什么」。',
  归纳: '清单型：一个个对上号就行，宁可多写几条短的，也不能漏项。',
};

export function EssayView({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<Kind>('全部');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [manual, setManual] = useState<Set<number>>(new Set());

  const essay = useMemo(() => essays.find((e) => e.id === activeId) ?? null, [activeId]);
  const auto = useMemo(() => (essay && checked ? scoreEssay(essay, input) : null), [essay, checked, input]);

  const visible = useMemo(
    () => (kind === '全部' ? essays : essays.filter((e) => (e.kind ?? '论述') === kind)),
    [kind],
  );

  const totalPoints = essays.reduce((n, e) => n + e.keyPoints.length, 0);

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
          <h2>大题（简答 / 论述）</h2>
          <div className="tiny">
            {essays.length} 道题 · {totalPoints} 个踩分点 · 按老师最可能的出题方向整理
          </div>
        </div>

        <div className="card card-flat">
          <div className="tiny">
            用法：先自己在纸上写要点 → 输入关键词 → 检查命中 → 展开参考答案核对。
            机器只看「有没有提到这个点」，判断以你自身理解为准。
          </div>
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          {KIND_ORDER.map((k) => {
            const n = k === '全部' ? essays.length : essays.filter((e) => (e.kind ?? '论述') === k).length;
            return (
              <button key={k} className={`chip ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
                {k}
                {k !== '全部' ? `（${n}）` : `（${n}）`}
              </button>
            );
          })}
        </div>

        {kind !== '全部' ? (
          <div className="card card-flat" style={{ borderLeft: '3px solid var(--blue)' }}>
            <div className="tiny">{KIND_NOTE[kind]}</div>
          </div>
        ) : null}

        <div className="list">
          {visible.map((e) => (
            <button className="list-item" key={e.id} onClick={() => open(e.id)}>
              <span className="badge red">{e.totalScore}</span>
              <span className="grow">
                <div style={{ fontWeight: 500 }}>{e.title}</div>
                <div className="tiny">
                  {e.kind ?? '论述'} · {e.keyPoints.length} 个得分点 · {e.chapter}
                </div>
              </span>
              <span className="muted" aria-hidden>
                →
              </span>
            </button>
          ))}
        </div>
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
          <span className="badge ghost">{essay.kind ?? '论述'}</span>
          <span className="badge ghost">{essay.chapter}</span>
          <span className="badge ghost">满分 {essay.totalScore}</span>
        </div>
        <h2>{essay.title}</h2>
        <div style={{ fontSize: 15, lineHeight: 1.8 }}>
          <RichText text={essay.prompt} />
        </div>
      </div>

      {essay.tip ? (
        <div className="card" style={{ borderLeft: '3px solid var(--blue)' }}>
          <div className="tiny" style={{ marginBottom: 4 }}>
            答题思路
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <RichText text={essay.tip} />
          </div>
        </div>
      ) : null}

      <div>
        <div className="optgroup-label">我的作答（写下关键词即可）</div>
        <textarea
          className="textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="想到什么写什么，不必成句。例如：1850年代 英国 抵制工业化 哥特 拉斯金 莫里斯 第一场大规模风格运动……"
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
            <div className="optgroup-label">踩分点（自动命中的不可取消；未命中的点一下可手动补勾）</div>
            <div className="list">
              {essay.keyPoints.map((kp, i) => {
                const autoHit = Boolean(auto?.hits[i]?.hit);
                const ok = autoHit || manual.has(i);
                return (
                  <button
                    className="list-item"
                    key={i}
                    onClick={() => {
                      if (autoHit) return;
                      const next = new Set(manual);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      setManual(next);
                    }}
                    style={{ background: ok ? 'var(--ok-bg)' : undefined, alignItems: 'flex-start' }}
                  >
                    <span
                      className="badge"
                      style={{
                        background: ok ? 'var(--ok)' : 'var(--surface-2)',
                        color: ok ? '#fff' : 'var(--text-2)',
                        marginTop: 2,
                      }}
                    >
                      {ok ? '✓' : '○'}
                    </span>
                    <span className="grow" style={{ fontSize: 14, lineHeight: 1.75 }}>
                      <RichText text={kp.text} />
                    </span>
                    <span className="tiny nowrap">{kp.score} 分</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="optgroup-label">参考答案</div>
            <div className="card card-flat" style={{ fontSize: 14, lineHeight: 1.9 }}>
              <RichText text={essay.reference} />
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

          <div className="tiny center">建议得分仅供参考，请以自身掌握程度判断</div>
        </>
      )}
    </div>
  );
}
