import {
  ArchiveRestore,
  ArrowUpRight,
  Bell,
  CheckCheck,
  Download,
  FileUp,
  FolderPlus,
  GitBranch,
  Globe2,
  Activity as Pulse,
  Terminal,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Empty, ErrorBox, Loading, Title } from '../components/UI';
import { api, clock, date, errText, tags, type EventItem } from '../lib';
import { useVault } from '../store';
const icons: Record<string, typeof Bell> = {
  created: FolderPlus,
  published: Globe2,
  upload: FileUp,
  version: GitBranch,
  workspace: Terminal,
  account: UserRound,
  deleted: Trash2,
  restored: ArchiveRestore,
  download: Download,
};
export default function Activity({ notifications = false }: { notifications?: boolean }) {
  const { data, online, refresh, toast } = useVault();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const [items, setItems] = useState<EventItem[]>([]);
  const [more, setMore] = useState(false);
  const [busy, work] = useState(true);
  const [err, error] = useState('');
  const [unreadOnly, unread] = useState(false);
  const [revision, again] = useState(0);
  const filters = new URLSearchParams({
    kind,
    unread: notifications && unreadOnly ? '1' : '0',
  }).toString();
  useEffect(() => {
    let live = true;
    work(true);
    api<{ events: EventItem[]; more: boolean }>('/events?' + filters)
      .then((r) => {
        if (live) {
          setItems(r.events);
          setMore(r.more);
          error('');
        }
      })
      .catch((e) => {
        if (live) error(errText(e));
      })
      .finally(() => {
        if (live) work(false);
      });
    return () => {
      live = false;
    };
  }, [filters, revision, data.events[0]?.id, data.unread]);
  const load = async () => {
    work(true);
    try {
      const r = await api<{ events: EventItem[]; more: boolean }>(
        `/events?${filters}&before=${items.at(-1)?.id}`,
      );
      setItems([...items, ...r.events]);
      setMore(r.more);
    } catch (e) {
      error(errText(e));
    } finally {
      work(false);
    }
  };
  const mark = async () => {
    try {
      await api('/events/read', 'POST');
      await refresh();
      again((n) => n + 1);
      toast('All notifications marked as read.');
    } catch (e) {
      error(errText(e));
    }
  };
  const rows = items.filter((e) => !notifications || !unreadOnly || !e.seen);
  return (
    <>
      <Title
        eyebrow={notifications ? 'INBOX' : 'WORKSPACE TELEMETRY'}
        title={notifications ? 'Notifications' : 'Activity log'}
        description={
          notifications
            ? 'Updates about your repositories and account.'
            : 'A chronological record of changes in your workspace.'
        }
        action={
          notifications ? (
            <Button Icon={CheckCheck} disabled={!data.unread} onClick={mark}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      <div className="activity-toolbar">
        {notifications ? (
          <div className="segmented">
            <button className={!unreadOnly ? 'active' : ''} onClick={() => unread(false)}>
              All updates
            </button>
            <button className={unreadOnly ? 'active' : ''} onClick={() => unread(true)}>
              Unread · {data.unread}
            </button>
          </div>
        ) : (
          <div className="inline">
            <span className="muted">Event type</span>
            <select
              aria-label="Filter activity"
              value={kind}
              onChange={(e) => setParams(e.target.value ? { kind: e.target.value } : {})}
            >
              <option value="">All events</option>
              {Object.entries(tags).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="live-badge">
          <i />
          {online ? 'Live' : 'Paused'}
        </span>
      </div>
      <ErrorBox error={err} />
      {busy && !items.length ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          Icon={notifications ? Bell : Pulse}
          title={notifications ? 'You’re all caught up' : 'No matching events'}
          detail="New workspace activity will appear here."
        />
      ) : (
        <div className="panel event-list">
          {rows.map((e) => {
            const Icon = icons[e.kind] || Pulse;
            const link = data.repos.some((r) => r.id === e.repo)
              ? '/r/' + e.repo
              : e.kind === 'deleted'
                ? '/trash'
                : null;
            return (
              <div className={'event-row ' + (notifications && !e.seen ? 'unread' : '')} key={e.id}>
                <span
                  className={
                    'event-icon tint-' +
                    (e.kind === 'version' ? 'violet' : e.kind === 'published' ? 'blue' : 'lime')
                  }
                >
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{e.detail}</strong>
                  <p>
                    {link ? (
                      <Link to={link}>
                        {e.subject} <ArrowUpRight size={11} />
                      </Link>
                    ) : (
                      e.subject
                    )}
                  </p>
                </div>
                <div className="event-time">
                  <span>{date(e.created)}</span>
                  <small>{clock(e.created)}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {more && (
        <Button disabled={busy} onClick={load}>
          {busy ? 'Loading…' : 'Load older events'}
        </Button>
      )}
    </>
  );
}
