import {
  ArrowRight,
  Check,
  CornerDownLeft,
  LogIn,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, type Repo } from '../lib';
import { useVault } from '../store';
import { Button, ErrorBox, Loading, Modal, RepoIcon, Visibility } from './UI';
export function AuthDialog({ mode, close }: { mode: 'register' | 'login'; close: () => void }) {
  const { refresh, modal, toast, data } = useVault();
  const nav = useNavigate();
  const register = mode === 'register';
  const [name, setName] = useState(data.user.name === 'Developer' ? '' : data.user.name);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, error] = useState('');
  const [busy, working] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    working(true);
    error('');
    try {
      await api('/auth/' + mode, 'POST', { name, email, password });
      await refresh();
      toast(
        register
          ? 'Account created. This workspace is now yours.'
          : 'Welcome back to your workspace.',
      );
      close();
      nav('/');
    } catch (e) {
      error(errText(e));
    } finally {
      working(false);
    }
  };
  return (
    <Modal
      title={register ? 'Create your account' : 'Welcome back'}
      subtitle={
        register
          ? 'Keep your current repositories and access them on any device.'
          : 'Sign in to your existing DEVVAULT workspace.'
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        {register && (
          <label>
            Display name
            <input
              data-autofocus
              required
              placeholder="Your name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email address
          <input
            data-autofocus={!register ? true : undefined}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            maxLength={254}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={register ? 10 : 1}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            placeholder={register ? 'At least 10 characters' : 'Enter your password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="info-note">
          <ShieldCheck size={18} />
          <span>
            {register
              ? 'Your guest workspace will become your personal account.'
              : 'Signing in switches workspaces. To keep this guest workspace, create an account instead.'}
          </span>
        </div>
        <ErrorBox error={err} />
        <Button type="submit" primary disabled={busy} Icon={register ? UserPlus : LogIn}>
          {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
        </Button>
        <p className="form-switch">
          {register ? 'Already have an account?' : 'New to DEVVAULT?'}{' '}
          <button type="button" onClick={() => modal(register ? 'login' : 'register')}>
            {register ? 'Sign in' : 'Create an account'} <ArrowRight size={12} />
          </button>
        </p>
      </form>
    </Modal>
  );
}
export function SearchDialog({ close }: { close: () => void }) {
  const { data } = useVault();
  const nav = useNavigate();
  const [q, query] = useState('');
  const [publicRepos, setPublic] = useState<Repo[]>([]);
  const [idx, index] = useState(0);
  const [err, error] = useState('');
  const [pending, wait] = useState(false);
  useEffect(() => {
    let live = true;
    index(0);
    if (!q.trim()) {
      setPublic([]);
      wait(false);
      return;
    }
    wait(true);
    const t = setTimeout(() => {
      api<{ repos: Repo[] }>('/public?q=' + encodeURIComponent(q))
        .then((r) => {
          if (live) {
            setPublic(r.repos);
            error('');
          }
        })
        .catch((e) => {
          if (live) error(errText(e));
        })
        .finally(() => {
          if (live) wait(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const needle = q.trim().toLowerCase();
  const my = data.repos.filter((r) =>
    (r.name + ' ' + r.description).toLowerCase().includes(needle),
  );
  const results = [...my, ...publicRepos.filter((r) => !my.some((x) => x.id === r.id))].slice(
    0,
    12,
  );
  const go = (i: number) => {
    if (results[i]) {
      nav('/r/' + results[i].id);
      close();
    }
  };
  return (
    <Modal title="Search workspace" close={close} className="search-modal">
      <div className="command-field">
        <Search size={19} />
        <input
          data-autofocus
          aria-label="Search repositories"
          placeholder="Search repository names and descriptions…"
          value={q}
          onChange={(e) => query(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              index((i) => Math.min(results.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              index((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter') go(idx);
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results">
        <div className="overline">{needle ? 'Matching repositories' : 'Recent repositories'}</div>
        {results.map((r, i) => (
          <button
            key={r.id}
            className={'command-item ' + (idx === i ? 'active' : '')}
            onMouseEnter={() => index(i)}
            onClick={() => go(i)}
          >
            <RepoIcon style={r.style} />
            <div>
              <strong>{r.name}</strong>
              <small>{r.description}</small>
            </div>
            <Visibility value={r.visibility} />
          </button>
        ))}
        {!results.length &&
          (pending ? (
            <Loading text="Searching…" />
          ) : (
            <div className="search-empty">
              <SearchX size={24} />
              <p>No repositories match “{q}”.</p>
            </div>
          ))}
        <ErrorBox error={err} />
      </div>
      <div className="command-foot">
        <span>↑ ↓ navigate</span>
        <span>
          <CornerDownLeft size={12} /> open repository
        </span>
      </div>
    </Modal>
  );
}
export function DeleteDialog({
  repo,
  permanent = false,
  close,
  done,
}: {
  repo: Repo;
  permanent?: boolean;
  close: () => void;
  done: () => void;
}) {
  const { refresh, toast } = useVault();
  const [name, setName] = useState('');
  const [err, error] = useState('');
  const [busy, working] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    working(true);
    try {
      await api(
        '/repos/' + repo.id + (permanent ? '/purge' : ''),
        'DELETE',
        permanent ? { confirm: name } : undefined,
      );
      await refresh();
      toast(
        permanent
          ? 'Repository and unreferenced files permanently removed.'
          : 'Repository moved to Trash.',
      );
      done();
    } catch (e) {
      error(errText(e));
    } finally {
      working(false);
    }
  };
  return (
    <Modal
      title={permanent ? 'Permanently delete repository?' : 'Move repository to Trash?'}
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="body-copy">
          {permanent ? (
            <>
              <strong>{repo.name}</strong> and all of its versions will be removed from this server.
              This cannot be undone.
            </>
          ) : (
            <>
              The public link to <strong>{repo.name}</strong> will stop working. Your files and
              version history stay intact until you empty this repository from Trash.
            </>
          )}
        </p>
        {permanent && (
          <label>
            Type <b>{repo.name}</b> to confirm
            <input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
        )}
        <ErrorBox error={err} />
        <div className="form-actions">
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="danger"
            Icon={Trash2}
            disabled={busy || (permanent && name !== repo.name)}
          >
            {busy ? 'Removing…' : permanent ? 'Delete permanently' : 'Move to Trash'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ConfirmDialog({
  title,
  description,
  action,
  run,
  close,
  restore = false,
}: {
  title: string;
  description: string;
  action: string;
  run: () => Promise<void>;
  close: () => void;
  restore?: boolean;
}) {
  const [err, error] = useState('');
  const [busy, working] = useState(false);
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="form-stack">
        <p className="body-copy">{description}</p>
        <ErrorBox error={err} />
        <div className="form-actions">
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            primary
            Icon={restore ? RotateCcw : Check}
            disabled={busy}
            onClick={async () => {
              working(true);
              try {
                await run();
                close();
              } catch (e) {
                error(errText(e));
                working(false);
              }
            }}
          >
            {busy ? 'Saving…' : action}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
