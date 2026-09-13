import { useState } from 'react';
import { bank, concepts, essays, questions } from '../core/data';
import { download, pickFile } from '../core/files';
import { exportProgress, importProgress, resetAll, setNickname, toggleShuffle, useStore } from '../core/store';
import { useToast } from '../components/ui';

const THEME_KEY = 'dsquiz:theme';

export function getTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function Settings({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const notify = useToast();
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme());
  const [confirmReset, setConfirmReset] = useState(false);

  const records = Object.keys(store.records).length;

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <h2>设置与数据</h2>

      <div>
        <div className="optgroup-label">我的昵称（多人房间时显示）</div>
        <input
          className="input"
          value={store.prefs.nickname}
          maxLength={12}
          placeholder="输入昵称，例如：小钟"
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <div className="list">
        <div className="setting-row">
          <span>
            选项乱序
            <div className="tiny">单选 / 多选的选项每次随机排列，防止背位置</div>
          </span>
          <button
            className={`switch ${store.prefs.shuffleOptions ? 'is-on' : ''}`}
            aria-label="切换选项乱序"
            onClick={toggleShuffle}
          />
        </div>
        <div className="setting-row">
          <span>
            深色模式
            <div className="tiny">夜间刷题不刺眼</div>
          </span>
          <button
            className={`switch ${theme === 'dark' ? 'is-on' : ''}`}
            aria-label="切换深色模式"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              applyTheme(next);
            }}
          />
        </div>
      </div>

      <div>
        <div className="optgroup-label">进度备份</div>
        <div className="stack">
          <button
            className="btn btn-block"
            onClick={() => {
              download(`设计史刷题进度-${new Date().toISOString().slice(0, 10)}.json`, exportProgress(), 'application/json');
              notify('进度已导出，换设备时导入即可恢复');
            }}
          >
            导出进度（{records} 条记录）
          </button>
          <button
            className="btn btn-block"
            onClick={async () => {
              const text = await pickFile();
              if (!text) return;
              const r = importProgress(text);
              notify(r.message);
            }}
          >
            导入进度
          </button>
        </div>
      </div>

      <div>
        <div className="optgroup-label">清空数据</div>
        {confirmReset ? (
          <div className="card" style={{ borderColor: 'var(--no)' }}>
            <div style={{ fontWeight: 500, color: 'var(--no)' }}>确认清空全部作答记录？</div>
            <div className="tiny" style={{ margin: '6px 0 12px' }}>
              错题本、掌握度、统计都会归零，且无法恢复。建议先导出备份。
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn grow" onClick={() => setConfirmReset(false)}>
                取消
              </button>
              <button
                className="btn grow"
                style={{ background: 'var(--no)', borderColor: 'var(--no)', color: '#fff' }}
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                  notify('已清空全部作答记录');
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-block" onClick={() => setConfirmReset(true)}>
            清空全部作答记录
          </button>
        )}
      </div>

      <div>
        <div className="optgroup-label">知识库</div>
        <div className="list">
          <div className="setting-row">
            <span>课程</span>
            <span className="muted">{bank.course}</span>
          </div>
          <div className="setting-row">
            <span>客观题</span>
            <span className="muted">{questions.length} 题</span>
          </div>
          <div className="setting-row">
            <span>知识点卡片</span>
            <span className="muted">{concepts.length} 张</span>
          </div>
          <div className="setting-row">
            <span>大题踩分点</span>
            <span className="muted">
              {essays.length} 道 / {essays.reduce((n, e) => n + e.keyPoints.length, 0)} 点
            </span>
          </div>
          <div className="setting-row">
            <span>数据版本</span>
            <span className="muted mono">schema {bank.schemaVersion}</span>
          </div>
        </div>
      </div>

      <div className="card card-flat">
        <div className="tiny">
          所有作答记录只保存在你这台设备的浏览器里，不会上传到任何服务器。
          换手机或清缓存前，记得先导出进度。
        </div>
      </div>
    </div>
  );
}
