import { useEffect, useState } from 'react';
import { Home } from './features/Home';
import { PracticeSetup } from './features/PracticeSetup';
import { PracticeRun, type SessionResult } from './features/PracticeRun';
import { Result } from './features/Result';
import { WrongBook } from './features/WrongBook';
import { Flashcards } from './features/Flashcards';
import { EssayView } from './features/EssayView';
import { Stats } from './features/Stats';
import { Settings } from './features/Settings';
import { KnowledgeMap } from './features/KnowledgeMap';
import { Account, Leaderboard } from './features/Account';
import { ToastProvider } from './components/ui';
import { completeSession, useStore } from './core/store';
import { useAutoSync } from './cloud/useAutoSync';
import { CLOUD_FEATURES_ENABLED } from './cloud/config';
import type { PracticeSessionSpec } from './core/practice';
import { questions } from './core/data';

type View =
  | 'home'
  | 'setup'
  | 'run'
  | 'result'
  | 'wrong'
  | 'cards'
  | 'essay'
  | 'map'
  | 'stats'
  | 'account'
  | 'leaderboard'
  | 'settings';

const VIEWS: View[] = [
  'home',
  'setup',
  'run',
  'result',
  'wrong',
  'cards',
  'essay',
  'map',
  'stats',
  'account',
  'leaderboard',
  'settings',
];

function parseHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (VIEWS as string[]).includes(raw) ? (raw as View) : 'home';
}

const NAV: { view: View; label: string; mark: string }[] = [
  { view: 'home', label: '首页', mark: '首' },
  { view: 'setup', label: '刷题', mark: '题' },
  { view: 'wrong', label: '错题本', mark: '错' },
  { view: 'map', label: '知识脉络', mark: '脉' },
  { view: 'cards', label: '速记卡', mark: '卡' },
  { view: 'essay', label: '大题', mark: '大' },
  { view: 'leaderboard', label: '排行榜', mark: '榜' },
  { view: 'stats', label: '统计', mark: '数' },
  { view: 'account', label: '账号与同步', mark: '云' },
  { view: 'settings', label: '我的', mark: '我' },
];

/** 底部 Tab（手机）——顺序即用户的主要动线 */
const TABS: View[] = ['home', 'setup', 'map', 'leaderboard', 'settings'];

export default function App() {
  const [view, setView] = useState<View>(parseHash);
  const [session, setSession] = useState<PracticeSessionSpec | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const store = useStore();

  // 登录后自动同步进度到云端（未登录 / 非发布域名时为空操作）
  useAutoSync();

  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    // 这里刻意不判断 session：startPractice 里 setSession 与 go('run') 属于同一批更新，
    // 闭包里读到的 session 还是旧值（首次进入时是 null），会把「开始复习」这次跳转吃掉，
    // 表现就是点了一次没反应、要再点一次。缺少 session 的情况已由 effectiveView 兜回首页。
    window.location.hash = `#/${v}`;
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const startPractice = (spec: PracticeSessionSpec) => {
    if (!spec.questions.length) return;
    setSession(spec);
    setRunKey((k) => k + 1);
    go('run');
  };

  /* 进入 run / result 但缺少状态时（例如直接刷新页面），回到首页 */
  const effectiveView: View =
    (view === 'run' && !session) || (view === 'result' && !result) ? 'home' : view;

  return (
    <ToastProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <b>现代设计史</b>
            <span>刷题复习站 · {questions.length} 题</span>
          </div>
          {NAV.map((n) => (
            <button
              key={n.view}
              className={`navitem ${effectiveView === n.view ? 'is-on' : ''}`}
              onClick={() => go(n.view)}
            >
              <span className="navmark" aria-hidden>
                {n.mark}
              </span>
              {n.label}
            </button>
          ))}
          <div style={{ marginTop: 'auto' }} className="tiny">
            累计作答 {store.totals.answered} 题
          </div>
        </aside>

        <div>
          <main className="main">
            {effectiveView === 'home' ? (
              <Home onPractice={startPractice} go={go} />
            ) : null}

            {effectiveView === 'setup' ? (
              <PracticeSetup onPractice={startPractice} onBack={() => go('home')} />
            ) : null}

            {effectiveView === 'run' && session ? (
              <PracticeRun
                key={runKey}
                spec={session}
                onExit={() => go('home')}
                onFinish={(r) => {
                  setResult(r);
                  completeSession();
                  go('result');
                }}
              />
            ) : null}

            {effectiveView === 'result' && result ? (
              <Result result={result} onPractice={startPractice} onHome={() => go('home')} />
            ) : null}

            {effectiveView === 'wrong' ? (
              <WrongBook onPractice={startPractice} onBack={() => go('home')} />
            ) : null}

            {effectiveView === 'cards' ? <Flashcards onBack={() => go('home')} /> : null}
            {effectiveView === 'map' ? (
              <KnowledgeMap onPractice={startPractice} onBack={() => go('home')} />
            ) : null}
            {effectiveView === 'essay' ? <EssayView onBack={() => go('home')} /> : null}
            {effectiveView === 'account' ? (
              <Account onBack={() => go('home')} onLeaderboard={() => go('leaderboard')} />
            ) : null}
            {effectiveView === 'leaderboard' ? (
              <Leaderboard onBack={() => go('home')} onAccount={() => go('account')} />
            ) : null}
            {effectiveView === 'stats' ? <Stats onBack={() => go('home')} /> : null}
            {effectiveView === 'settings' ? <Settings onBack={() => go('home')} /> : null}
          </main>
        </div>

        <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
          {TABS.map((t) => {
            const n = NAV.find((x) => x.view === t)!;
            return (
              <button
                key={t}
                className={`tab ${effectiveView === t ? 'is-on' : ''}`}
                onClick={() => go(t)}
              >
                <span className="tab-dot" aria-hidden>
                  {n.mark}
                </span>
                {n.label}
              </button>
            );
          })}
        </nav>
      </div>
    </ToastProvider>
  );
}
