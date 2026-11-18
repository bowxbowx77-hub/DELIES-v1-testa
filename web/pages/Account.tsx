import {
  ArrowRight,
  Check,
  Database,
  HardDrive,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Save,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/Dialogs';
import { Avatar, Button, ErrorBox, Title } from '../components/UI';
import { api, bytes, date, errText, type Style, type Workspace } from '../lib';
import { useVault } from '../store';
export function Profile() {
  const { data, refresh, toast, modal } = useVault();
  const u = data.user;
  const [name, setName] = useState(u.name);
  const [color, setColor] = useState<Style>(u.color);
  const [err, error] = useState('');
  const [busy, work] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    work(true);
    try {
      await api('/account', 'PATCH', { name, color });
      await refresh();
      toast('Profile updated.');
      error('');
    } catch (e) {
      error(errText(e));
    } finally {
      work(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="IDENTITY"
        title="Your profile"
        description="Manage the identity shown on your published projects."
      />
      <div className="content-split">
        <div className="panel padded">
          <div className="profile-banner">
            <Avatar user={{ ...u, color }} big />
            <div>
              <h2>{u.name}</h2>
              <p>{u.guest ? 'Guest workspace' : u.email}</p>
            </div>
          </div>
          <form className="form-stack inline-form" onSubmit={save}>
            <label>
              Display name
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Avatar color</legend>
              <div className="color-picker">
                {(['violet', 'lime', 'blue', 'amber', 'rose', 'cyan'] as Style[]).map((c) => (
                  <button
                    type="button"
                    aria-label={c + ' avatar'}
                    aria-pressed={color === c}
                    key={c}
                    className={'tint-' + c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={16} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <ErrorBox error={err} />
            <div className="form-actions">
              <Button type="submit" primary Icon={Save} disabled={busy}>
                {busy ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </div>
        <div className="panel padded profile-about">
          <div className="mini-title">
            <UserRound size={17} />
            <h3>Workspace identity</h3>
          </div>
          <dl>
            <dt>Account type</dt>
            <dd>{u.guest ? 'Guest' : 'Personal'}</dd>
            <dt>Created</dt>
            <dd>{date(u.created)}</dd>
            <dt>Repositories</dt>
            <dd>{data.repos.length}</dd>
          </dl>
          {u.guest ? (
            <Button Icon={UserPlus} onClick={() => modal('register')}>
              Create account
            </Button>
          ) : (
            <Link className="button" to="/settings">
              Account settings <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
export function Settings() {
  const { data, modal, toast, setData } = useVault();
  const nav = useNavigate();
  const [current, old] = useState('');
  const [password, setPassword] = useState('');
  const [err, error] = useState('');
  const [busy, work] = useState(false);
  const [signout, out] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    work(true);
    try {
      await api('/account/password', 'POST', { current, password });
      old('');
      setPassword('');
      error('');
      toast('Password changed. Other sessions have been signed out.');
    } catch (e) {
      error(errText(e));
    } finally {
      work(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="PREFERENCES"
        title="Account settings"
        description="Manage your account, security, and workspace storage."
      />
      <div className="settings-grid">
        <section className="panel padded">
          <div className="mini-title">
            <UserRound size={17} />
            <h3>Account</h3>
          </div>
          <div className="settings-user">
            <Avatar user={data.user} />
            <div>
              <strong>{data.user.name}</strong>
              <small>{data.user.email || 'Guest workspace'}</small>
            </div>
            <Link className="text-link" to="/profile">
              Edit profile
              <ArrowRight size={13} />
            </Link>
          </div>
          {data.user.guest ? (
            <>
              <p className="body-copy">
                This workspace is saved on the server and linked to this browser session. Create an
                account to keep access across devices.
              </p>
              <div className="inline wrap">
                <Button primary Icon={UserPlus} onClick={() => modal('register')}>
                  Create account
                </Button>
                <Button Icon={LogIn} onClick={() => modal('login')}>
                  Sign in
                </Button>
              </div>
            </>
          ) : (
            <Button Icon={LogOut} onClick={() => out(true)}>
              Sign out
            </Button>
          )}
        </section>
        <section className="panel padded" id="storage">
          <div className="mini-title">
            <Database size={17} />
            <h3>Workspace storage</h3>
          </div>
          <div className="storage-counter">
            {bytes(data.storage)} <span>/ {bytes(data.quota)}</span>
          </div>
          <div className="capacity-track">
            <i style={{ width: `${Math.max(0.5, (data.storage / data.quota) * 100)}%` }} />
          </div>
          <p className="body-copy">
            Usage includes every saved version and projects in Trash. Identical file contents are
            counted once.
          </p>
          <Link to="/trash" className="text-link">
            Manage Trash
            <ArrowRight size={13} />
          </Link>
        </section>
        <section className="panel padded">
          <div className="mini-title">
            <ShieldCheck size={17} />
            <h3>Account security</h3>
          </div>
          {data.user.guest ? (
            <>
              <p className="body-copy">
                Register to protect this workspace with an email and password. Private repositories
                are only visible to the current owner.
              </p>
              <Button Icon={LockKeyhole} onClick={() => modal('register')}>
                Secure workspace
              </Button>
            </>
          ) : (
            <form onSubmit={save} className="form-stack inline-form">
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={current}
                  onChange={(e) => old(e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <ErrorBox error={err} />
              <Button type="submit" Icon={KeyRound} disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          )}
        </section>
        <section className="panel padded">
          <div className="mini-title">
            <HardDrive size={17} />
            <h3>Storage limits</h3>
          </div>
          <dl>
            <dt>Individual file</dt>
            <dd>32 MB</dd>
            <dt>Repository version</dt>
            <dd>128 MB</dd>
            <dt>Files per version</dt>
            <dd>2,000</dd>
            <dt>Repositories</dt>
            <dd>{data.repos.length + data.trash} / 100</dd>
            <dt>Versions per project</dt>
            <dd>500</dd>
          </dl>
        </section>
      </div>
      {signout && (
        <ConfirmDialog
          title="Sign out of this workspace?"
          description="Your projects remain on the server. Sign in again to return to this account."
          action="Sign out"
          close={() => out(false)}
          run={async () => {
            await api('/auth/logout', 'POST');
            const next = await api<Workspace>('/session/start', 'POST');
            setData(next);
            nav('/');
            toast('Signed out. A separate guest workspace is open.');
          }}
        />
      )}
    </>
  );
}
