import '@fontsource-variable/geist/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Database,
  FolderGit2,
  Globe2,
  LayoutDashboard,
  LogIn,
  PanelLeft,
  Activity as Pulse,
  Search,
  Settings as SettingsIcon,
  Trash2,
  UploadCloud,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthDialog, SearchDialog } from './components/Dialogs';
import { RepoForm } from './components/RepoForm';
import { Avatar, Button, Empty, Loading, Logo } from './components/UI';
import { api, bytes, errText, type Workspace } from './lib';
import { Profile, Settings } from './pages/Account';
import Activity from './pages/Activity';
import Overview from './pages/Overview';
import { Repositories, Trash } from './pages/Repositories';
import Repository from './pages/Repository';
import Upload from './pages/Upload';
import { ReaderContext, StoreContext, type ModalName } from './store';
import './style.css';
const names: Record<string, string> = {
  '/': 'Overview',
  '/repositories': 'My repositories',
  '/explore': 'Public explorer',
  '/upload': 'Upload files',
  '/activity': 'Activity log',
  '/trash': 'Trash',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
};
const primary = [
  { to: '/', name: 'Overview', Icon: LayoutDashboard },
  { to: '/repositories', name: 'My repositories', Icon: FolderGit2 },
  { to: '/explore', name: 'Public explorer', Icon: Globe2 },
];
const manage = [
  { to: '/upload', name: 'Upload files', Icon: UploadCloud },
  { to: '/activity', name: 'Activity log', Icon: Pulse },
  { to: '/trash', name: 'Trash', Icon: Trash2 },
];
function App() {
  const [data, setData] = useState<Workspace | null>(null);
  const [visitor, setVisitor] = useState(false);
  const [err, error] = useState('');
  const [online, setOnline] = useState(true);
  const [dlg, modal] = useState<ModalName>(null);
  const [mobile, drawer] = useState(false);
  const [collapsed, collapse] = useState(false);
  const [menu, setMenu] = useState<'user' | 'bell' | null>(null);
  const [notice, msg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const location = useLocation(),
    nav = useNavigate();
  const pop = useRef<HTMLDivElement>(null);
  const path = location.pathname;
  const title = names[path] || (path.startsWith('/r/') ? 'Repository' : 'Not found');
  const toast = useCallback((s: string) => {
    msg(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => msg(''), 4200);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const w = await api<Workspace>('/workspace');
      setData(w);
      setOnline(true);
    } catch (e) {
      setOnline(false);
      throw e;
    }
  }, []);
  const boot = useCallback(async () => {
    error('');
    try {
      if (window.location.pathname.startsWith('/r/')) {
        const s = await api<{ workspace: Workspace | null }>('/session');
        if (s.workspace) setData(s.workspace);
        else setVisitor(true);
      } else {
        setData(await api<Workspace>('/session/start', 'POST'));
        setVisitor(false);
      }
    } catch (e) {
      error(errText(e));
    }
  }, []);
  useEffect(() => {
    boot();
  }, [boot]);
  useEffect(() => {
    if (visitor && !path.startsWith('/r/')) {
      setVisitor(false);
      boot();
    }
  }, [path, visitor, boot]);
  useEffect(() => {
    if (!data) return;
    const int = setInterval(() => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    }, 20000);
    return () => clearInterval(int);
  }, [!!data, refresh]);
  useEffect(() => {
    setMenu(null);
    drawer(false);
    window.scrollTo(0, 0);
    document.title = title + ' · DEVVAULT';
  }, [path, title]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (data) {
          setMenu(null);
          modal((d) => (d === 'search' ? null : 'search'));
        }
      }
      if (e.key === 'Escape') {
        setMenu(null);
        drawer(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [!!data]);
  useEffect(() => {
    if (!menu) return;
    const click = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [menu]);
  useEffect(() => {
    if (!mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
    };
  }, [mobile]);
  if (!data && visitor && path.startsWith('/r/'))
    return (
      <ReaderContext.Provider value={{ refresh: async () => {}, toast }}>
        <header className="public-header">
          <Link to="/" aria-label="DEVVAULT home">
            <Logo />
          </Link>
          <span>
            <Globe2 size={14} />
            Public vault
          </span>
          <Link to="/" className="button">
            Open workspace <ArrowUpRight size={14} />
          </Link>
        </header>
        <main className="public-content">
          <Routes>
            <Route path="/r/:id" element={<Repository readOnly />} />
          </Routes>
        </main>
        {notice && (
          <div role="status" className="toast public-toast">
            <CheckCircle2 size={15} />
            {notice}
          </div>
        )}
      </ReaderContext.Provider>
    );
  if (!data)
    return (
      <div className="boot">
        <Logo />
        {err ? (
          <>
            <p role="alert">{err}</p>
            <Button onClick={boot}>Retry connection</Button>
          </>
        ) : (
          <Loading text="Opening your workspace…" />
        )}
      </div>
    );
  const navItem = ({ to, name, Icon }: (typeof primary)[0]) => (
    <NavLink
      end={to === '/'}
      key={to}
      to={to}
      onClick={() => {
        drawer(false);
        setMenu(null);
      }}
      title={name}
      className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}
    >
      <Icon size={17} strokeWidth={1.65} />
      <span>{name}</span>
      {to === '/repositories' && <small>{data.repos.length}</small>}
      {to === '/trash' && data.trash > 0 && <small>{data.trash}</small>}
    </NavLink>
  );
  const toggleSide = () => {
    if (window.innerWidth <= 850) drawer((x) => !x);
    else collapse((x) => !x);
  };
  const openModal = (d: ModalName) => {
    setMenu(null);
    drawer(false);
    modal(d);
  };
  return (
    <StoreContext.Provider value={{ data, online, refresh, setData, modal: openModal, toast }}>
      <div
        className={'app-shell ' + (collapsed ? 'collapsed ' : '') + (mobile ? 'mobile-open' : '')}
      >
        <a className="skip" href="#main">
          Skip to content
        </a>
        {mobile && (
          <button
            aria-label="Close navigation"
            className="drawer-shade"
            onClick={() => drawer(false)}
          />
        )}
        <aside className="sidebar">
          <Link to="/" className="brand-link" aria-label="DEVVAULT home">
            <Logo />
          </Link>
          <button
            className="mobile-close icon-btn"
            aria-label="Close navigation"
            onClick={() => drawer(false)}
          >
            <X size={18} />
          </button>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <div className="nav-label">Workspace</div>
            {primary.map(navItem)}
            <div className="nav-label second">Management</div>
            {manage.map(navItem)}
          </nav>
          <div className="side-bottom">
            <div className="side-identity">
              <Avatar user={data.user} />
              <div>
                <strong>{data.user.guest ? 'Guest workspace' : data.user.name}</strong>
                {data.user.guest ? (
                  <button onClick={() => openModal('register')}>
                    Create account <ArrowUpRight size={10} />
                  </button>
                ) : (
                  <Link to="/profile">
                    View profile <ArrowUpRight size={10} />
                  </Link>
                )}
              </div>
            </div>
            <div className="side-settings">
              {navItem({ to: '/settings', name: 'Settings', Icon: SettingsIcon })}
            </div>
            <Link className="storage-card" to="/settings#storage">
              <div className="side-storage-head">
                <Database size={14} />
                <strong>Workspace storage</strong>
                <ArrowUpRight size={12} />
              </div>
              <div className="capacity-track">
                <i
                  style={{
                    width: `${data.storage ? Math.max(0.8, (data.storage / data.quota) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="side-storage-meta">
                <b>{bytes(data.storage)}</b>
                <span>/ {bytes(data.quota)}</span>
              </div>
            </Link>
            <div className="side-build">
              <span className={'build-indicator ' + (!online ? 'offline' : '')} />
              {online ? 'Server connected' : 'Connection lost'}
              <small>v1.0.0</small>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-btn sidebar-toggle"
                aria-label="Toggle navigation"
                onClick={toggleSide}
              >
                <PanelLeft size={17} />
              </button>
              <i />
              <Link to="/">Workspace</Link>
              <ChevronRight size={12} />
              <b>{title}</b>
            </div>
            <div className="top-right" ref={pop}>
              <button
                aria-label="Search workspace"
                className="header-search"
                onClick={() => openModal('search')}
              >
                <Search size={15} />
                <span>Search workspace...</span>
                <kbd>⌘ K</kbd>
              </button>
              <div className="pop-anchor">
                <button
                  className={'icon-btn bell-btn ' + (menu === 'bell' ? 'open' : '')}
                  aria-label={'Notifications' + (data.unread ? `, ${data.unread} unread` : '')}
                  aria-expanded={menu === 'bell'}
                  onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
                >
                  <Bell size={18} />
                  {data.unread > 0 && <i />}
                </button>
                {menu === 'bell' && (
                  <div className="dropdown notification-pop">
                    <div className="dropdown-title">
                      <strong>Notifications</strong>
                      <span className="count-tag">{data.unread} unread</span>
                    </div>
                    {data.events.slice(0, 3).map((e) => (
                      <div className="notice-line" key={e.id}>
                        <span className={!e.seen ? 'dot unread' : 'dot'} />
                        <div>
                          <b>{e.detail}</b>
                          <small>{e.subject}</small>
                        </div>
                      </div>
                    ))}
                    <Link className="dropdown-foot" to="/notifications">
                      Open notifications
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}
              </div>
              <i className="header-divider" />
              <div className="pop-anchor">
                <button
                  aria-label="Account menu"
                  aria-expanded={menu === 'user'}
                  className="avatar-btn"
                  onClick={() => setMenu(menu === 'user' ? null : 'user')}
                >
                  <Avatar user={data.user} />
                </button>
                {menu === 'user' && (
                  <div className="dropdown user-pop">
                    <div className="dropdown-user">
                      <strong>{data.user.name}</strong>
                      <small>{data.user.email || 'Personal guest workspace'}</small>
                    </div>
                    <Link to="/profile">
                      <UserRound size={15} />
                      Your profile
                    </Link>
                    <Link to="/settings">
                      <SettingsIcon size={15} />
                      Account settings
                    </Link>
                    {data.user.guest && (
                      <>
                        <hr />
                        <button onClick={() => openModal('register')}>
                          <UserPlus size={15} />
                          Create account
                        </button>
                        <button onClick={() => openModal('login')}>
                          <LogIn size={15} />
                          Sign in
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>
          <main id="main" className="main-content" key={data.user.id}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/repositories" element={<Repositories key="mine" />} />
              <Route path="/explore" element={<Repositories key="public" explore />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/r/:id" element={<Repository />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/activity" element={<Activity key="activity" />} />
              <Route
                path="/notifications"
                element={<Activity notifications key="notifications" />}
              />
              <Route path="/trash" element={<Trash />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="Page not found"
                    detail="This route doesn’t belong to the workspace."
                  >
                    <Button onClick={() => nav('/')}>Return to overview</Button>
                  </Empty>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
      {dlg === 'create' && <RepoForm close={() => modal(null)} />}{' '}
      {dlg === 'search' && <SearchDialog close={() => modal(null)} />}{' '}
      {(dlg === 'register' || dlg === 'login') && (
        <AuthDialog key={dlg} mode={dlg} close={() => modal(null)} />
      )}{' '}
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={17} />
          {notice}
          <button className="icon-btn" aria-label="Dismiss message" onClick={() => msg('')}>
            <X size={13} />
          </button>
        </div>
      )}
    </StoreContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
