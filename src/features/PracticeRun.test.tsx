// @vitest-environment jsdom
/**
 * 答题流程的交互回归测试。
 *
 * 存在的意义：这类「点下一题没反应」的问题，光看代码很难定位 —— 必须真实渲染、
 * 真实点击，才能把状态机的行为钉死。以下每个用例都对应一种用户实际会做的操作序列。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PracticeRun } from './PracticeRun';
import { ToastProvider } from '../components/ui';
import type { PracticeSessionSpec } from '../core/practice';
import type { Question } from '../core/types';

// 每个用例后强制清理：否则某个用例断言失败时会残留 DOM，
// 让后面的用例报「found multiple elements」这种二次误报，掩盖真正的原因。
afterEach(cleanup);

/* --------------------------------------------------------------- 造题 */

const single: Question = {
  id: 't-single',
  type: 'single',
  chapter: '测试',
  stem: '单选：被称为现代广告之父的是（）。',
  options: [
    { key: 'A', text: '舍雷' },
    { key: 'B', text: '加雷' },
    { key: 'C', text: '拉里克' },
  ],
  answer: { value: ['A'], display: 'A', accepted: ['A'] },
  explain: '这是一条用于测试的解析文本，长度足够通过校验。',
  tags: [],
  source: { homework: 9, workId: 't', no: 1, typeName: '单选题' },
};

const multi: Question = {
  id: 't-multi',
  type: 'multiple',
  chapter: '测试',
  stem: '多选：属于新艺术运动代表国家的是（）。',
  options: [
    { key: 'A', text: '法国' },
    { key: 'B', text: '比利时' },
    { key: 'C', text: '德国' },
  ],
  answer: { value: ['A', 'B'], display: 'AB', accepted: ['A', 'B'] },
  explain: '这是一条用于测试的解析文本，长度足够通过校验。',
  tags: [],
  source: { homework: 9, workId: 't', no: 2, typeName: '多选题' },
};

const blank: Question = {
  id: 't-blank',
  type: 'blank',
  chapter: '测试',
  stem: '填空：[?] 年，[?] 成立。',
  options: [],
  answer: { value: ['1919', '包豪斯'], display: '1919；包豪斯', accepted: ['1919', '包豪斯'] },
  explain: '这是一条用于测试的解析文本，长度足够通过校验。',
  tags: [],
  source: { homework: 9, workId: 't', no: 3, typeName: '填空题' },
  stemParts: ['填空：', ' 年，', ' 成立。'],
  blankCount: 2,
};

const judge: Question = {
  id: 't-judge',
  type: 'judge',
  chapter: '测试',
  stem: '判断：包豪斯是第一所现代设计教育学院。',
  options: [],
  answer: { value: ['T'], display: '对', accepted: ['T'] },
  explain: '这是一条用于测试的解析文本，长度足够通过校验。',
  tags: [],
  source: { homework: 9, workId: 't', no: 4, typeName: '判断题' },
};

function setup(questions: Question[], shuffleOptions = false) {
  const spec: PracticeSessionSpec = { label: '测试', questions };
  const onFinish = vi.fn();
  const onExit = vi.fn();
  const utils = render(
    <ToastProvider>
      <PracticeRun spec={spec} onFinish={onFinish} onExit={onExit} />
    </ToastProvider>,
  );
  return { onFinish, onExit, container: utils.container };
}

/** 模拟一次触摸：start 用 touches，end 用 changedTouches */
function touch(el: Element, phase: 'start' | 'end', x: number, y: number) {
  if (phase === 'start') {
    fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
  } else {
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: x, clientY: y }] });
  }
}

/** 找到「下一题 / 查看结果」按钮 */
function nextButton(): HTMLButtonElement {
  const btn = screen
    .getAllByRole('button')
    .find((b) => /下一题|查看结果/.test(b.textContent ?? ''));
  if (!btn) throw new Error('找不到下一题按钮');
  return btn as HTMLButtonElement;
}

function progressText(): string {
  return screen.getByText(/^\d+ \/ \d+/).textContent ?? '';
}

/* ------------------------------------------------------------- 用例 */

