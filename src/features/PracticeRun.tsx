import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judge } from '../core/grader';
import { TYPE_LABEL } from '../core/scheduler';
import { recordAnswer, useStore } from '../core/store';
import type { JudgeResult, Question } from '../core/types';
import { Feedback } from '../components/Feedback';
import { QuestionCard, QuestionMeta } from '../components/QuestionCard';
import { Bar } from '../components/ui';
import { maybeShuffleOptions } from '../core/practice';
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

  // 选项乱序在进入本轮时做一次：同一轮内顺序固定，换个轮次顺序不同，
  // 避免「正确答案总在 B 位」这种位置记忆。
  const [questions] = useState<Question[]>(() =>
    maybeShuffleOptions(spec.questions, store.prefs.shuffleOptions),
  );

  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, JudgeResult>>({});
  const startedAt = useRef(Date.now());
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const total = questions.length;
  // 防御：任何情况下都不让 index 越界，否则 questions[index] 为 undefined，
  // 下面取 question.id 会直接抛错，整棵组件树会被卸载（表现为白屏 / 卡死）。
  const safeIndex = Math.min(Math.max(index, 0), Math.max(0, total - 1));
  const question = questions[safeIndex];
  const locked = question ? Boolean(results[question.id]) : false;
  const draft = question ? picks[question.id] ?? [] : [];

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
      questions,
      picks,
      results,
      durationMs: Date.now() - startedAt.current,
    });
  }, [onFinish, picks, questions, results, spec]);

  const goNext = useCallback(() => {
    if (safeIndex >= total - 1) finish();
    // 夹在合法范围内：即使因为重复触发多走了一步，也不会越界
    else setIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
  }, [finish, safeIndex, total]);

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
      // 长按会连发 repeat 事件，不拦会一次性跳过好几题
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
  /**
   * 只把「明确的横向滑动」当作翻页，且**从按钮 / 输入框上开始的触摸一律不参与**。
   *
   * 之前的写法只看横向位移是否超过 60px，导致在「下一题」按钮上点按时手指轻微右移
   * 会被当成选中「右滑 = 回退一题」：手指右滑 → goPrev 退回上一题，随后这次点按又回到
   * 原题 —— 净效果就是点了下一题却停在原地，反复操作会一直卡在同一题。
   * 所以这里：①排除按钮/输入控件；②要求横向位移明显大于纵向（否则是在滚动页面）；
   * ③阈值提高到 70px。
   */
  const INTERACTIVE = 'button, input, textarea, select, a, label';

  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(INTERACTIVE)) {
      swipe.current = null;
      return;
    }
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    if (Math.abs(dx) < 70) return;
    // 纵向位移更大说明用户在上下滚动，不能翻页
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (dx < 0) {
      // 左滑 = 前进，仍要求本题已作答，避免把多选题直接划过去
      if (locked) goNext();
    } else {
      goPrev();
    }
  };

  const progress = useMemo(
    () => (total ? (safeIndex + 1) / total : 0),
    [safeIndex, total],
  );

  // 空题单兜底：宁可给一句提示，也不要让 question 为 undefined 把整个页面带崩
  if (!question) {
    return (
      <div className="stack-lg">
        <div className="empty">
          <div className="big">—</div>
          <div style={{ fontWeight: 500 }}>这一组没有题目</div>
          <div className="muted" style={{ marginTop: 4 }}>
            可能是筛选条件太窄，回到首页换一组试试
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={onExit}>
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="stack" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* 顶部进度 */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <button className="btn btn-ghost btn-sm" onClick={onExit}>
            ← 退出
          </button>
          <span className="tiny">
            {safeIndex + 1} / {total} · 答对 {correctCount}/{answered || 0}
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
        <button className="btn" disabled={safeIndex === 0} onClick={goPrev}>
          上一题
        </button>
        <button
          className={`btn grow ${locked ? 'btn-primary' : ''}`}
          disabled={!locked && question.type !== 'single' && question.type !== 'judge'}
          onClick={goNext}
        >
          {safeIndex >= total - 1 ? '查看结果' : '下一题 →'}
        </button>
      </div>

      <div className="tiny center">
        {TYPE_LABEL[question.type]} · 已作答 {answered}/{total}
        {store.prefs.nickname ? ` · ${store.prefs.nickname}` : ''}
      </div>
    </div>
  );
}
