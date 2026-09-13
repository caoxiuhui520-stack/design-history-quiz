import { useMemo, useState } from 'react';
import { describeAnswer } from '../core/grader';
import { questions } from '../core/data';
import { TYPE_LABEL } from '../core/scheduler';
import { clearQuestion, exportWrongMarkdown, useStore } from '../core/store';
import type { PracticeSessionSpec } from '../core/practice';
import { download } from '../core/files';
import { useToast } from '../components/ui';

export function WrongBook({
  onPractice,
  onBack,
}: {
  onPractice: (s: PracticeSessionSpec) => void;
  onBack: () => void;
}) {
  const store = useStore();
  const notify = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return questions
      .filter((q) => store.records[q.id] && store.records[q.id].box === 0)
      .map((q) => ({ q, rec: store.records[q.id] }))
      .sort((a, b) => b.rec.lapses - a.rec.lapses || b.rec.lastAt - a.rec.lastAt);
  }, [store.records]);

  if (!rows.length) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <div className="empty">
          <div className="big">✓</div>
          <div style={{ fontWeight: 500 }}>还没有错题</div>
          <div className="muted" style={{ marginTop: 4 }}>
            说明你都答对了 —— 去做一套试试手感
          </div>
        </div>
        <button
          className="btn btn-primary btn-block"
          onClick={() => onPractice({ label: `全量乱序 ${questions.length} 题`, questions: [...questions] })}
        >
          开始刷题
        </button>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <div className="row-between">
        <div>
          <h2>错题本</h2>
          <div className="tiny">共 {rows.length} 题 · 按错误次数排序</div>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => {
            download(
              `错题清单-${new Date().toISOString().slice(0, 10)}.md`,
              exportWrongMarkdown(
                rows.map((r) => ({
                  id: r.q.id,
                  stem: r.q.stem,
                  answer: describeAnswer(r.q, r.q.answer.value),
                })),
              ),
            );
            notify('错题清单已导出');
          }}
        >
          导出清单
        </button>
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={() => onPractice({ label: `错题重做 ${rows.length} 题`, questions: rows.map((r) => r.q) })}
      >
        重做全部错题（{rows.length} 题）
      </button>

      <div className="list">
        {rows.map(({ q, rec }) => {
          const open = openId === q.id;
          return (
            <div key={q.id}>
              <button className="list-item" onClick={() => setOpenId(open ? null : q.id)} aria-expanded={open}>
                <span className="badge red">{rec.lapses}</span>
                <span className="grow">
                  <div className="ellipsis" style={{ fontWeight: 500 }}>
                    {q.stem}
                  </div>
                  <div className="tiny">
                    {TYPE_LABEL[q.type]} · {q.chapter} · 作答 {rec.seen} 次
                  </div>
                </span>
                <span className="muted" aria-hidden>
                  {open ? '▴' : '▾'}
                </span>
              </button>

              {open ? (
                <div style={{ padding: '0 14px 14px', background: 'var(--surface-2)' }}>
                  {q.options.length ? (
                    <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                      {q.options.map((o) => (
                        <div
                          key={o.key}
                          className="muted"
                          style={{
                            color: q.answer.value.includes(o.key) ? 'var(--ok)' : undefined,
                            fontWeight: q.answer.value.includes(o.key) ? 500 : undefined,
                          }}
                        >
                          {o.key}. {o.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="kv" style={{ marginTop: 8 }}>
                    <b>正确答案</b>
                    <span style={{ color: 'var(--ok)', fontWeight: 500 }}>
                      {describeAnswer(q, q.answer.value)}
                    </span>
                  </div>
                  {q.explain ? <div className="muted" style={{ marginTop: 4 }}>解析：{q.explain}</div> : null}
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => onPractice({ label: `单题重做`, questions: [q] })}
                    >
                      重做这题
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        clearQuestion(q.id);
                        notify('已从错题本移除');
                      }}
                    >
                      移出错题本
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
