import { useEffect, useState } from 'react';
import {
  autoNickname,
  cloudErrorText,
  fetchLeaderboard,
  getSignedInUser,
  loadMyProgress,
  onAuthChange,
  resetPasswordForEmail,
  saveMyProgress,
  sendOtp,
  signInWithOtp,
  signInWithPassword,
  signOut,
  updateNickname,
  verifyOtpForSignup,
  type CloudUser,
  type LeaderRow,
} from '../cloud';
import { CLOUD_FEATURES_ENABLED, RELEASE_ORIGIN } from '../cloud/config';
import {
  applyCloudProgress,
  setNickname as setLocalNickname,
  snapshotForCloud,
  useStore,
} from '../core/store';
import { useToast } from '../components/ui';

type Mode = 'login' | 'signup' | 'reset';
type LoginMethod = 'password' | 'otp';
type Challenge = Record<string, unknown>;

/** 只展示打码后的邮箱，避免整串出现在界面上 */
function maskEmail(email?: string): string {
  if (!email) return '已登录';
  const [name, domain] = email.split('@');
  if (!domain) return '已登录';
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function Account({
  onBack,
  onLeaderboard,
}: {
  onBack: () => void;
  onLeaderboard: () => void;
}) {
  const store = useStore();
  const notify = useToast();

  const [user, setUser] = useState<CloudUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('login');
  const [method, setMethod] = useState<LoginMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'code'>('form');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState<Challenge | null>(null);
  const [nickname, setNick] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    getSignedInUser()
      .then((u) => {
        if (alive) setUser(u);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    const off = onAuthChange((u) => setUser(u));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    setNick(store.prefs.nickname || '');
  }, [store.prefs.nickname]);

  const fail = (e: unknown) => setMsg({ tone: 'err', text: cloudErrorText(e) });

  /* ------------------------------------------------------ 登录后：合并进度 */
  const afterSignIn = async () => {
    const u = await getSignedInUser();
    setUser(u);
    if (!u) return;

    try {
      const { row, progress } = await loadMyProgress();
      const nick = row?.nickname || store.prefs.nickname || autoNickname();

      if (progress) {
        const merged = applyCloudProgress(progress.records, progress.totals);
        setMsg({
          tone: 'ok',
          text:
            merged.added > 0
              ? `已登录，并从云端合并了 ${merged.added} 题的作答记录`
              : '已登录，云端与本地进度已对齐',
        });
      } else {
        setMsg({ tone: 'ok', text: '已登录，正在把本地进度上传到云端…' });
      }

      setLocalNickname(nick);
      setNick(nick);
      await saveMyProgress(snapshotForCloud(), nick);
      notify('登录成功，进度已同步');
    } catch (e) {
      fail(e);
    }
  };

  /* ------------------------------------------------------------ 各条流程 */

  const doPasswordLogin = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await signInWithPassword(email.trim(), password);
      if (res.error) {
        fail(res.error);
        return;
      }
      await afterSignIn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doSendOtp = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await sendOtp(email.trim());
      if (res.error) {
        fail(res.error);
        return;
      }
      setPending(res.data as unknown as Challenge);
      setStage('code');
      setMsg({ tone: 'info', text: '验证码已发送，请查收邮箱（记得看一眼垃圾箱）' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doVerifyForSignup = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await verifyOtpForSignup({
        verificationId: String(pending.verificationId),
        token: code.trim(),
        email: email.trim(),
        isExistingUser: Boolean(pending.isExistingUser),
        password: pending.isExistingUser ? undefined : password,
      });
      if (res.error) {
        fail(res.error);
        return;
      }
      await afterSignIn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doOtpLoginSend = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await signInWithOtp(email.trim());
      if (res.error) {
        fail(res.error);
        return;
      }
      setPending(res.data as unknown as Challenge);
      setStage('code');
      setMsg({ tone: 'info', text: '验证码已发送，请查收邮箱（记得看一眼垃圾箱）' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doOtpLoginVerify = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const holder = pending as {
        verify?: (args: { token: string }) => Promise<{ data?: unknown; error?: unknown }>;
      };
      if (typeof holder.verify !== 'function') {
        setMsg({ tone: 'err', text: '验证会话已失效，请重新获取验证码' });
        return;
      }
      const res = await holder.verify({ token: code.trim() });
      if (res.error) {
        fail(res.error);
        return;
      }
      await afterSignIn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doResetSend = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await resetPasswordForEmail(email.trim());
      if (res.error) {
        fail(res.error);
        return;
      }
      setPending(res.data as unknown as Challenge);
      setStage('code');
      setMsg({ tone: 'info', text: '重置验证码已发送，请查收邮箱' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doResetConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const holder = pending as {
        updateUser?: (args: { nonce: string; password: string }) => Promise<{
          data?: unknown;
          error?: unknown;
        }>;
      };
      if (typeof holder.updateUser !== 'function') {
        setMsg({ tone: 'err', text: '重置会话已失效，请重新获取验证码' });
        return;
      }
      const res = await holder.updateUser({ nonce: code.trim(), password });
      if (res.error) {
        fail(res.error);
        return;
      }
      setMsg({ tone: 'ok', text: '密码已更新，你已自动登录' });
      await afterSignIn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doManualSync = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const u = await getSignedInUser();
      if (!u) throw new Error('未登录');

      const nick = nickname.trim() || store.prefs.nickname || autoNickname();
      if (nick !== store.prefs.nickname) {
        try {
          await updateNickname(nick);
        } catch {
          // 云端还没有这一行时更新会落空，紧跟其后的 upsert 会带上新昵称
        }
        setLocalNickname(nick);
      }

      const { progress } = await loadMyProgress();
      if (progress) {
        const merged = applyCloudProgress(progress.records, progress.totals);
        if (merged.added > 0) notify(`从云端合并了 ${merged.added} 题`);
      }
      await saveMyProgress(snapshotForCloud(), nick);
      notify('进度已同步到云端');
    } catch (e) {
      fail(e);
    } finally {
      setSyncing(false);
    }
  };

  /* -------------------------------------------------------------------- UI */

  if (!CLOUD_FEATURES_ENABLED) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <h2>账号与云同步</h2>
        <div className="card" style={{ borderLeft: '3px solid var(--warn)' }}>
          <div style={{ fontWeight: 500 }}>当前网址不支持云端登录</div>
          <div className="muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            云端登录要求访问地址与已登记的发布域名完全一致，这是防止别的网站盗用你数据的保护措施。
            请改用下面这个地址打开：
          </div>
          <div style={{ marginTop: 10 }}>
            <a href={RELEASE_ORIGIN} style={{ wordBreak: 'break-all' }}>
              {RELEASE_ORIGIN}
            </a>
          </div>
        </div>
        <div className="card card-flat">
          <div className="tiny">
            你当前打开的地址（GitHub Pages）不受影响：刷题、错题本、速记卡、大题都能正常使用，
            进度保存在本机；也可以在「我的 → 导出进度」里备份成文件。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <h2>账号与云同步</h2>

      {checking ? (
        <div className="card card-flat tiny">正在检查登录状态…</div>
      ) : user ? (
        <>
          <div className="hero">
            <div className="hero-blocks" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className="tiny">已登录</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>
              {store.prefs.nickname || nickname || '同学'}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {maskEmail(user.email)}
            </div>
          </div>

          <div>
            <div className="optgroup-label">用户名（排行榜上显示）</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={nickname}
                maxLength={12}
                placeholder="例如：小钟"
                onChange={(e) => setNick(e.target.value)}
              />
              <button
                className="btn nowrap"
                disabled={!nickname.trim()}
                onClick={() => {
                  setLocalNickname(nickname.trim());
                  notify('用户名已保存');
                }}
              >
                保存
              </button>
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary grow" disabled={syncing} onClick={doManualSync}>
              {syncing ? '同步中…' : '立即同步进度'}
            </button>
            <button className="btn grow" onClick={onLeaderboard}>
              看排行榜
            </button>
          </div>

          <div className="card card-flat">
            <div className="tiny" style={{ lineHeight: 1.9 }}>
              作答过程中会自动把进度同步到云端。换设备后用同一个邮箱登录，进度会自动合并 ——
              同一题取作答次数更多的一条，两边不会互相覆盖。
            </div>
          </div>

          <button
            className="btn btn-block"
            onClick={async () => {
              await signOut();
              setUser(null);
              setMsg({ tone: 'info', text: '已退出登录，本机进度保留' });
            }}
          >
            退出登录
          </button>
        </>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            {(
              [
                ['login', '登录'],
                ['signup', '注册'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                className={`chip ${mode === k ? 'is-on' : ''}`}
                onClick={() => {
                  setMode(k);
                  setStage('form');
                  setPending(null);
                  setMsg(null);
                  setCode('');
                }}
              >
                {label}
              </button>
            ))}
            {mode === 'reset' ? <span className="chip is-on">找回密码</span> : null}
          </div>

          {mode === 'login' ? (
            <div className="row wrap" style={{ gap: 8 }}>
              <button
                className={`chip ${method === 'password' ? 'is-on' : ''}`}
                onClick={() => {
                  setMethod('password');
                  setStage('form');
                  setPending(null);
                }}
              >
                邮箱 + 密码
              </button>
              <button
                className={`chip ${method === 'otp' ? 'is-on' : ''}`}
                onClick={() => {
                  setMethod('otp');
                  setStage('form');
                  setPending(null);
                }}
              >
                邮箱验证码
              </button>
            </div>
          ) : null}

          <div className="stack">
            <div>
              <div className="optgroup-label">邮箱</div>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {stage === 'form' && (mode !== 'login' || method === 'password') ? (
              <div>
                <div className="optgroup-label">
                  {mode === 'signup' ? '设置密码（至少 8 位）' : mode === 'reset' ? '新密码' : '密码'}
                </div>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : null}

            {stage === 'code' ? (
              <div>
                <div className="optgroup-label">邮箱验证码</div>
                <input
                  className="input"
                  inputMode="numeric"
                  value={code}
                  placeholder="邮箱里收到的数字"
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {msg ? (
            <div
              className="card card-flat"
              style={{
                borderLeft: `3px solid ${
                  msg.tone === 'ok' ? 'var(--ok)' : msg.tone === 'err' ? 'var(--no)' : 'var(--blue)'
                }`,
                fontSize: 13,
              }}
            >
              {msg.text}
            </div>
          ) : null}

          {mode === 'login' && method === 'password' ? (
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !email || !password}
              onClick={doPasswordLogin}
            >
              {busy ? '登录中…' : '登录'}
            </button>
          ) : null}

          {mode === 'login' && method === 'otp' ? (
            stage === 'form' ? (
              <button className="btn btn-primary btn-block" disabled={busy || !email} onClick={doOtpLoginSend}>
                {busy ? '发送中…' : '发送验证码'}
              </button>
            ) : (
              <button className="btn btn-primary btn-block" disabled={busy || !code} onClick={doOtpLoginVerify}>
                {busy ? '验证中…' : '验证并登录'}
              </button>
            )
          ) : null}

          {mode === 'signup' ? (
            stage === 'form' ? (
              <button
                className="btn btn-primary btn-block"
                disabled={busy || !email || password.length < 8}
                onClick={doSendOtp}
              >
                {busy ? '发送中…' : '发送验证码并继续'}
              </button>
            ) : (
              <button className="btn btn-primary btn-block" disabled={busy || !code} onClick={doVerifyForSignup}>
                {busy ? '注册中…' : '完成注册'}
              </button>
            )
          ) : null}

          {mode === 'reset' ? (
            stage === 'form' ? (
              <button
                className="btn btn-primary btn-block"
                disabled={busy || !email || password.length < 8}
                onClick={doResetSend}
              >
                {busy ? '发送中…' : '发送重置验证码'}
              </button>
            ) : (
              <button className="btn btn-primary btn-block" disabled={busy || !code} onClick={doResetConfirm}>
                {busy ? '提交中…' : '设置新密码'}
              </button>
            )
          ) : null}

          <div className="center">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMode(mode === 'reset' ? 'login' : 'reset');
                setStage('form');
                setPending(null);
                setMsg(null);
                setCode('');
              }}
            >
              {mode === 'reset' ? '← 返回登录' : '忘记密码？'}
            </button>
          </div>

          <div className="card card-flat">
            <div className="tiny" style={{ lineHeight: 1.9 }}>
              注册需要一个能收信的邮箱。登录后系统会自动分配一个用户名，你可以在上面改成自己喜欢的，
              排行榜按答对题数排名。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================= 排行榜 */

export function Leaderboard({
  onBack,
  onAccount,
}: {
  onBack: () => void;
  onAccount: () => void;
}) {
  const store = useStore();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    getSignedInUser()
      .then((u) => {
        if (alive) setUser(u);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await fetchLeaderboard(50));
    } catch (e) {
      setErr(cloudErrorText(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checking && user) void load();
  }, [checking, user]);

  const myAnswered = store.totals.answered;
  const myCorrect = store.totals.correct;

  if (!CLOUD_FEATURES_ENABLED) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <h2>排行榜</h2>
        <div className="card" style={{ borderLeft: '3px solid var(--warn)' }}>
          <div style={{ fontWeight: 500 }}>排行榜需要访问发布版</div>
          <div className="muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            排行榜数据在云端，只在已登记的发布域名下可用：
          </div>
          <div style={{ marginTop: 10 }}>
            <a href={RELEASE_ORIGIN} style={{ wordBreak: 'break-all' }}>
              {RELEASE_ORIGIN}
            </a>
          </div>
        </div>
        <div className="card card-flat">
          <div className="tiny">
            你目前的本机成绩：答对 {myCorrect} 题 / 共作答 {myAnswered} 次
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <h2>排行榜</h2>
        <div className="card card-flat tiny">正在检查登录状态…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← 返回首页
        </button>
        <h2>排行榜</h2>
        <div className="card">
          <div style={{ fontWeight: 500 }}>登录后才能看排行榜</div>
          <div className="muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            排行榜按「答对题数」排名。登录后你的成绩才会出现在榜单上，
            也才能看到同学刷到哪了 —— 榜单只显示用户名和成绩，不显示邮箱。
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={onAccount}>
            去登录 / 注册
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← 返回首页
      </button>

      <div className="row-between">
        <div>
          <h2>排行榜</h2>
          <div className="tiny">按「答对题数」排名 · 共 {rows?.length ?? 0} 位同学上榜</div>
        </div>
        <button className="btn btn-sm" disabled={loading} onClick={load}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="card card-flat">
        <div className="row-between">
          <span className="tiny">我的成绩（本机统计，同步后即为云端值）</span>
          <span className="nowrap" style={{ fontWeight: 500 }}>
            答对 {myCorrect} 题
          </span>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ borderLeft: '3px solid var(--no)', fontSize: 13 }}>
          {err}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={load}>
              重试
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onAccount}>
              去登录
            </button>
          </div>
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <div className="empty">
          <div className="big">—</div>
          <div style={{ fontWeight: 500 }}>还没有人上榜</div>
          <div className="muted" style={{ marginTop: 4 }}>
            你是第一个上来的，快去刷几题
          </div>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="list">
          {rows.map((r) => (
            <div
              className="list-item"
              key={`${r.rank}-${r.nickname}`}
              style={{
                cursor: 'default',
                background: r.isMe ? 'var(--ok-bg)' : undefined,
                alignItems: 'center',
              }}
            >
              <span
                className="badge"
                style={{
                  background:
                    r.rank === 1
                      ? 'var(--yellow)'
                      : r.rank === 2
                        ? 'var(--line-strong)'
                        : r.rank === 3
                          ? 'var(--warn)'
                          : 'var(--surface-2)',
                  color: r.rank <= 3 ? '#3a2c00' : 'var(--text-2)',
                  minWidth: 26,
                }}
              >
                {r.rank}
              </span>
              <span className="grow">
                <div style={{ fontWeight: 500 }}>
                  {r.nickname}
                  {r.isMe ? (
                    <span className="tiny" style={{ marginLeft: 6 }}>
                      （我）
                    </span>
                  ) : null}
                </div>
                <div className="tiny">
                  答对 {r.correct} · 作答 {r.answered} 次 · 已掌握 {r.mastered}
                </div>
              </span>
              <span className="nowrap" style={{ fontWeight: 500, color: 'var(--ok)' }}>
                {r.correct}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card card-flat">
        <div className="tiny" style={{ lineHeight: 1.9 }}>
          只显示用户名与成绩，不会显示邮箱等账号信息。作答记录需要登录后才会出现在这里。
        </div>
      </div>
    </div>
  );
}
