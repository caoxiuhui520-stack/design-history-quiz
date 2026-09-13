import { useEffect, useRef } from 'react';
import { getSignedInUser, saveMyProgress } from './index';
import { CLOUD_FEATURES_ENABLED } from './config';
import { snapshotForCloud, useStore } from '../core/store';

const IDLE_MS = 20_000;

/**
 * 登录后自动把进度推到云端。
 *
 * 策略：作答数变化后等 20 秒再推一次（合并突发作答），同步失败静默处理 ——
 * 本地进度永远是权威，不因为云端不可用而影响答题。
 */
export function useAutoSync(): void {
  const store = useStore();
  const answered = store.totals.answered;
  const nickname = store.prefs.nickname;

  const pushedAt = useRef(-1);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!CLOUD_FEATURES_ENABLED) return;
    if (answered === pushedAt.current) return;
    if (timer.current !== null) return;

    timer.current = window.setTimeout(() => {
      timer.current = null;
      void (async () => {
        try {
          const user = await getSignedInUser();
          if (!user) return;
          pushedAt.current = answered;
          await saveMyProgress(snapshotForCloud(), nickname || '同学');
        } catch {
          /* 静默：不打断答题，下次作答变化时会再试 */
        }
      })();
    }, IDLE_MS);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [answered, nickname]);
}
