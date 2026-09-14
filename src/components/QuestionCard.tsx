import { Fragment } from 'react';
import type { JudgeResult, Question } from '../core/types';
import { STATUS_LABEL, TYPE_LABEL, questionStatus } from '../core/scheduler';
import { useStore } from '../core/store';

interface Props {
  question: Question;
  /** 单选/多选/判断：选中的选项字母 */
  picked: string[];
  /** 填空：每个空的输入值 */
  blanks: string[];
  /** 已判分后锁定，不可再改 */
  locked: boolean;
  result: JudgeResult | null;
  /** 当前题是否曾答错，用于给错题打标记 */
  onPick: (key: string) => void;
  onBlank: (index: number, value: string) => void;
  onSubmit: () => void;
  onBlankSubmit: () => void;
}

function OptionRow({
  question,
  option,
  state,
  locked,
  multi,
  onClick,
}: {
  question: Question;
  option: { key: string; text: string };
  state: 'idle' | 'picked' | 'correct' | 'wrong';
  locked: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  const cls = [
    'opt',
    state === 'picked' ? 'is-picked' : '',
    state === 'correct' ? 'is-correct' : '',
    state === 'wrong' ? 'is-wrong' : '',
    locked ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} onClick={onClick} disabled={locked} role={multi ? 'checkbox' : 'radio'} aria-checked={state !== 'idle'}>
      <span className="opt-key" aria-hidden>
        {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : option.key}
      </span>
      <span className="opt-text">{option.text}</span>
    </button>
  );
}

export function QuestionCard({
  question,
  picked,
  blanks,
  locked,
  result,
  onPick,
  onBlank,
  onSubmit,
  onBlankSubmit,
}: Props) {
  const isMulti = question.type === 'multiple';
  const key = question.answer.value;

  /* -------------------------------------------------------- 单选 / 多选 */
  if (question.type === 'single' || isMulti) {
    return (
      <div className="stack">
        <div className="stem">{question.stem}</div>
        <div className="stack" style={{ gap: 10 }}>
          {question.options.map((opt) => {
            const isPicked = picked.includes(opt.key);
            let state: 'idle' | 'picked' | 'correct' | 'wrong' = isPicked ? 'picked' : 'idle';
            if (locked && result) {
              // 锁定后：正确答案一律变绿；错选变红
              if (key.includes(opt.key)) state = 'correct';
              else if (isPicked) state = 'wrong';
              else state = 'idle';
            }
            return (
              <OptionRow
                key={opt.key}
                question={question}
                option={opt}
                state={state}
                locked={locked}
                multi={isMulti}
                onClick={() => onPick(opt.key)}
              />
            );
          })}
        </div>
        {isMulti && !locked ? (
          <button
            className="btn btn-primary btn-block"
            disabled={picked.length === 0}
            onClick={onSubmit}
          >
            提交答案（已选 {picked.length} 项，可多选）
          </button>
        ) : null}
      </div>
    );
  }

  /* ------------------------------------------------------------ 判断题 */
  if (question.type === 'judge') {
    const correctKey = key[0];
    return (
      <div className="stack">
        <div className="stem">{question.stem}</div>
        <div className="grid-2">
          {[
            { k: 'T', label: '✓ 正确' },
            { k: 'F', label: '✕ 错误' },
          ].map((opt) => {
            const isPicked = picked.includes(opt.k);
            let state: 'idle' | 'picked' | 'correct' | 'wrong' = isPicked ? 'picked' : 'idle';
            if (locked && result) {
              if (opt.k === correctKey) state = 'correct';
              else if (isPicked) state = 'wrong';
              else state = 'idle';
            }
            const cls = [
              'opt',
              'center',
              state === 'picked' ? 'is-picked' : '',
              state === 'correct' ? 'is-correct' : '',
              state === 'wrong' ? 'is-wrong' : '',
              locked ? 'is-locked' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button key={opt.k} className={cls} disabled={locked} onClick={() => onPick(opt.k)} style={{ justifyContent: 'center' }}>
                <span className="opt-text" style={{ textAlign: 'center', fontWeight: 500 }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ 填空题 */
  const parts = question.stemParts ?? [question.stem];
  const expected = question.answer.value;

  return (
    <div className="stack">
      <div className="stem-blank">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {part}
            {i < parts.length - 1 ? (
              <input
                className={[
                  'blank-input',
                  locked && result
                    ? result.blanks?.[i]?.ok
                      ? 'is-correct'
                      : 'is-wrong'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                value={blanks[i] ?? ''}
                disabled={locked}
                placeholder={`空${i + 1}`}
                inputMode={/^\d+$/.test(expected[i] ?? '') ? 'numeric' : 'text'}
                style={{
                  width: Math.min(
                    280,
                    Math.max(96, ((expected[i] ?? '').length || 3) * 19 + 30),
                  ),
                }}
                onChange={(e) => onBlank(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const inputs = (e.currentTarget.closest('.stem-blank') as HTMLElement)?.querySelectorAll('input');
                    const list = inputs ? Array.from(inputs) : [];
                    const idx = list.indexOf(e.currentTarget);
                    if (idx >= 0 && idx < list.length - 1) list[idx + 1].focus();
                    else onBlankSubmit();
                  }
                }}
              />
            ) : null}
          </Fragment>
        ))}
      </div>

      {locked && result?.blanks ? (
        <div className="stack" style={{ gap: 6 }}>
          {result.blanks.map((b, i) => (
            <div key={i} className="kv">
              <b>空{i + 1}</b>
              <span style={{ color: b.ok ? 'var(--ok)' : 'var(--no)' }}>
                {b.ok ? '✓ 正确' : `✕ ${b.expected}`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <button
          className="btn btn-primary btn-block"
          disabled={blanks.every((b) => !b?.trim())}
          onClick={onBlankSubmit}
        >
          提交答案（共 {expected.length} 空）
        </button>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  new: 'blue',
  weak: 'red',
  learning: 'ghost',
  mastered: 'ghost',
};

export function QuestionMeta({ question }: { question: Question }) {
  const store = useStore();
  const status = questionStatus(store.records[question.id]);
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <span className="badge ghost">{TYPE_LABEL[question.type] ?? question.type}</span>
      <span className="badge ghost">{question.chapter}</span>
      {/* 告诉用户这题为什么出现：新题优先、薄弱的会多出现、已掌握的少出现 */}
      <span
        className={`badge ${STATUS_TONE[status] ?? 'ghost'}`}
        title="出题权重状态：新题优先 → 待加强 → 巩固中 → 已掌握（少出现）"
      >
        {STATUS_LABEL[status]}
      </span>
      <span className="tiny mono">{question.id}</span>
    </div>
  );
}
