import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpRight,
  FolderGit2,
  Globe2,
  LayoutGrid,
  List,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DeleteDialog } from '../components/Dialogs';
import {
  Button,
  Empty,
  ErrorBox,
  Language,
  Loading,
  RepoIcon,
  RepoRow,
  Title,
  Visibility,
} from '../components/UI';
import { age, api, date, errText, type Repo } from '../lib';
import { useVault } from '../store';
export function Repositories({ explore = false }: { explore?: boolean }) {
  const { data, modal } = useVault();
  const [params, setParams] = useSearchParams();
  const [q, query] = useState('');
  const [sort, setSort] = useState('updated');
  const [grid, setGrid] = useState(explore);
  const [remote, setRemote] = useState<Repo[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(explore);
  const [err, error] = useState('');
  const [retry, setRetry] = useState(0);
  const vis = params.get('visibility') || 'all';
  useEffect(() => {
    if (!explore) return;
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      api<{ repos: Repo[]; more: boolean }>('/public?q=' + encodeURIComponent(q))
        .then((r) => {
          if (live) {
            setRemote(r.repos);
            setMore(r.more);
            error('');
          }
        })
        .catch((e) => {
          if (live) error(errText(e));
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 140);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [explore, q, retry]);
  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await api<{ repos: Repo[]; more: boolean }>(
        `/public?q=${encodeURIComponent(q)}&offset=${remote.length}`,
      );
      setRemote([...remote, ...r.repos]);
      setMore(r.more);
    } catch (e) {
      error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const list = (explore ? remote : data.repos)
    .filter(
      (r) =>
        (explore || vis === 'all' || r.visibility === vis) &&
        (r.name + ' ' + r.description).toLowerCase().includes(q.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'size'
          ? b.size - a.size
          : b.updated - a.updated,
    );
  return (
    <>
      <Title
        eyebrow={explore ? 'DISCOVERY' : 'WORKSPACE LIBRARY'}
        title={explore ? 'Explore repositories' : 'My repositories'}
        description={
          explore
            ? 'Discover published projects and download their source files.'
            : 'Your projects, organized and versioned in one vault.'
        }
        action={
          <Button primary Icon={Plus} onClick={() => modal('create')}>
            New repository
          </Button>
        }
      />
      {!explore && (
        <div className="filter-tabs">
          {['all', 'public', 'private'].map((v) => (
            <button
              key={v}
              onClick={() => setParams(v === 'all' ? {} : { visibility: v })}
              className={vis === v ? 'active' : ''}
            >
              {v === 'all' ? (
                <FolderGit2 size={15} />
              ) : v === 'public' ? (
                <Globe2 size={15} />
              ) : (
                <LockKeyhole size={15} />
              )}{' '}
              {v === 'all' ? 'All repositories' : v === 'public' ? 'Public' : 'Private'}
              <small>{data.repos.filter((r) => v === 'all' || r.visibility === v).length}</small>
            </button>
          ))}
        </div>
      )}
      <div className="library-tools">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Filter repositories"
            placeholder={explore ? 'Search public repositories…' : 'Filter repositories…'}
            value={q}
            onChange={(e) => query(e.target.value)}
          />
        </div>
        <select
          aria-label="Sort repositories"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Last updated</option>
          <option value="name">Name: A–Z</option>
          <option value="size">Largest first</option>
        </select>
        <div className="view-toggle">
          <button aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)}>
            <List size={16} />
          </button>
          <button aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)}>
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>
      <ErrorBox error={err} />
      {err && <Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
      {busy && !remote.length ? (
        <Loading text="Loading repositories…" />
      ) : list.length ? (
        <div className={grid ? 'project-grid' : 'library-list'}>
          {list.map((r) =>
            grid ? (
              <Link key={r.id} to={'/r/' + r.id} className="project-tile">
                <div className="tile-top">
                  <RepoIcon style={r.style} />
                  <Visibility value={r.visibility} />
                </div>
                <h3>{r.name}</h3>
                <p>{r.description || 'No description yet.'}</p>
                <div className="tile-author">
                  {r.author} <span>·</span> {age(r.updated)}
                </div>
                <div className="tile-foot">
                  <Language name={r.language} />
                  <span>
                    <ArrowDownToLine size={12} />
                    {r.downloads}
                  </span>
                  <ArrowUpRight size={14} />
                </div>
              </Link>
            ) : (
              <RepoRow key={r.id} repo={r} />
            ),
          )}
        </div>
      ) : (
        <Empty
          title={q ? 'No matching repositories' : 'No repositories here yet'}
          detail={
            q
              ? 'Try another name or description.'
              : explore
                ? 'Publish a repository to make it discoverable here.'
                : 'Create a repository or change the visibility filter.'
          }
          Icon={explore ? Globe2 : FolderGit2}
        >
          {!q && (
            <Button Icon={Plus} onClick={() => modal('create')}>
              New repository
            </Button>
          )}
        </Empty>
      )}
      {explore && more && (
        <Button disabled={busy} onClick={loadMore}>
          {busy ? 'Loading…' : 'Load more projects'}
        </Button>
      )}
    </>
  );
}
export function Trash() {
  const { data, refresh, toast } = useVault();
  const [items, setItems] = useState<Repo[] | null>(null);
  const [selected, select] = useState<Repo | null>(null);
  const [err, error] = useState('');
  const [busy, working] = useState('');
  const load = () =>
    api<{ repos: Repo[] }>('/trash')
      .then((r) => setItems(r.repos))
      .catch((e) => error(errText(e)));
  useEffect(() => {
    load();
  }, [data.trash]);
  const restore = async (r: Repo) => {
    working(r.id);
    try {
      await api('/repos/' + r.id + '/restore', 'POST');
      await refresh();
      await load();
      toast('Repository restored with its full version history.');
    } catch (e) {
      error(errText(e));
    } finally {
      working('');
    }
  };
  return (
    <>
      <Title
        eyebrow="WORKSPACE MANAGEMENT"
        title="Trash"
        description="Restore removed projects or permanently delete their stored versions."
      />
      <ErrorBox error={err} />
      {items === null ? (
        <Loading />
      ) : !items.length ? (
        <Empty
          Icon={Trash2}
          title="Your Trash is empty"
          detail="Deleted repositories appear here. Nothing is permanently removed until you confirm it."
        >
          <Link className="button" to="/repositories">
            View repositories <ArrowUpRight size={14} />
          </Link>
        </Empty>
      ) : (
        <div className="library-list">
          {items.map((r) => (
            <div className="trash-row panel" key={r.id}>
              <RepoIcon style={r.style} />
              <div>
                <h3>{r.name}</h3>
                <p>
                  Deleted {date(r.deleted!)} · {r.files} files · {r.version} versions
                </p>
              </div>
              <div className="trash-actions">
                <Button Icon={ArchiveRestore} disabled={busy === r.id} onClick={() => restore(r)}>
                  Restore
                </Button>
                <button
                  className="icon-btn danger-muted"
                  aria-label={'Permanently delete ' + r.name}
                  onClick={() => select(r)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <DeleteDialog
          repo={selected}
          permanent
          close={() => select(null)}
          done={() => {
            select(null);
            load();
          }}
        />
      )}
    </>
  );
}
