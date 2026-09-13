import { concepts, questions } from '../core/data';
import { chapterStats } from '../core/scheduler';
import { useStore } from '../core/store';
import { TYPE_LABEL } from '../core/scheduler';
import { Bar, pct } from '../components/ui';

export function Stats({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const stats = chapterStats(questions, store.records);
  const acc = store.totals.answered ? store.totals.correct / store.totals.answered : 0;
  const covered = questions.filter((q) => store.records[q.id]?.seen).length;
  const mastered = questions.filter((q) => (store.records[q.id]?.box ?? 0) >= 3).length;

  const byType = (['single', 'multiple', 'judge', 'blank'] as const).map((t) => {
    const list = questions.filter((q) => q.type === t);
    let seen = 0;
    let correct = 0;
    for (const q of list) {
      const r = store.records[q.id];
      if (r) {
        seen += r.seen;
        correct += r.correct;
      }
    }
    return { type: t, count: list.length, seen, accuracy: seen ? correct / seen : 0 };
  });

  const weakest = [...stats].filter((s) => s.seen > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <h2>学习统计</h2>

      <div className="grid-2">
        <div className="card">
          <div className="tiny">累计作答</div>
          <div style={{ fontSize: 22, fontWeight: 500 }}>{store.totals.answered}</div>
        </div>
        <div className="card">
          <div className="tiny">总正确率</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: acc >= 0.8 ? 'var(--ok)' : 'var(--no)' }}>
            {store.totals.answered ? pct(acc) : '—'}
          </div>
        </div>
        <div className="card">
          <div className="tiny">题目覆盖</div>
          <div style={{ fontSize: 22, fontWeight: 500 }}>
            {covered}
            <span className="muted" style={{ fontSize: 14 }}>/{questions.length}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar value={covered / questions.length} tone="blue" />
          </div>
        </div>
        <div className="card">
          <div className="tiny">已掌握（盒 ≥3）</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--ok)' }}>{mastered}</div>
          <div style={{ marginTop: 8 }}>
            <Bar value={mastered / questions.length} tone="ok" />
          </div>
        </div>
      </div>

      {weakest.length ? (
        <div>
          <div className="optgroup-label">薄弱章节（正确率升序，考前优先看）</div>
          <div className="list">
            {weakest.map((s) => (
              <div className="list-item" key={s.chapter}>
                <span className="grow">
                  <div className="row-between">
                    <span style={{ fontWeight: 500 }}>{s.chapter}</span>
                    <span className="nowrap" style={{ color: 'var(--no)', fontWeight: 500 }}>
                      {pct(s.accuracy)}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Bar value={s.accuracy} tone={s.accuracy >= 0.8 ? 'ok' : 'red'} />
                  </div>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="optgroup-label">各章节掌握度</div>
        <div className="list">
          {stats.map((s) => (
            <div className="list-item" key={s.chapter}>
              <span className="grow">
                <div className="row-between">
                  <span>{s.chapter}</span>
                  <span className="tiny nowrap">
                    {s.total} 题{s.seen ? ` · 正确率 ${pct(s.accuracy)}` : ' · 未练'}
                  </span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <Bar value={s.total ? s.mastered / s.total : 0} tone="blue" />
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="optgroup-label">各题型表现</div>
        <div className="list">
          {byType.map((t) => (
            <div className="list-item" key={t.type}>
              <span className="grow">
                <div className="row-between">
                  <span>{TYPE_LABEL[t.type]}</span>
                  <span className="tiny nowrap">
                    {t.count} 题 · {t.seen ? `正确率 ${pct(t.accuracy)}` : '未练'}
                  </span>
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-flat">
        <div className="tiny">
          知识库：78 题客观题 · {concepts.length} 张知识卡 · 14 道大题踩分点。全部数据本地处理，不会上传。
        </div>
      </div>
    </div>
  );
}
