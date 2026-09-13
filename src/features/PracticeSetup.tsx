import { useState } from 'react';
import { chapters, questions } from '../core/data';
import { buildPractice, typeTiles } from '../core/practice';
import type { PracticeSessionSpec } from '../core/practice';
import { useStore } from '../core/store';
import type { QuestionType } from '../core/types';

export function PracticeSetup({
  onPractice,
  onBack,
}: {
  onPractice: (s: PracticeSessionSpec) => void;
  onBack: () => void;
}) {
  const store = useStore();
  const [mode, setMode] = useState<'all' | 'type' | 'chapter' | 'wrong'>('all');
  const [type, setType] = useState<QuestionType>('single');
  const [chapter, setChapter] = useState(chapters()[0]);
  const [order, setOrder] = useState<'sequence' | 'random'>('sequence');
  const [limit, setLimit] = useState<number>(0);

  const preview = buildPractice(
    {
      mode,
      type,
      chapter,
      order,
      limit: limit || undefined,
    },
    questions,
    store.records,
  );

  const start = () => {
    if (!preview.questions.length) return;
    onPractice(preview);
  };

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <div>
        <div className="optgroup-label">练习范围</div>
        <div className="grid-2">
          {[
            { k: 'all', label: '全量题库', sub: `${questions.length} 题` },
            { k: 'wrong', label: '只练错题', sub: `${Object.values(store.records).filter((r) => r.box === 0).length} 题` },
            { k: 'type', label: '按题型', sub: '单选/多选/判断/填空' },
            { k: 'chapter', label: '按章节', sub: `${chapters().length} 章` },
          ].map((x) => (
            <button
              key={x.k}
              className={`tile ${mode === (x.k as typeof mode) ? 'is-on' : ''}`}
              onClick={() => setMode(x.k as typeof mode)}
            >
              <b>{x.label}</b>
              <span>{x.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === 'type' ? (
        <div>
          <div className="optgroup-label">选择题型</div>
          <div className="grid-2">
            {typeTiles(questions).map((t) => (
              <button
                key={t.type}
                className={`tile ${type === t.type ? 'is-on' : ''}`}
                onClick={() => setType(t.type)}
              >
                <b>{t.type === 'single' ? '单选题' : t.type === 'multiple' ? '多选题' : t.type === 'judge' ? '判断题' : '填空题'}</b>
                <span>{t.count} 题</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'chapter' ? (
        <div>
          <div className="optgroup-label">选择章节</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {chapters().map((c) => (
              <button
                key={c}
                className={`chip ${chapter === c ? 'is-on' : ''}`}
                onClick={() => setChapter(c)}
              >
                {c}（{questions.filter((q) => q.chapter === c).length}）
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="optgroup-label">出题顺序</div>
        <div className="grid-2">
          <button className={`tile ${order === 'sequence' ? 'is-on' : ''}`} onClick={() => setOrder('sequence')}>
            <b>按顺序</b>
            <span>按作业题号</span>
          </button>
          <button className={`tile ${order === 'random' ? 'is-on' : ''}`} onClick={() => setOrder('random')}>
            <b>乱序</b>
            <span>打乱便于检验</span>
          </button>
        </div>
      </div>

      <div>
        <div className="optgroup-label">一次刷多少题</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {[10, 15, 20, 30, 0].map((n) => (
            <button key={n} className={`chip ${limit === n ? 'is-on' : ''}`} onClick={() => setLimit(n)}>
              {n === 0 ? '不限' : `${n} 题`}
            </button>
          ))}
        </div>
        <div className="tiny" style={{ marginTop: 6 }}>
          建议一次 10–15 题，做完一组再回来「再来一组」——短批次更容易坚持。
        </div>
      </div>

      <button className="btn btn-primary btn-block" disabled={!preview.questions.length} onClick={start}>
        {preview.questions.length ? `开始练习（${preview.questions.length} 题）` : '该范围下没有题目'}
      </button>

      <div className="tiny center">{preview.label}</div>
    </div>
  );
}
