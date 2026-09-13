/**
 * 本地持久化 store。
 *
 * 极简实现：模块级单一状态 + 订阅集合 + React 18 useSyncExternalStore。
 * 不引入 Zustand —— 本项目只有一个 store，用一个库来管一个是负收益。
 */

import { useSyncExternalStore } from 'react';
import type { ProgressStore, QRecord } from './types';
import { createRecord, updateRecord } from './scheduler';

const KEY = 'dsquiz:store:v1';
const VERSION = 1;

function emptyStore(): ProgressStore {
  return {
    version: VERSION,
    records: {},
    totals: { answered: 0, correct: 0, sessions: 0, startedAt: Date.now() },
    prefs: { nickname: '', shuffleOptions: false },
  };
}

function load(): ProgressStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as ProgressStore;
    if (!parsed || parsed.version !== VERSION) return emptyStore();
    return {
      ...emptyStore(),
      ...parsed,
      records: parsed.records ?? {},
      totals: { ...emptyStore().totals, ...parsed.totals },
      prefs: { ...emptyStore().prefs, ...parsed.prefs },
    };
  } catch {
    return emptyStore();
  }
}

let state: ProgressStore = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式或配额满：静默降级为内存态，不影响答题 */
  }
}

function setState(next: ProgressStore) {
  state = next;
  persist();
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getState = (): ProgressStore => state;

export function useStore(): ProgressStore {
  return useSyncExternalStore(subscribe, getState, getState);
}

/* ------------------------------------------------------------ 变更操作 */

export function recordAnswer(
  questionId: string,
  correct: boolean,
  answer: string[],
  now = Date.now(),
): void {
  const prev = state.records[questionId];
  const next: QRecord = updateRecord(prev, correct, answer, now);
  setState({
    ...state,
    records: { ...state.records, [questionId]: next },
    totals: {
      ...state.totals,
      answered: state.totals.answered + 1,
      correct: state.totals.correct + (correct ? 1 : 0),
    },
  });
}

export function completeSession(): void {
  setState({
    ...state,
    totals: { ...state.totals, sessions: state.totals.sessions + 1 },
  });
}

export function clearQuestion(questionId: string): void {
  const records = { ...state.records };
  delete records[questionId];
  setState({ ...state, records });
}

export function setNickname(nickname: string): void {
  setState({ ...state, prefs: { ...state.prefs, nickname } });
}

export function toggleShuffle(): void {
  setState({ ...state, prefs: { ...state.prefs, shuffleOptions: !state.prefs.shuffleOptions } });
}

export function resetAll(): void {
  setState(emptyStore());
}

/* ------------------------------------------------------- 导入 / 导出 */

/**
 * 合并两份作答记录：同一题取「作答次数更多」的一条，次数相同取时间更近的。
 * 用于换设备时把云端进度并进本地，既不会丢进度，也不会让陈旧数据覆盖新结果。
 */
export function mergeRecords(
  local: Record<string, QRecord>,
  remote: Record<string, QRecord>,
): Record<string, QRecord> {
  const out: Record<string, QRecord> = { ...local };
  for (const [id, rb] of Object.entries(remote ?? {})) {
    const ra = out[id];
    if (!ra) {
      out[id] = rb;
      continue;
    }
    const remoteNewer = rb.seen > ra.seen || (rb.seen === ra.seen && rb.lastAt > ra.lastAt);
    if (remoteNewer) out[id] = rb;
  }
  return out;
}

/** 登录/同步后把云端进度并入本地 */
export function applyCloudProgress(
  remoteRecords: Record<string, QRecord>,
  remoteTotals?: ProgressStore['totals'],
): { added: number; total: number } {
  const before = Object.keys(state.records).length;
  const merged = mergeRecords(state.records, remoteRecords);
  const after = Object.keys(merged).length;

  // 累计值取两侧较大者，避免合并后计数倒退
  const totals = remoteTotals
    ? {
        answered: Math.max(state.totals.answered, remoteTotals.answered ?? 0),
        correct: Math.max(state.totals.correct, remoteTotals.correct ?? 0),
        sessions: Math.max(state.totals.sessions, remoteTotals.sessions ?? 0),
        startedAt: Math.min(
          state.totals.startedAt || Date.now(),
          remoteTotals.startedAt || Date.now(),
        ),
      }
    : state.totals;

  setState({ ...state, records: merged, totals });
  return { added: after - before, total: after };
}

/** 导出给云端的最小快照 */
export function snapshotForCloud() {
  return { records: state.records, totals: state.totals };
}

export function exportProgress(): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importProgress(json: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(json) as ProgressStore;
    if (!parsed || typeof parsed !== 'object' || !parsed.records) {
      return { ok: false, message: '文件格式不正确：缺少 records 字段' };
    }
    const merged: ProgressStore = {
      ...emptyStore(),
      ...parsed,
      version: VERSION,
      records: { ...state.records, ...parsed.records },
      totals: { ...emptyStore().totals, ...parsed.totals },
      prefs: { ...state.prefs, ...parsed.prefs },
    };
    setState(merged);
    return { ok: true, message: `已导入 ${Object.keys(parsed.records).length} 条作答记录` };
  } catch (e) {
    return { ok: false, message: `解析失败：${(e as Error).message}` };
  }
}

/** 生成错题清单 Markdown，便于贴到笔记或发给同学 */
export function exportWrongMarkdown(rows: { id: string; stem: string; answer: string }[]): string {
  const lines = ['# 现代设计史 · 错题清单', '', `导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.stem}**`, `   - 正确答案：${r.answer}`, `   - 题号：\`${r.id}\``, '');
  });
  return lines.join('\n');
}

export { createRecord, KEY };
