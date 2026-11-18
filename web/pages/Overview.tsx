import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Download,
  FolderGit2,
  Globe2,
  HardDrive,
  Layers3,
  Plus,
  Terminal,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Empty, RepoRow, Section } from '../components/UI';
import { VaultArt } from '../components/VaultArt';
import { bytes, clock, languages, tags, type EventItem } from '../lib';
import { useVault } from '../store';
export function LogLine({ e }: { e: EventItem }) {
  const { data } = useVault();
  const active = e.repo && data.repos.some((r) => r.id === e.repo);
  return (
    <div className={'log-line event-' + e.kind}>
      <div className="log-top">
        <time>{clock(e.created)}</time>
        <span>{tags[e.kind] || e.kind}</span>
      </div>
      <div className="log-sub">
        <span className="terminal-arrow">↳</span>
        {active ? <Link to={'/r/' + e.repo}>{e.subject}</Link> : <span>{e.subject}</span>}
        {e.kind === 'published' && <em>public</em>}
        {e.kind === 'version' && <em>v{e.detail.match(/\d+/)?.[0]}</em>}
      </div>
    </div>
  );
}
export default function Overview() {
  const { data, online, modal } = useVault();
  const repos = data.repos;
  const pub = repos.filter((x) => x.visibility === 'public').length;
  const downloads = repos.reduce((s, r) => s + r.downloads, 0);
  const [size, unit] = bytes(data.storage).split(' ');
  const counts: Record<string, number> = {};
  repos.forEach((r) => (counts[r.language] = (counts[r.language] || 0) + 1));
  const stats = [
    {
      icon: FolderGit2,
      label: 'Repositories',
      n: repos.length,
      suffix: '',
      note: 'total projects',
      tint: 'lime',
      to: '/repositories',
    },
    {
      icon: Globe2,
      label: 'Public repositories',
      n: pub,
      suffix: '',
      note: 'published',
      tint: 'blue',
      to: '/repositories?visibility=public',
    },
    {
      icon: Download,
      label: 'Downloads',
      n: downloads,
      suffix: '',
      note: 'all time',
      tint: 'violet',
      to: '/activity?kind=download',
    },
    {
      icon: HardDrive,
      label: 'Storage used',
      n: size,
      suffix: unit,
      note: 'of ' + bytes(data.quota),
      tint: 'amber',
      to: '/settings#storage',
    },
  ];
  return (
    <>
      <section className="hero">
        <div className="hero-grid" />
        <VaultArt />
        <div className="hero-content">
          <span className="system-badge">
            <i />
            {online ? 'SYSTEM ONLINE' : 'RECONNECTING'}
          </span>
          <h1>
            Workspace overview
            <span aria-hidden="true" className="hero-period">
              .
            </span>
          </h1>
          <p>Your repositories, files, and activity in one place.</p>
          <div className="hero-actions">
            <Button primary Icon={Plus} onClick={() => modal('create')}>
              New repository
            </Button>
            <Link to="/upload" className="button">
              <Upload size={15} />
              Upload files
            </Link>
          </div>
        </div>
      </section>
      <div className="metrics">
        {stats.map(({ icon: Icon, label, n, suffix, note, tint, to }) => (
          <Link className="metric" key={label} to={to}>
            <div className="metric-top">
              <span className={'metric-icon tint-' + tint}>
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span>{label}</span>
            </div>
            <div className="metric-bottom">
              <strong>
                {n}
                {suffix && <small>{suffix}</small>}
              </strong>
              <span>{note}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section>
          <Section title="Recent repositories" count={repos.length} to="/repositories" />
          <div className="recent-list">
            {repos.slice(0, 5).map((r) => (
              <RepoRow key={r.id} repo={r} />
            ))}
            {!repos.length && (
              <Empty
                title="Your vault is ready"
                detail="Create your first repository to get started."
              >
                <Button primary Icon={Plus} onClick={() => modal('create')}>
                  New repository
                </Button>
              </Empty>
            )}
          </div>
        </section>
        <aside className="dashboard-aside">
          <section>
            <div className="section-heading">
              <div className="inline">
                <Terminal className="section-glyph" size={18} />
                <h2>Activity log</h2>
              </div>
              <span className="live-badge">
                <i />
                {online ? 'Live' : 'Paused'}
              </span>
            </div>
            <div className="terminal-panel">
              <div className="terminal-chrome">
                <span className="window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>workspace.log</span>
                <Terminal size={13} />
              </div>
              <div className="terminal-body">
                {data.events.slice(0, 5).map((e) => (
                  <LogLine key={e.id} e={e} />
                ))}
                <div className="prompt">
                  <b>devvault</b>
                  <span>~</span> $ <i />
                </div>
              </div>
              <Link className="terminal-foot" to="/activity">
                View full activity
                <ArrowRight size={13} />
              </Link>
            </div>
          </section>
          <section className="languages-panel">
            <div className="mini-title">
              <Braces size={15} />
              <h3>Repository languages</h3>
            </div>
            {repos.length ? (
              <>
                <div className="language-bar">
                  {Object.entries(counts).map(([name, n]) => (
                    <span
                      key={name}
                      title={`${name}: ${n} repositories`}
                      style={{ flex: n, background: languages[name] || '#89949b' }}
                    />
                  ))}
                </div>
                <div className="language-key">
                  {Object.entries(counts).map(([name, n]) => (
                    <span key={name}>
                      <i style={{ background: languages[name] || '#89949b' }} />
                      {name}
                      <b>{n}</b>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Upload source files to detect languages.</p>
            )}
          </section>
        </aside>
      </div>
      <div className="workspace-foot">
        <span>
          <Layers3 size={12} />
          DEVVAULT WORKSPACE
        </span>
        <Link to="/explore">
          Explore public repositories <ArrowUpRight size={12} />
        </Link>
      </div>
    </>
  );
}
