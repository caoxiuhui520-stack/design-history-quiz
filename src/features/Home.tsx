import { CHAPTER_ORDER, EXAM_DATE, chapters, questions } from '../core/data';
import { buildPractice } from '../core/practice';
import type { PracticeSessionSpec } from '../core/practice';
import { chapterStats, dueCount, TYPE_LABEL } from '../core/scheduler';
import { useStore } from '../core/store';
import type { Question, QuestionType } from '../core/types';
import { Bar, pct } from '../components/ui';

interface Props {
  onPractice: (s: PracticeSessionSpec) => void;
  go: (v: 'setup' | 'wrong' | 'cards' | 'essay' | 'stats' | 'map') => void;
}

/** 一组默认 15 题：用户反馈一次 60 题太长，专注不下来 */
const BATCH_DEFAULT = 15;
const BATCH_OPTIONS = [5, 10, 20, 30];

function daysToExam(): number {
  const now = Date.now();
  const exam = new Date(EXAM_DATE).getTime();
  return Math.max(0, Math.ceil((exam - now) / 86_400_000));
}

export function Home({ onPractice, go }: Props) {
  const store = useStore();
  const now = Date.now();
  const due = dueCount(questions, store.records, now);
  const stats = chapterStats(questions, store.records);
  const accuracy = store.totals.answered ? store.totals.correct / store.totals.answered : 0;
  const covered = questions.filter((q) => store.records[q.id]?.seen).length;

  const quickTypes: QuestionType[] = ['single', 'blank', 'judge'];

  const start = (spec: Parameters<typeof buildPractice>[0]) =>
    onPractice(buildPractice(spec, questions, store.records, now));

  return (
    <div className="stack-lg">
      {/* ---------------------------------------------------------- 今日复习 */}
      <div className="hero">
        <div className="hero-blocks" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="tiny">距离考试还有</div>
        <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 34, fontWeight: 500, lineHeight: 1.1 }}>{daysToExam()}</span>
          <span className="muted">天 · 9 月 15 日</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>今日待复习 {due.total} 题</span>
            <span className="tiny">
              错题 {due.wrong} · 到期 {due.due} · 新题 {due.fresh}
            </span>
          </div>
          <Bar value={due.total ? 1 - due.fresh / Math.max(1, questions.length) : 0} />
        </div>

        {/* 默认小批量：一次 15 题更容易专注，做完可以「再来一组」 */}
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 14 }}
          disabled={due.total === 0}
          onClick={() => start({ mode: 'due', limit: BATCH_DEFAULT })}
        >
          {due.total === 0
            ? '今日复习已清空 🎉'
            : `开始复习（${Math.min(BATCH_DEFAULT, due.total)} 题 · 约 8 分钟）`}
        </button>

        {due.total > 0 ? (
          <div className="row wrap" style={{ gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <span className="tiny">一次想刷：</span>
            {BATCH_OPTIONS.map((n) => (
              <button
                key={n}
                className="chip"
                onClick={() => start({ mode: 'due', limit: n })}
              >
                {n} 题
              </button>
            ))}
            <button className="chip" onClick={() => start({ mode: 'due', limit: 999 })}>
              全部 {due.total} 题
            </button>
          </div>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- 快速入口 */}
      <div>
        <div className="optgroup-label">快速开始</div>
        <div className="grid-3">
          <button className="tile" onClick={() => start({ mode: 'all', order: 'random', limit: 20 })}>
            <b>全量乱序</b>
            <span>随机 20 题</span>
          </button>
          <button className="tile" onClick={() => go('wrong')}>
            <b>错题本</b>
            <span>{due.wrong} 题</span>
          </button>
          <button className="tile" onClick={() => go('setup')}>
            <b>自定义</b>
            <span>按章节/题型</span>
          </button>
        </div>
        <div className="grid-3" style={{ marginTop: 10 }}>
          {quickTypes.map((t) => (
            <button key={t} className="tile" onClick={() => start({ mode: 'type', type: t })}>
              <b>{TYPE_LABEL[t]}</b>
              <span>{questions.filter((q: Question) => q.type === t).length} 题</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- 学习概况 */}
      <div className="grid-2">
        <div className="card">
          <div className="tiny">累计作答</div>
          <div style={{ fontSize: 24, fontWeight: 500 }}>{store.totals.answered}</div>
          <div className="tiny">覆盖 {covered}/{questions.length} 题</div>
        </div>
        <div className="card">
          <div className="tiny">正确率</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: accuracy >= 0.8 ? 'var(--ok)' : 'var(--no)' }}>
            {store.totals.answered ? pct(accuracy) : '—'}
          </div>
          <div className="tiny">答对 {store.totals.correct} 题</div>
        </div>
      </div>

      {/* ---------------------------------------------------------- 记忆工具 */}
      <div>
        <div className="optgroup-label">记忆工具</div>
        <div className="list">
          <button className="list-item" onClick={() => go('map')}>
            <span className="badge yellow">脉</span>
            <span className="grow">
              <b style={{ fontWeight: 500 }}>知识脉络</b>
              <div className="tiny">时间轴 · 影响关系 · 人物归属 · 易混淆对照</div>
            </span>
            <span className="muted">→</span>
          </button>
          <button className="list-item" onClick={() => go('cards')}>
            <span className="badge blue">卡</span>
            <span className="grow">
              <b style={{ fontWeight: 500 }}>速记卡</b>
              <div className="tiny">31 张知识点卡片，抽认式记忆</div>
            </span>
            <span className="muted">→</span>
          </button>
          <button className="list-item" onClick={() => go('essay')}>
            <span className="badge red">大</span>
            <span className="grow">
              <b style={{ fontWeight: 500 }}>大题自测</b>
              <div className="tiny">14 道简答/论述，踩分点自评</div>
            </span>
            <span className="muted">→</span>
          </button>
          <button className="list-item" onClick={() => go('stats')}>
            <span className="badge yellow">数</span>
            <span className="grow">
              <b style={{ fontWeight: 500 }}>学习统计</b>
              <div className="tiny">章节掌握度与薄弱点</div>
            </span>
            <span className="muted">→</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- 分章节 */}
      <div>
        <div className="optgroup-label">按章节练习（共 {chapters().length} 章）</div>
        <div className="list">
          {CHAPTER_ORDER.filter((c) => stats.some((s) => s.chapter === c)).map((chapter) => {
            const s = stats.find((x) => x.chapter === chapter)!;
            const ratio = s.total ? s.mastered / s.total : 0;
            return (
              <div className="list-item" key={chapter} style={{ cursor: 'pointer' }} onClick={() => start({ mode: 'chapter', chapter })}>
                <span className="grow">
                  <div className="row-between">
                    <b style={{ fontWeight: 500 }}>{chapter}</b>
                    <span className="tiny">
                      {s.total} 题{s.seen ? ` · 正确率 ${pct(s.accuracy)}` : ''}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Bar value={ratio} tone={ratio >= 0.8 ? 'ok' : 'blue'} />
                  </div>
                </span>
                <span className="muted" aria-hidden>
                  {ratio >= 1 ? '✓' : '→'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------- 后续 */}
      <div className="card card-flat">
        <div className="tiny">
          首版聚焦「刷题 + 即时反馈 + 错题本 + 速记卡 + 大题自测」。
          多人房间（房间码 / 抢答 PK）与 PWA 离线正在开发中。
        </div>
      </div>
    </div>
  );
}
