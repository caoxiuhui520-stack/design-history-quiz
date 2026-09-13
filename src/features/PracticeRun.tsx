import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judge } from '../core/grader';
import { TYPE_LABEL } from '../core/scheduler';
import { recordAnswer, useStore } from '../core/store';
import type { JudgeResult, Question } from '../core/types';
import { Feedback } from '../components/Feedback';
import { QuestionCard, QuestionMeta } from '../components/QuestionCard';
import { Bar } from '../components/ui';
import type { PracticeSessionSpec } from '../core/practice';

export interface SessionResult {
  label: string;
  questions: Question[];
  picks: Record<string, string[]>;
  results: Record<string, JudgeResult>;
  durationMs: number;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

export function PracticeRun({
  spec,
  onFinish,
  onExit,
}: {
  spec: PracticeSessionSpec;
  onFinish: (r: SessionResult) => void;
  onExit: () => void;
}) {
  const store = useStore();
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, JudgeResult>>({});
  const startedAt = useRef(Date.now());
  const touchX = useRef<number | null>(null);

  const total = spec.questions.length;
  const question = spec.questions[index];
  const locked = Boolean(results[question.id]);
  const draft = picks[question.id] ?? [];

  const answered = Object.keys(results).length;
  const correctCount = Object.values(results).filter((r) => r.correct).length;

  const commit = useCallback(
    (answer: string[]) => {
      if (results[question.id]) return;
      const res = judge(question, answer);
      setResults((prev) => ({ ...prev, [question.id]: res }));
      recordAnswer(question.id, res.correct, answer);
    },
    [question, results],
  );

  const finish = useCallback(() => {
    onFinish({
      label: spec.label,
      questions: spec.questions,
      picks,
      results,
      durationMs: Date.now() - startedAt.current,
    });
  }, [onFinish, picks, results, spec]);

  const goNext = useCallback(() => {
    if (index >= total - 1) finish();
    else setIndex((i) => i + 1);
  }, [finish, index, total]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /* ------------------------------------------------------ 单选 / 判断点选 */
  const handlePick = (key: string) => {
    if (locked) return;
    if (question.type === 'multiple') {
      const next = draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key];
      setPicks((prev) => ({ ...prev, [question.id]: next }));
    } else {
      setPicks((prev) => ({ ...prev, [question.id]: [key] }));
      commit([key]);
    }
  };

  const handleBlank = (i: number, value: string) => {
    if (locked) return;
    const next = [...draft];
    next[i] = value;
    setPicks((prev) => ({ ...prev, [question.id]: next }));
  };

  /* --------------------------------------------------------- 键盘快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (locked) goNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        goPrev();
        return;
      }
      const idx = OPTION_KEYS.indexOf(e.key.toUpperCase());
      if (idx >= 0 && (question.type === 'single' || question.type === 'multiple')) {
        const opt = question.options[idx];
        if (opt) handlePick(opt.key);
      }
      if (question.type === 'judge') {
        if (e.key.toLowerCase() === 't' || e.key === '1') handlePick('T');
        if (e.key.toLowerCase() === 'f' || e.key === '2') handlePick('F');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ----------------------------------------------------------- 滑动手势 */
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && locked) goNext();
    if (dx > 0) goPrev();
  };

  const progress = useMemo(() => (index + 1) / total, [index, total]);

  return (
    <div className="stack" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* 顶部进度 */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <button className="btn btn-ghost btn-sm" onClick={onExit}>
            ← 退出
          </button>
          <span className="tiny">
            {index + 1} / {total} · 答对 {correctCount}/{answered || 0}
          </span>
        </div>
        <Bar value={progress} tone={progress >= 1 ? 'ok' : 'red'} />
      </div>

      {/* 题目 */}
      <div className="card stack" style={{ gap: 14 }}>
        <QuestionMeta question={question} />
        <QuestionCard
          question={question}
          picked={draft}
          blanks={draft}
          locked={locked}
          result={results[question.id] ?? null}
          onPick={handlePick}
          onBlank={handleBlank}
          onSubmit={() => commit(draft)}
          onBlankSubmit={() => commit(draft)}
        />
      </div>

      {/* 反馈（本地判分，无网络等待） */}
      {locked ? <Feedback question={question} result={results[question.id]} picked={draft} /> : null}

      {/* 底部操作 */}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" disabled={index === 0} onClick={goPrev}>
          上一题
        </button>
        <button
          className={`btn grow ${locked ? 'btn-primary' : ''}`}
          disabled={!locked && question.type !== 'single' && question.type !== 'judge'}
          onClick={goNext}
        >
          {index >= total - 1 ? '查看结果' : '下一题 →'}
        </button>
      </div>

      <div className="tiny center">
        {TYPE_LABEL[question.type]} · 已作答 {answered}/{total}
        {store.prefs.nickname ? ` · ${store.prefs.nickname}` : ''}
      </div>
    </div>
  );
}
