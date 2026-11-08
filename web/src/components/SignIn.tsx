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

// With auto-login on, the login you used is kept in this tab's memory (never on disk) so the tab
// can log back in after Aardwolf drops an idle connection. Password managers that fill forms (e.g.
// Bitwarden) can't hand it over again without a page load. Closing the tab forgets it.
let tabLogin: { name: string; password: string } | null = null;

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

  // Auto-login, if you turned it on: on page load and whenever the connection drops (Aardwolf
  // times out idle players), Chrome hands over the saved login. It backs off and gives up after a
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
      const c = tabLogin ? { id: tabLogin.name, password: tabLogin.password } : await getFromBrowser();
      if (!c) { setNoSaved(true); return; }
      if (!game.state.loggedIn) { setName(c.id); game.signIn(c.id, c.password); }
    }, wait);
    return () => clearTimeout(t);
  }, [auto, loggedIn, manualDisconnect, sessionAt, login.stage, connected]);
  useEffect(() => { if (loggedIn) { attempts.current = 0; setNoSaved(false); } }, [loggedIn]);
  useEffect(() => { if (login.stage === 'error' && /password/i.test(login.error ?? '')) tabLogin = null; }, [login]);

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
    tabLogin = auto ? { name: name.trim(), password } : null;
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
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); write(AUTO_KEY, e.target.checked ? '1' : ''); if (!e.target.checked) tabLogin = null; }} className="accent-[#ffb77d]" />
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
        {auto && noSaved && login.stage === 'idle' && (
          <p className="text-xs text-secondary flex items-center gap-1.5"><Icon name="info" className="text-sm" />
            Fill this form with your password manager (Bitwarden’s autofill works) and it logs in by itself. Chrome’s own password manager can also do it without the form.</p>
        )}
        {login.stage === 'error' && <p className="text-xs text-[#ff7b6b] flex items-center gap-1.5"><Icon name="error" className="text-sm" />{login.error}</p>}
        <p className="text-[10px] text-outline">
          Your password goes to Aardwolf, and only into Chrome’s password manager if you choose to save it there. Gaslamp itself never stores it.
        </p>
      </form>
    </section>
  );
}
