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

// With "remember me" on, the login is saved in this browser's local storage for this site, so any
// tab can log back in: after a reload, a closed tab, or Aardwolf dropping an idle connection.
// It's plain text in your browser profile, so only use it on your own computer.
const SAVED_KEY = 'gaslamp.savedLogin';
type Saved = { name: string; password: string };
function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(read(SAVED_KEY) || 'null') as Saved | null;
    return v && typeof v.name === 'string' && typeof v.password === 'string' && v.name && v.password ? v : null;
  } catch { return null; }
}
const saveLogin = (v: Saved | null) => write(SAVED_KEY, v ? JSON.stringify(v) : '');

const RETRY_DELAYS = [0, 5_000, 30_000, 120_000];
const STAGE_TEXT = { waiting: 'Connecting…', name: 'Sending your name…', password: 'Checking your password…' } as const;

/** Shown while you're not logged in: a real login form, so the browser can save and fill it. */
export function SignIn() {
  const { loggedIn, connected, login, sessionAt, manualDisconnect } = useGame();
  const [name, setName] = useState(() => read(NAME_KEY));
  const [password, setPassword] = useState('');
  const [auto, setAuto] = useState(() => read(AUTO_KEY) === '1');
  const [hidden, setHidden] = useState(false);
  const attempts = useRef(0);
  const [noSaved, setNoSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [autofilled, setAutofilled] = useState(false);
  const [hasSaved, setHasSaved] = useState(() => !!loadSaved());

  // Auto-login, if you turned it on: on page load and whenever the connection drops (Aardwolf
  // times out idle players), it uses the login saved in this browser (or Chrome's saved one). It backs off and gives up after a
  // few tries, and never runs after you press Disconnect or after a wrong password.
  useEffect(() => {
    const ready = login.stage === 'idle' || (login.stage === 'error' && login.retry);
    if (!auto || loggedIn || manualDisconnect || !sessionAt || !ready || attempts.current >= RETRY_DELAYS.length) return;
    // A reattached session reports that it's in the game within a moment; don't log in over it.
    const wait = Math.max(RETRY_DELAYS[attempts.current], 2500 - (Date.now() - sessionAt));
    const t = setTimeout(async () => {
      const l = game.state.login;
      if (game.state.loggedIn || game.state.manualDisconnect || !(l.stage === 'idle' || (l.stage === 'error' && l.retry))) return;
      attempts.current++;
      const s = loadSaved();
      const c = s ? { id: s.name, password: s.password } : await getFromBrowser();
      if (!c) { setNoSaved(true); return; }
      if (!game.state.loggedIn) { setName(c.id); game.signIn(c.id, c.password); }
    }, wait);
    return () => clearTimeout(t);
  }, [auto, loggedIn, manualDisconnect, sessionAt, login.stage, connected]);
  useEffect(() => { if (loggedIn) { attempts.current = 0; setNoSaved(false); } }, [loggedIn]);
  useEffect(() => { if (login.stage === 'error' && /password/i.test(login.error ?? '')) { saveLogin(null); setHasSaved(false); } }, [login]);

  // A password manager filling the form (the password appears all at once, not typed) logs in
  // right away when auto-login is on.
  useEffect(() => {
    if (!autofilled || !auto || !name.trim() || !password || loggedIn) return;
    const t = setTimeout(() => { setAutofilled(false); form.current?.requestSubmit(); }, 400);
    return () => clearTimeout(t);
  }, [autofilled, auto, name, password, loggedIn]);

  if (loggedIn || hidden) return null;
  const busy = login.stage === 'waiting' || login.stage === 'name' || login.stage === 'password';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    write(NAME_KEY, name.trim());
    write(AUTO_KEY, auto ? '1' : '');
    void storeInBrowser(name.trim(), password); // Chrome asks whether to save it
    saveLogin(auto ? { name: name.trim(), password } : null);
    setHasSaved(auto);
    game.signIn(name, password);
    setPassword('');
  };

  return (
    <section className="card p-4 sm:p-5 border-primary/40">
      <form ref={form} className="flex flex-col gap-3" onSubmit={submit} autoComplete="on">
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
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => { if (e.target.value.length - password.length > 1) setAutofilled(true); setPassword(e.target.value); }} disabled={busy}
              className="bg-surface-mid rounded px-3 py-2 text-sm border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary" />
          </label>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); write(AUTO_KEY, e.target.checked ? '1' : ''); if (!e.target.checked) { saveLogin(null); setHasSaved(false); } }} className="accent-[#ffb77d]" />
            Remember me and log in automatically
          </label>
          {hasSaved && !busy && (
            <button type="button" className="text-[11px] text-outline hover:text-on-surface underline-offset-2 hover:underline"
              onClick={() => { saveLogin(null); setHasSaved(false); }}>Forget saved password</button>
          )}
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
        {auto && noSaved && !hasSaved && login.stage === 'idle' && (
          <p className="text-xs text-secondary flex items-center gap-1.5"><Icon name="info" className="text-sm" />
            Log in once more and Gaslamp will remember you from then on.</p>
        )}
        {login.stage === 'error' && <p className="text-xs text-[#ff7b6b] flex items-center gap-1.5"><Icon name="error" className="text-sm" />{login.error}</p>}
        <p className="text-[10px] text-outline">
          {auto
            ? 'With “remember me” on, your name and password are saved in this browser (plain text in your browser profile), so only use it on your own computer.'
            : 'Your password goes only to Aardwolf. Gaslamp doesn’t keep it.'}
        </p>
      </form>
    </section>
  );
}
