import { useState } from 'react';
import { describeAnswer, feedbackHeadline } from '../core/grader';
import { relatedConcepts } from '../core/data';
import type { JudgeResult, Question } from '../core/types';
import { RichText } from './RichText';
import { tagLabel, useToast } from './ui';

/** 颜色图例：让用户知道每种颜色代表什么 */
export function HighlightLegend() {
  return (
    <div className="hl-legend">
      <span>
        <i className="hl hl-time">时间</i>
      </span>
      <span>
        <i className="hl hl-person">人物</i>
      </span>
      <span>
        <i className="hl hl-work">作品</i>
      </span>
      <span>
        <i className="hl hl-move">运动</i>
      </span>
      <span>
        <i className="hl hl-em">重点</i>
      </span>
    </div>
  );
}

export function Feedback({
  question,
  result,
  picked,
}: {
  question: Question;
  result: JudgeResult;
  picked: string[];
}) {
  const notify = useToast();
  const [showLegend, setShowLegend] = useState(false);

  const head = feedbackHeadline(question, result);
  const tone = result.correct ? 'is-ok' : result.mode === 'partial' ? 'is-part' : 'is-no';

  const yourText = describeAnswer(question, picked) || '（未作答）';
  const keyText = describeAnswer(question, question.answer.value);
  const cards = relatedConcepts(question, 2);

  const report = () => {
    const snippet = [
      `- 题号：\`${question.id}\`（作业${question.source.homework} 第 ${question.source.no} 题）`,
      `- 题干：${question.stem}`,
      `- 题目答案：${question.answer.display}`,
      `- 我的答案：${yourText}`,
      '',
    ].join('\n');
    navigator.clipboard
      ?.writeText(snippet)
      .then(() => notify('已复制该题信息，可直接发给老师或提 Issue'))
      .catch(() => notify('复制失败，请手动截图反馈'));
  };

  return (
    <div className="fb">
      <div className={`fb-head ${tone}`}>
        <span aria-hidden>{result.correct ? '✓' : result.mode === 'partial' ? '△' : '✕'}</span>
        <span>{head}</span>
      </div>

      <div className="fb-body">
        {!result.correct ? (
          <div className="kv">
            <b>你的答案</b>
            <span style={{ color: 'var(--no)' }}>{yourText}</span>
          </div>
        ) : null}

        <div className="kv">
          <b>正确答案</b>
          <span style={{ color: 'var(--ok)', fontWeight: 500 }}>{keyText}</span>
        </div>

        {question.explain ? (
          <div className="explain">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>解析</h3>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 6px', minHeight: 24, fontSize: 12 }}
                onClick={() => setShowLegend((v) => !v)}
              >
                {showLegend ? '隐藏颜色说明' : '颜色说明'}
              </button>
            </div>
            {showLegend ? <HighlightLegend /> : null}
            <div style={{ lineHeight: 1.85 }}>
              <RichText text={question.explain} />
            </div>
          </div>
        ) : null}

        {cards.length ? (
          <div className="explain">
            <h3>相关知识点</h3>
            {cards.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <b style={{ fontWeight: 500 }}>{c.title}</b>
                <div className="muted" style={{ marginTop: 2 }}>
                  <RichText text={c.points[0] ?? c.definition} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {question.tags.length ? (
          <div>
            {question.tags.map((t) => (
              <span className="tag" key={t}>
                {tagLabel(t)}
              </span>
            ))}
          </div>
        ) : null}

        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={report}>
          这题答案有问题
        </button>
      </div>
    </div>
  );
}
