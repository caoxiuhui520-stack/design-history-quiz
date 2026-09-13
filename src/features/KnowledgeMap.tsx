import { useState } from 'react';
import { confusions, eras, questionsByIds, timelineLinks } from '../core/data';
import type { Era } from '../core/types';
import { RichText } from '../components/RichText';
import { HighlightLegend } from '../components/Feedback';
import type { PracticeSessionSpec } from '../core/practice';

type Tab = 'timeline' | 'links' | 'confusions';

const KIND_TONE: Record<string, string> = {
  复古主义: 'var(--text-2)',
  改革运动: 'var(--red)',
  装饰风格运动: 'var(--yellow)',
  现代主义: 'var(--blue)',
  现代主义延伸: 'var(--blue)',
  后现代主义: 'var(--ok)',
};

export function KnowledgeMap({
  onPractice,
  onBack,
}: {
  onPractice: (s: PracticeSessionSpec) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [activeId, setActiveId] = useState<string>(eras[0]?.id ?? '');
  const [showLegend, setShowLegend] = useState(false);

  const era: Era | undefined = eras.find((e) => e.id === activeId);

  /* --------------------------------------------------------- 人物归属表 */
  const figuresByMove = (() => {
    const map = new Map<string, { name: string; note: string; era: string }[]>();
    for (const e of eras) {
      for (const move of e.moves) {
        const list = map.get(move) ?? [];
        for (const f of e.figures) {
          if (!list.some((x) => x.name === f.name)) {
            list.push({ name: f.name, note: f.note, era: e.title });
          }
        }
        map.set(move, list);
      }
    }
    return [...map.entries()].filter(([, v]) => v.length > 0);
  })();

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <div>
        <h2>知识脉络</h2>
        <div className="tiny">
          把运动、人物、作品放回时间轴和地理位置上，看清它们之间的因果关系
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        {(
          [
            ['timeline', '时间轴'],
            ['links', '影响关系'],
            ['confusions', '易混淆对照'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`chip ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
        <button className="chip" onClick={() => setShowLegend((v) => !v)}>
          颜色说明
        </button>
      </div>

      {showLegend ? (
        <div className="card card-flat">
          <HighlightLegend />
        </div>
      ) : null}

      {/* ------------------------------------------------------------ 时间轴 */}
      {tab === 'timeline' ? (
        <>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 8,
              margin: '0 -16px',
              paddingLeft: 16,
              paddingRight: 16,
            }}
          >
            {eras.map((e, i) => {
              const on = e.id === activeId;
              const count = questionsByIds(e.questions).length;
              return (
                <button
                  key={e.id}
                  onClick={() => setActiveId(e.id)}
                  style={{
                    flex: '0 0 auto',
                    width: 150,
                    textAlign: 'left',
                    padding: '12px 12px 14px',
                    borderRadius: 'var(--r-card)',
                    border: `1.5px solid ${on ? 'var(--red)' : 'var(--line)'}`,
                    background: on ? 'var(--surface)' : 'var(--surface)',
                    boxShadow: on ? '0 0 0 3px rgba(216,52,43,0.12)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="tiny mono">{String(i + 1).padStart(2, '0')}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: KIND_TONE[e.kind] ?? 'var(--text-2)',
                        fontWeight: 500,
                      }}
                    >
                      {e.century}
                    </span>
                  </div>
                  <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.4 }}>{e.title}</div>
                  <div className="tiny" style={{ marginTop: 4 }}>
                    {e.span}
                  </div>
                  <div className="tiny" style={{ marginTop: 8 }}>
                    {count} 题
                  </div>
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: KIND_TONE[e.kind] ?? 'var(--line-strong)', opacity: on ? 1 : 0.35 }} />
                </button>
              );
            })}
          </div>

          {era ? (
            <div className="stack">
              <div className="card">
                <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                  <span className="badge ghost">{era.kind}</span>
                  <span className="badge ghost">{era.span}</span>
                  {era.regions.map((r) => (
                    <span className="badge ghost" key={r}>
                      {r}
                    </span>
                  ))}
                </div>
                <h2 style={{ marginBottom: 8 }}>{era.title}</h2>
                <div style={{ lineHeight: 1.85, fontSize: 14 }}>
                  <RichText text={era.summary} />
                </div>
              </div>

              <div>
                <div className="optgroup-label">核心要点</div>
                <div className="card">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {era.points.map((p, i) => (
                      <li key={i} style={{ marginBottom: 8, lineHeight: 1.8, fontSize: 14 }}>
                        <RichText text={p} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid-2">
                <div>
                  <div className="optgroup-label">代表人物（{era.figures.length}）</div>
                  <div className="list">
                    {era.figures.map((f) => (
                      <div className="list-item" key={f.name} style={{ cursor: 'default' }}>
                        <span className="grow">
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{f.name}</div>
                          <div className="tiny">
                            <RichText text={f.note} />
                          </div>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="optgroup-label">代表作品（{era.works.length}）</div>
                  <div className="list">
                    {era.works.map((w) => (
                      <div className="list-item" key={w.name} style={{ cursor: 'default' }}>
                        <span className="grow">
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{w.name}</div>
                          <div className="tiny">
                            <RichText text={w.note} />
                          </div>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {era.bridge ? (
                <div className="card" style={{ borderLeft: '3px solid var(--blue)' }}>
                  <div className="tiny" style={{ marginBottom: 4 }}>
                    通往下一阶段
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                    <RichText text={era.bridge} />
                  </div>
                </div>
              ) : null}

              <button
                className="btn btn-primary btn-block"
                disabled={questionsByIds(era.questions).length === 0}
                onClick={() =>
                  onPractice({
                    label: `${era.title} · ${questionsByIds(era.questions).length} 题`,
                    questions: questionsByIds(era.questions),
                  })
                }
              >
                练这一时期的题（{questionsByIds(era.questions).length} 题）
              </button>
            </div>
          ) : null}

          <div>
            <div className="optgroup-label">人物归属总表（按运动分组）</div>
            <div className="stack">
              {figuresByMove.map(([move, list]) => (
                <div className="card" key={move}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>
                    {move}
                    <span className="tiny" style={{ marginLeft: 6, fontWeight: 400 }}>
                      {list[0]?.era}
                    </span>
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    {list.map((f) => (
                      <div key={f.name} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <span className="badge ghost" style={{ flex: '0 0 auto' }}>
                          {f.name.slice(0, 2)}
                        </span>
                        <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                          <b style={{ fontWeight: 500 }}>{f.name}</b>
                          <span className="muted">
                            {'　'}
                            <RichText text={f.note} />
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* --------------------------------------------------------- 影响关系 */}
      {tab === 'links' ? (
        <>
          <div className="card card-flat">
            <div className="tiny">
              下面这些「A → B」是理解整门课的关键因果链。考试里很多题其实在考这条链上的先后关系。
            </div>
          </div>
          <div className="list">
            {timelineLinks.map((l, i) => (
              <div className="list-item" key={i} style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span className="grow">
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                    <b style={{ fontWeight: 500 }}>{l.from}</b>
                    <span style={{ color: 'var(--red)', margin: '0 6px' }}>→</span>
                    <b style={{ fontWeight: 500 }}>{l.to}</b>
                  </div>
                  <div className="tiny" style={{ marginTop: 2 }}>
                    {l.label}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------------ 易混淆对照 */}
      {tab === 'confusions' ? (
        <>
          <div className="card card-flat">
            <div className="tiny">这些是题库里反复出现、最容易张冠李戴的配对。考前扫一遍这里性价比最高。</div>
          </div>
          <div className="list">
            {confusions.map((c, i) => (
              <div className="list-item" key={i} style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span className="grow">
                  <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
                    {c.pair.map((p) => (
                      <span className="badge ghost" key={p}>
                        {p}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                    <RichText text={c.note} />
                  </div>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