describe('答题流程 · 下一题推进', () => {
  it('单选题：点选后下一题可推进', () => {
    setup([single, multi]);
    expect(progressText()).toContain('1 / 2');
    fireEvent.click(screen.getByText('舍雷'));
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 2');
    cleanup();
  });

  it('单选题：未作答也允许跳过（选项按钮不该把流程卡死）', () => {
    setup([single, multi]);
    expect(nextButton().disabled).toBe(false);
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 2');
    cleanup();
  });

  it('多选题：未提交时禁用下一题，提交后可推进', () => {
    setup([multi, single]);
    // 未选任何选项 → 下一题禁用（因为还没提交）
    expect(nextButton().disabled).toBe(true);

    fireEvent.click(screen.getByText('法国'));
    fireEvent.click(screen.getByText('比利时'));
    // 选完了，但仍需提交
    expect(nextButton().disabled).toBe(true);

    fireEvent.click(screen.getByText(/提交答案/));
    expect(nextButton().disabled).toBe(false);

    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 2');
    cleanup();
  });

  it('填空题：输入后可提交并推进', () => {
    setup([blank, single]);
    expect(nextButton().disabled).toBe(true);

    const inputs = screen.getAllByPlaceholderText(/空\d/);
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0], { target: { value: '1919' } });

    fireEvent.click(screen.getByText(/提交答案/));
    expect(nextButton().disabled).toBe(false);

    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 2');
    cleanup();
  });

  it('最后一题显示「查看结果」，点击后触发 onFinish', () => {
    const { onFinish } = setup([single]);
    expect(nextButton().textContent).toContain('查看结果');
    fireEvent.click(nextButton());
    expect(onFinish).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('上一题可回退，且回退后仍能前进（来回切换不丢状态）', () => {
    setup([single, judge, multi]);
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 3');
    fireEvent.click(screen.getByText('上一题'));
    expect(progressText()).toContain('1 / 3');
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 3');
    fireEvent.click(nextButton());
    expect(progressText()).toContain('3 / 3');
    cleanup();
  });

  it('连点两次「下一题」不会越界（不会卡死或白屏）', () => {
    const { onFinish } = setup([single, judge]);

    // 连续两次点击：第一次推进到第 2 题，第二次应触发完成而不是把 index 顶到越界
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());

    // 关键断言：组件仍然活着（没有因为 questions[undefined] 抛错而卸载）
    expect(screen.getByText(/^\d+ \/ \d+/)).toBeTruthy();
    expect(onFinish).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('选项乱序开启时，点选与判分仍然正确', () => {
    setup([single, multi], true);
    // 乱序后「舍雷」仍在页面上，点它应当被判对
    fireEvent.click(screen.getByText('舍雷'));
    expect(screen.getByText('回答正确')).toBeTruthy();
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 2');
    cleanup();
  });

  it('每题都能走完：单选出答案 → 多选提交 → 填空提交 → 完成', () => {
    const { onFinish } = setup([single, multi, blank]);

    fireEvent.click(screen.getByText('舍雷'));
    fireEvent.click(nextButton());

    fireEvent.click(screen.getByText('法国'));
    fireEvent.click(screen.getByText('比利时'));
    fireEvent.click(screen.getByText(/提交答案/));
    fireEvent.click(nextButton());

    fireEvent.change(screen.getAllByPlaceholderText(/空\d/)[0], { target: { value: '1919' } });
    fireEvent.click(screen.getByText(/提交答案/));
    fireEvent.click(nextButton());

    expect(onFinish).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

/* ------------------------------------------- 触摸 / 滑动（手机上的主要操作方式） */

describe('滑动手势 · 不能把点击翻页吃掉', () => {
  /**
   * 这一组是「卡题」bug 的回归测试。
   *
   * 旧实现只看横向位移是否超过 60px。于是在「下一题」上点按时，只要手指轻微右移，
   * 就会先被当成「右滑 = 回退一题」，紧接着这次点按又前进一题 —— 净效果是原地不动，
   * 用户看到的就是「点下一题卡在这一题」。
   */

  it('在「下一题」按钮上点按并右移 80px：应当正常前进，不能原地不动', () => {
    const { container } = setup([single, judge, multi]);
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 3');

    // 一次「点按 + 手指右移」：起点落在按钮上
    const btn = nextButton();
    touch(btn, 'start', 200, 400);
    touch(btn, 'end', 280, 402);
    fireEvent.click(btn);

    // 修复前：右滑把 index 退回 0，点击又回到 1 → 仍是 2/3（卡住）
    expect(progressText()).toContain('3 / 3');
    cleanup();
  });

  it('在「上一题」按钮上点按并左移，不应被误判成前进', () => {
    setup([single, judge, multi]);
    fireEvent.click(nextButton());
    expect(progressText()).toContain('2 / 3');

    const prev = screen.getByText('上一题');
    touch(prev, 'start', 200, 400);
    touch(prev, 'end', 120, 400);
    fireEvent.click(prev);

    // 只应该是「上一题」本身的效果
    expect(progressText()).toContain('1 / 3');
    cleanup();
  });

  it('在题目区域左滑（已作答）可以前进', () => {
    const { container } = setup([single, judge, multi]);
    fireEvent.click(screen.getByText('舍雷')); // 先作答，左滑才允许前进
    const area = container.firstElementChild!;
    touch(area, 'start', 300, 400);
    touch(area, 'end', 180, 405);
    expect(progressText()).toContain('2 / 3');
    cleanup();
  });

  it('在题目区域右滑可以回退', () => {
    const { container } = setup([single, judge, multi]);
    fireEvent.click(nextButton());
    const area = container.firstElementChild!;
    touch(area, 'start', 150, 400);
    touch(area, 'end', 280, 400);
    expect(progressText()).toContain('1 / 3');
    cleanup();
  });

  it('纵向为主的滑动不翻页（用户其实在滚动页面）', () => {
    const { container } = setup([single, judge, multi]);
    const area = container.firstElementChild!;
    // 横向 80px 但纵向 200px：属于滚动，不是翻页
    touch(area, 'start', 300, 200);
    touch(area, 'end', 220, 400);
    expect(progressText()).toContain('1 / 3');
    cleanup();
  });
});
