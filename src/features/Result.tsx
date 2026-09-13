import { useState } from 'react';
import { describeAnswer } from '../core/grader';
import { TYPE_LABEL } from '../core/scheduler';
import type { SessionResult } from './PracticeRun';
import { pct } from '../components/ui';
import type { PracticeSessionSpec } from '../core/practice';

export function Result({
  result,
  onPractice,
  onHome,
}: {
  result: SessionResult;
  onPractice: (s: PracticeSessionSpec) => void;
  onHome: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const answered = Object.keys(result.results).length;
  const correct = Object.values(result.results).filter((r) => r.correct).length;
  const accuracy = answered ? correct / answered : 0;
  const wrongList = result.questions.filter((q) => result.results[q.id] && !result.results[q.id].correct);
  const minutes = Math.max(1, Math.round(result.durationMs / 60000));

  return (
    <div className="stack-lg">
      <div className="hero">
        <div className="hero-blocks" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="tiny">{result.label}</div>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 40,
              fontWeight: 500,
              lineHeight: 1.1,
              color: accuracy >= 0.8 ? 'var(--ok)' : 'var(--no)',
            }}
          >
            {answered ? pct(accuracy) : '—'}
          </span>
          <span className="muted">正确率</span>
        </div>
        <div className="row wrap" style={{ gap: 16, marginTop: 12 }}>
          <span className="muted">
            答对 <b style={{ color: 'var(--ok)' }}>{correct}</b> / {answered} 题
          </span>
          <span className="muted">
            错题 <b style={{ color: 'var(--no)' }}>{wrongList.length}</b> 题
          </span>
          <span className="muted">用时约 {minutes} 分钟</span>
        </div>
      </div>

      {wrongList.length ? (
        <button
          className="btn btn-primary btn-block"
          onClick={() => onPractice({ label: `本轮错题 ${wrongList.length} 题`, questions: wrongList })}
        >
          立即重做本轮错题（{wrongList.length} 题）
        </button>
      ) : (
        <div className="card card-flat center">
          <div style={{ fontSize: 26 }}>🎉</div>
          <div style={{ fontWeight: 500 }}>全对，没有错题</div>
          <div className="tiny">继续加练可以巩固记忆</div>
        </div>
      )}

      <div>
        <div className="optgroup-label">逐题回看</div>
        <div className="list">
          {result.questions.map((q, i) => {
            const r = result.results[q.id];
            const open = openId === q.id;
            const state = !r ? 'skip' : r.correct ? 'ok' : 'no';
            return (
              <div key={q.id}>
                <button
                  className="list-item"
                  onClick={() => setOpenId(open ? null : q.id)}
                  aria-expanded={open}
                >
                  <span
                    className="badge"
                    style={{
                      background:
                        state === 'ok' ? 'var(--ok)' : state === 'no' ? 'var(--no)' : 'var(--surface-2)',
                      color: state === 'skip' ? 'var(--text-2)' : '#fff',
                    }}
                  >
                    {state === 'ok' ? '✓' : state === 'no' ? '✕' : '—'}
                  </span>
                  <span className="grow">
                    <div className="ellipsis" style={{ fontWeight: 500 }}>
                      {i + 1}. {q.stem}
                    </div>
                    <div className="tiny">
                      {TYPE_LABEL[q.type]} · {q.chapter}
                    </div>
                  </span>
                  <span className="muted" aria-hidden>
                    {open ? '▴' : '▾'}
                  </span>
                </button>

                {open ? (
                  <div style={{ padding: '0 14px 14px', background: 'var(--surface-2)' }}>
                    <div className="kv" style={{ marginTop: 8 }}>
                      <b>你的答案</b>
                      <span style={{ color: state === 'ok' ? 'var(--ok)' : 'var(--no)' }}>
                        {r ? describeAnswer(q, result.picks[q.id] ?? []) || '（未作答）' : '未作答'}
                      </span>
                    </div>
                    <div className="kv">
                      <b>正确答案</b>
                      <span style={{ color: 'var(--ok)', fontWeight: 500 }}>
                        {describeAnswer(q, q.answer.value)}
                      </span>
                    </div>
                    {q.explain ? <div className="muted" style={{ marginTop: 6 }}>解析：{q.explain}</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn-primary grow" onClick={onHome}>
          返回首页
        </button>
        {wrongList.length ? (
          <button
            className="btn grow"
            onClick={() =>
              onPractice({ label: `错题重做 ${wrongList.length} 题`, questions: wrongList })
            }
          >
            再练一遍错题
          </button>
        ) : null}
      </div>

      <div className="tiny center">
        错题已自动收录进错题本，会按间隔重复安排复习
      </div>
    </div>
  );
}
