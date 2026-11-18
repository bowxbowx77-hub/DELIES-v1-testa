import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  HardDrive,
  History,
  Info,
  Pencil,
  RotateCcw,
  Scale,
  Settings2,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog, DeleteDialog } from '../components/Dialogs';
import { RepoForm } from '../components/RepoForm';
import {
  Button,
  Empty,
  ErrorBox,
  Language,
  Loading,
  Modal,
  RepoIcon,
  Visibility,
} from '../components/UI';
import { age, api, bytes, date, errText, type Detail, type VaultFile, type Version } from '../lib';
import { useActions } from '../store';
function FilePreview({
  file,
  d,
  close,
  changed,
}: {
  file: VaultFile;
  d: Detail;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const { toast, refresh } = useActions();
  const [res, load] = useState<{ text: string | null; truncated: boolean } | null>(null);
  const [error, err] = useState('');
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [path, setPath] = useState(file.path);
  const [busy, work] = useState(false);
  const base =
    '/repos/' +
    d.repo.id +
    '/file?version=' +
    d.selected +
    '&path=' +
    encodeURIComponent(file.path);
  useEffect(() => {
    let live = true;
    api<{ text: string | null; truncated: boolean }>(base)
      .then((r) => {
        if (live) load(r);
      })
      .catch((e) => {
        if (live) err(errText(e));
      });
    return () => {
      live = false;
    };
  }, [base]);
  const act = async (e: FormEvent) => {
    e.preventDefault();
    work(true);
    err('');
    try {
      await api('/repos/' + d.repo.id + '/files', 'POST', {
        operation: mode,
        path: file.path,
        target: path,
        base: d.selected,
      });
      await changed();
      await refresh();
      toast('File change saved in a new version.');
      close();
    } catch (e) {
      err(errText(e));
    } finally {
      work(false);
    }
  };
  return (
    <Modal
      title={file.path.split('/').at(-1)!}
      subtitle={`${file.path} · ${bytes(file.size)} · v${d.selected}`}
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <div className="file-preview">
        <ErrorBox error={error} />
        {mode !== 'view' ? (
          <form className="form-stack" onSubmit={act}>
            {mode === 'rename' ? (
              <label>
                New file path
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  required
                  maxLength={512}
                />
              </label>
            ) : (
              <p>
                Remove this file from the current version? The previous version will retain a copy.
              </p>
            )}
            <div className="form-actions">
              <Button onClick={() => setMode('view')} disabled={busy}>
                Cancel
              </Button>
              <Button primary type="submit" disabled={busy}>
                {mode === 'rename' ? 'Save path' : 'Remove file'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            {!res && !error ? (
              <Loading text="Reading file…" />
            ) : res?.text === null ? (
              <Empty
                Icon={File}
                title="Binary file"
                detail="Download this file to open it locally."
              />
            ) : (
              res && (
                <>
                  <div className="code-scroll">
                    <pre>{res.text || '(empty file)'}</pre>
                  </div>
                  {res.truncated && (
                    <p className="field-hint">
                      Preview limited to the first 96 KB. Download for the complete file.
                    </p>
                  )}
                </>
              )
            )}
            <div className="preview-actions">
              <a className="button" href={'/api' + base + '&download=1'} download>
                <Download size={14} />
                Download file
              </a>
              {d.owner && d.selected === d.repo.version && (
                <>
                  <Button Icon={Pencil} onClick={() => setMode('rename')}>
                    Rename
                  </Button>
                  <button
                    className="icon-btn danger-muted"
                    aria-label="Remove file"
                    onClick={() => setMode('delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
export default function Repository({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { refresh, toast } = useActions();
  const [d, setD] = useState<Detail | null>(null);
  const [err, error] = useState('');
  const [tab, setTab] = useState('files');
  const [folder, enter] = useState('');
  const [file, preview] = useState<VaultFile | null>(null);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [restore, setRestore] = useState<Version | null>(null);
  const [share, setShare] = useState(false);
  const [downloadBusy, downloading] = useState(false);
  const [actionErr, actionError] = useState('');
  const seq = useRef(0);
  const load = useCallback(
    async (v?: number, visit = false) => {
      const token = ++seq.current;
      try {
        const result = await api<Detail>(
          '/repos/' +
            id +
            '?' +
            new URLSearchParams({ ...(v && { version: String(v) }), ...(visit && { visit: '1' }) }),
        );
        if (token === seq.current) {
          setD(readOnly ? { ...result, owner: false } : result);
          error('');
        }
      } catch (e) {
        if (token === seq.current) error(errText(e));
      }
    },
    [id, readOnly],
  );
  useEffect(() => {
    setD(null);
    enter('');
    setTab('files');
    load(undefined, true);
    return () => {
      seq.current++;
    };
  }, [load]);
  useEffect(() => {
    if (d) document.title = d.repo.name + ' · DEVVAULT';
  }, [d]);
  if (err)
    return (
      <>
        <ErrorBox error={err} />
        <Link className="button" to="/repositories">
          <ArrowLeft size={15} />
          My repositories
        </Link>
      </>
    );
  if (!d) return <Loading text="Opening repository…" />;
  const r = d.repo;
  const url = window.location.origin + '/r/' + r.id;
  const paths = folder ? folder.split('/') : [];
  const prefix = folder ? folder + '/' : '';
  const items = new Map<string, { name: string; dir: boolean; f: VaultFile }>();
  d.files
    .filter((f) => f.path.startsWith(prefix))
    .forEach((f) => {
      const name = f.path.slice(prefix.length).split('/')[0];
      items.set(name, { name, dir: f.path !== prefix + name, f });
    });
  const files = [...items.values()].sort(
    (a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name),
  );
  const sel = d.versions.find((v) => v.number === d.selected)!;
  const selectVersion = async (v: number) => {
    enter('');
    setTab('files');
    await load(v);
  };
  const download = async () => {
    downloading(true);
    actionError('');
    try {
      const res = await fetch(`/api/repos/${r.id}/download?version=${d.selected}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Download failed.');
      const data = await res.blob();
      const link = document.createElement('a'),
        href = URL.createObjectURL(data);
      link.href = href;
      link.download = `${r.name}-v${d.selected}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      await refresh();
      await load(d.selected);
      toast('Repository archive is ready.');
    } catch (e) {
      actionError(errText(e));
    } finally {
      downloading(false);
    }
  };
  return (
    <>
      <Link className="back-link" to={d.owner ? '/repositories' : '/explore'}>
        <ArrowLeft size={13} />
        {d.owner ? 'My repositories' : 'Public repositories'}
      </Link>
      <div className="project-header">
        <div className="project-heading">
          <RepoIcon style={r.style} big />
          <div>
            <div className="project-brow">
              {d.owner ? 'PERSONAL REPOSITORY' : 'PUBLIC REPOSITORY'}
            </div>
            <h1>{r.name}</h1>
          </div>
        </div>
        <div className="header-actions">
          {d.owner && (
            <button
              className="button icon-only"
              aria-label="Repository settings"
              onClick={() => setEdit(true)}
            >
              <Settings2 size={17} />
            </button>
          )}
          <Button primary Icon={Download} disabled={downloadBusy} onClick={download}>
            {downloadBusy ? 'Preparing…' : 'Download ZIP'}
          </Button>
        </div>
      </div>
      <p className="project-desc">{r.description || 'No description provided.'}</p>
      <div className="project-meta">
        <Visibility value={r.visibility} />
        <Language name={r.language} />
        <span>
          <Scale size={13} />
          {r.license}
        </span>
        <span>
          <Clock3 size={13} />
          Updated {age(r.updated)}
        </span>
      </div>
      <ErrorBox error={actionErr} />
      <div className="filter-tabs repo-tabs">
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          <FolderOpen size={16} />
          Files <small>{d.files.length}</small>
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={16} />
          Version history <small>{d.versions.length}</small>
        </button>
        <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
          <Info size={15} />
          About
        </button>
      </div>
      <div className="content-split repo-split">
        <section>
          {tab === 'files' ? (
            <>
              <div className="version-strip">
                <span className="version-tag">
                  <GitBranch size={12} />v{d.selected}
                </span>
                <span>{sel.message}</span>
                {d.selected !== r.version ? (
                  <button className="link-button" onClick={() => selectVersion(r.version)}>
                    Back to latest
                  </button>
                ) : (
                  <small>Latest version</small>
                )}
              </div>
              <div className="panel file-browser">
                <div className="file-breadcrumbs">
                  <button onClick={() => enter('')}>
                    <FolderGitIcon />
                    {r.name}
                  </button>
                  {paths.map((p, i) => (
                    <span key={i}>
                      <ChevronRight size={12} />
                      <button onClick={() => enter(paths.slice(0, i + 1).join('/'))}>{p}</button>
                    </span>
                  ))}
                </div>
                {folder && (
                  <button className="file-line" onClick={() => enter(paths.slice(0, -1).join('/'))}>
                    <Folder size={16} />
                    <b>..</b>
                    <small>Parent folder</small>
                  </button>
                )}
                {files.map(({ name, dir, f }) => (
                  <button
                    className={'file-line ' + (dir ? 'is-dir' : '')}
                    key={name}
                    onClick={() => (dir ? enter(prefix + name) : preview(f))}
                  >
                    {dir ? <Folder size={17} /> : <FileCode2 size={16} />}
                    <b>{name}</b>
                    <small>{dir ? 'Folder' : bytes(f.size)}</small>
                    <ChevronRight size={13} />
                  </button>
                ))}
                {!d.files.length && (
                  <Empty
                    title="No files yet"
                    detail="Upload your source files to build the first project snapshot."
                  />
                )}
              </div>
              {d.owner && (
                <Link className="button top-space" to={'/upload?repo=' + r.id}>
                  <Upload size={15} />
                  Upload files
                </Link>
              )}
            </>
          ) : tab === 'history' ? (
            <div className="panel version-history">
              <div className="panel-heading">
                <History size={17} />
                <h3>Saved versions</h3>
              </div>
              {d.versions.map((v) => (
                <div className="history-entry" key={v.number}>
                  <div className="history-mark">
                    <GitCommitHorizontal size={20} />
                  </div>
                  <div>
                    <div className="inline">
                      <strong>Version {v.number}</strong>
                      {v.number === r.version && <span className="latest">Latest</span>}
                    </div>
                    <p>{v.message}</p>
                    <small>{new Date(v.created).toLocaleString()}</small>
                    <div className="version-actions">
                      <button className="link-button" onClick={() => selectVersion(v.number)}>
                        <Eye size={13} />
                        View files
                      </button>
                      {d.owner && v.number !== r.version && (
                        <button className="link-button muted" onClick={() => setRestore(v)}>
                          <RotateCcw size={12} />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel padded about-project">
              <div className="mini-title">
                <BookOpen size={18} />
                <h3>About this project</h3>
              </div>
              <p>{r.description || 'No description yet.'}</p>
              <dl>
                <dt>Author</dt>
                <dd>{r.author}</dd>
                <dt>Created</dt>
                <dd>{date(r.created)}</dd>
                <dt>License</dt>
                <dd>{r.license}</dd>
                <dt>Project size</dt>
                <dd>{bytes(r.size)}</dd>
                <dt>Repository ID</dt>
                <dd className="mono wrap">{r.id}</dd>
              </dl>
              {d.files.some((x) => x.path === 'README.md') && (
                <Button
                  Icon={BookOpen}
                  onClick={() => preview(d.files.find((x) => x.path === 'README.md')!)}
                >
                  Read README.md
                </Button>
              )}
            </div>
          )}
        </section>
        <aside>
          <div className="panel padded details-panel">
            <div className="mini-title">
              <Info size={16} />
              <h3>Repository details</h3>
            </div>
            <dl>
              <dt>
                <UserRound size={14} />
                Author
              </dt>
              <dd>{r.author}</dd>
              <dt>
                <CalendarDays size={14} />
                Created
              </dt>
              <dd>{date(r.created)}</dd>
              <dt>
                <HardDrive size={14} />
                Size
              </dt>
              <dd>{bytes(r.size)}</dd>
              <dt>
                <Eye size={14} />
                Public views
              </dt>
              <dd>{r.views}</dd>
              <dt>
                <Download size={14} />
                ZIP downloads
              </dt>
              <dd>{r.downloads}</dd>
            </dl>
            {r.visibility === 'public' ? (
              <Button
                Icon={Copy}
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(url)
                    .then(() => toast('Public link copied.'))
                    .catch(() => setShare(true));
                  if (!navigator.clipboard) setShare(true);
                }}
              >
                Copy public link
              </Button>
            ) : (
              d.owner && (
                <Button Icon={Globe2} onClick={() => setEdit(true)}>
                  Change visibility
                </Button>
              )
            )}
          </div>
          {d.owner && (
            <div className="project-controls">
              <button onClick={() => setEdit(true)}>
                <Settings2 size={14} />
                Repository settings
              </button>
              <button className="danger-muted" onClick={() => setDel(true)}>
                <Trash2 size={14} />
                Move to Trash
              </button>
            </div>
          )}
        </aside>
      </div>
      {edit && <RepoForm repo={r} close={() => setEdit(false)} after={() => load()} />}{' '}
      {del && (
        <DeleteDialog
          repo={r}
          close={() => setDel(false)}
          done={() => {
            setDel(false);
            nav('/trash');
          }}
        />
      )}
      {file && <FilePreview file={file} d={d} close={() => preview(null)} changed={() => load()} />}{' '}
      {restore && (
        <ConfirmDialog
          title={'Restore version ' + restore.number + '?'}
          description="The selected files will be saved as a new version. Your existing history will not be overwritten."
          action="Restore version"
          restore
          close={() => setRestore(null)}
          run={async () => {
            await api('/repos/' + r.id + '/restore-version', 'POST', {
              number: restore.number,
              base: r.version,
            });
            await load();
            await refresh();
            toast('Version restored as a new snapshot.');
          }}
        />
      )}
      {share && (
        <Modal title="Public repository link" close={() => setShare(false)}>
          <div className="form-stack">
            <label>
              Permanent link
              <input data-autofocus readOnly value={url} onFocus={(e) => e.target.select()} />
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
function FolderGitIcon() {
  return <Code2 size={14} />;
}
