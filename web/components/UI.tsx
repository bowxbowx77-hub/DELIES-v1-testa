import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Box,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  FileCode2,
  FolderOpen,
  Globe2,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  SlidersHorizontal,
  SquareTerminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { age, languages, type Repo, type Style, type User } from '../lib';
export const presets: { style: Style; Icon: LucideIcon; label: string }[] = [
  { style: 'violet', Icon: Box, label: 'Component' },
  { style: 'lime', Icon: SquareTerminal, label: 'Terminal' },
  { style: 'blue', Icon: Braces, label: 'Code' },
  { style: 'amber', Icon: SlidersHorizontal, label: 'Configuration' },
  { style: 'rose', Icon: BookOpen, label: 'Notebook' },
  { style: 'cyan', Icon: Layers3, label: 'Layers' },
];
export function Logo() {
  return (
    <div className="wordmark">
      <svg width="33" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <g
          stroke="currentColor"
          strokeWidth="2.8"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="m3 11.5 15-7.6 15 7.6L18 19z" />
          <path d="m3 18 15 7.5L33 18M3 24.6 18 32l15-7.4" />
        </g>
      </svg>
      <span>DEVVAULT</span>
    </div>
  );
}
export function Avatar({ user, big = false }: { user: User; big?: boolean }) {
  return (
    <span className={`avatar tint-${user.color} ${big ? 'big' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" shapeRendering="crispEdges">
        <path d="M6 3h3v3h6V3h3v3h3v3h2v9h-3v3h-4v-3H8v3H4v-3H1V9h2V6h3z" />
        <path fill="#162118" d="M6 9h3v4H6zm9 0h3v4h-3zM9 15h6v2H9z" />
      </svg>
    </span>
  );
}
export function RepoIcon({ style, big = false }: { style: Style; big?: boolean }) {
  const Icon = (presets.find((x) => x.style === style) || presets[0]).Icon;
  return (
    <span className={`repo-icon tint-${style} ${big ? 'big' : ''}`}>
      <Icon size={big ? 29 : 22} strokeWidth={1.65} />
    </span>
  );
}
export function Visibility({ value }: { value: Repo['visibility'] }) {
  const Icon = value === 'public' ? Globe2 : LockKeyhole;
  return (
    <span className={`visibility ${value}`}>
      <Icon size={10.5} strokeWidth={1.7} />
      {value === 'public' ? 'Public' : 'Private'}
    </span>
  );
}
export function Button({
  children,
  Icon,
  onClick,
  primary = false,
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  Icon?: LucideIcon;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${primary ? 'primary' : ''} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {Icon && <Icon size={15.5} />} {children}
    </button>
  );
}
export function Language({ name }: { name: string }) {
  return (
    <span className="language">
      <i style={{ background: languages[name] || '#99a8b1' }} />
      {name}
    </span>
  );
}
export function RepoRow({ repo: r }: { repo: Repo }) {
  return (
    <Link to={'/r/' + r.id} className="repo-row">
      <RepoIcon style={r.style} />
      <div className="repo-info">
        <div className="repo-line">
          <h3>{r.name}</h3>
          <Visibility value={r.visibility} />
        </div>
        <p>{r.description || 'No description yet.'}</p>
        <div className="repo-meta">
          <Language name={r.language} />
          <i className="sep" />
          <span className="meta-item">
            <FileCode2 size={12} />
            {r.files} files
          </span>
          <i className="sep" />
          <span title={new Date(r.updated).toLocaleString()} className="meta-item">
            <Clock3 size={12} />
            {age(r.updated)}
          </span>
        </div>
      </div>
      <ChevronRight className="row-arrow" size={16} />
    </Link>
  );
}
export function Title({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <div className="eyebrow">
          <i />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  detail,
  children,
  Icon = FolderOpen,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
  Icon?: LucideIcon;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error-box">
      <AlertCircle size={16} />
      <span>{error}</span>
    </div>
  ) : null;
}
export function Loading({ text = 'Loading workspace…' }: { text?: string }) {
  return (
    <div className="loading">
      <LoaderCircle size={19} className="spin" />
      {text}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef(close);
  closer.current = close;
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    const sel =
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
    const initial =
      el?.querySelector<HTMLElement>('[data-autofocus]') || el?.querySelector<HTMLElement>(sel);
    initial?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closer.current();
      }
      if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(sel)).filter(
          (x) => x.offsetParent !== null,
        );
        if (!nodes.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      active?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
      >
        <header className="modal-header">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" aria-label="Close dialog" onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Section({
  title,
  count,
  link,
  to,
}: {
  title: string;
  count?: number;
  link?: string;
  to?: string;
}) {
  return (
    <div className="section-heading">
      <div className="inline">
        <h2>{title}</h2>
        {count !== undefined && <span className="count-tag">{String(count).padStart(2, '0')}</span>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {link || 'View all'}
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}
export function StylePicker({ value, onChange }: { value: Style; onChange: (x: Style) => void }) {
  return (
    <div className="style-picker">
      {presets.map(({ style, Icon, label }) => (
        <button
          type="button"
          key={style}
          aria-label={`${label} icon`}
          aria-pressed={style === value}
          className={`tint-${style} ${style === value ? 'selected' : ''}`}
          onClick={() => onChange(style)}
        >
          <Icon size={21} />
          {style === value && <Check size={9} className="style-check" />}
        </button>
      ))}
    </div>
  );
}
