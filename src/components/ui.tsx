import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ Toast */

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);

  const notify = useCallback((text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg((cur) => (cur === text ? null : cur)), 2200);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? <div className="toast">{msg}</div> : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* -------------------------------------------------------------------- Bar */

export function Bar({
  value,
  tone = 'red',
}: {
  value: number;
  tone?: 'red' | 'ok' | 'blue';
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`bar ${tone === 'ok' ? 'ok' : tone === 'blue' ? 'blue' : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ TopBar */

export function TopBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回">
          ← 返回
        </button>
      ) : null}
      <div className="topbar-title">{title}</div>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ 其他 */

export function tagLabel(tag: string): string {
  const [kind, name] = tag.split(':');
  const map: Record<string, string> = { 运动: '运动', 人物: '人物', 作品: '作品', 概念: '概念' };
  return `${map[kind] ?? kind} · ${name}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
