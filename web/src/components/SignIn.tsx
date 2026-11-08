import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { Icon } from './ui.tsx';

const AUTO_KEY = 'gaslamp.autoLogin';
const NAME_KEY = 'gaslamp.loginName';
const read = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } };

// Chrome's Credential Management API: the browser's password manager keeps the password, not us.
type PasswordCred = { id: string; password: string; type: string };
const PasswordCredentialCtor = (globalThis as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;

async function storeInBrowser(name: string, password: string) {
  if (!PasswordCredentialCtor || !navigator.credentials) return;
  try { await navigator.credentials.store(new PasswordCredentialCtor({ id: name, password, name })); } catch { /* user declined or unsupported */ }
}
async function getFromBrowser(): Promise<PasswordCred | null> {
  if (!PasswordCredentialCtor || !navigator.credentials) return null;
  try {
    const c = (await navigator.credentials.get({ password: true, mediation: 'optional' } as CredentialRequestOptions)) as PasswordCred | null;
    return c && c.type === 'password' && c.password ? c : null;
  } catch { return null; }
}

const STAGE_TEXT = { waiting: 'Connecting…', name: 'Sending your name…', password: 'Checking your password…' } as const;

/** Shown while you're not logged in: a real login form, so the browser can save and fill it. */
export function SignIn() {
  const { loggedIn, connected, login } = useGame();
  const [name, setName] = useState(() => read(NAME_KEY));
  const [password, setPassword] = useState('');
  const [auto, setAuto] = useState(() => read(AUTO_KEY) === '1');
  const [hidden, setHidden] = useState(false);
  const tried = useRef(false);

  // Auto-login once per page load, if you turned it on: Chrome hands over the saved login.
  useEffect(() => {
    if (tried.current || loggedIn || !auto) return;
    tried.current = true;
    void getFromBrowser().then((c) => { if (c && !game.state.loggedIn) { setName(c.id); game.signIn(c.id, c.password); } });
  }, [loggedIn, auto]);

  if (loggedIn || hidden) return null;
  const busy = login.stage === 'waiting' || login.stage === 'name' || login.stage === 'password';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    write(NAME_KEY, name.trim());
    write(AUTO_KEY, auto ? '1' : '');
    void storeInBrowser(name.trim(), password); // Chrome asks whether to save it
    game.signIn(name, password);
    setPassword('');
  };

  return (
    <section className="card p-4 sm:p-5 border-primary/40">
      <form className="flex flex-col gap-3" onSubmit={submit} autoComplete="on">
        <div className="flex items-center gap-2">
          <Icon name="key" className="text-primary text-xl" />
          <h2 className="font-display text-base text-primary flex-1">Log in to Aardwolf</h2>
          {!connected && !busy && <span className="font-mono text-[10px] text-outline">Not connected: logging in connects you</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="label-caps text-[9px] text-outline">Character name</span>
            <input name="username" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} spellCheck={false}
              className="bg-surface-mid rounded px-3 py-2 text-sm border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps text-[9px] text-outline">Password</span>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
              className="bg-surface-mid rounded px-3 py-2 text-sm border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); write(AUTO_KEY, e.target.checked ? '1' : ''); }} className="accent-[#ffb77d]" />
            Log in automatically next time
          </label>
          <span className="flex-1" />
          {busy ? (
            <>
              <span className="text-xs text-primary flex items-center gap-1.5"><Icon name="progress_activity" className="text-sm animate-spin" />{STAGE_TEXT[login.stage as keyof typeof STAGE_TEXT]}</span>
              <button type="button" className="btn" onClick={() => game.cancelSignIn()}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="text-[11px] text-outline hover:text-on-surface underline-offset-2 hover:underline" onClick={() => setHidden(true)}>Use the command line instead</button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || !password}><Icon name="login" className="text-sm" /> Log in</button>
            </>
          )}
        </div>
        {login.stage === 'error' && <p className="text-xs text-[#ff7b6b] flex items-center gap-1.5"><Icon name="error" className="text-sm" />{login.error}</p>}
        <p className="text-[10px] text-outline">
          Your password goes to Aardwolf, and only into Chrome’s password manager if you choose to save it there. Gaslamp itself never stores it.
        </p>
      </form>
    </section>
  );
}
