export type Style = 'violet' | 'lime' | 'blue' | 'amber' | 'rose' | 'cyan';
export type User = {
  id: string;
  name: string;
  email: string | null;
  guest: boolean;
  created: number;
  color: Style;
};
export type Repo = {
  id: string;
  owner: string;
  author: string;
  name: string;
  description: string;
  visibility: 'private' | 'public';
  license: string;
  style: Style;
  created: number;
  updated: number;
  deleted: number | null;
  views: number;
  downloads: number;
  starter: number;
  version: number;
  files: number;
  size: number;
  language: string;
};
export type EventItem = {
  id: number;
  repo: string | null;
  subject: string;
  kind: string;
  detail: string;
  created: number;
  seen: number;
};
export type Workspace = {
  user: User;
  repos: Repo[];
  events: EventItem[];
  storage: number;
  quota: number;
  trash: number;
  unread: number;
};
export type Version = { number: number; created: number; message: string };
export type VaultFile = { path: string; size: number };
export type Detail = {
  repo: Repo;
  owner: boolean;
  versions: Version[];
  files: VaultFile[];
  selected: number;
};
export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-DevVault-Request': 'workspace',
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const json = await res
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
export const errText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';
export function bytes(n: number, precision = 1) {
  if (n === 0) return '0 B';
  const i = Math.max(0, Math.min(3, Math.floor(Math.log(n) / Math.log(1024))));
  return `${parseFloat((n / 1024 ** i).toFixed(i ? precision : 0))} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
export function age(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
export const date = (t: number) =>
  new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
export const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export const languages: Record<string, string> = {
  TypeScript: '#819df7',
  Python: '#e4c46c',
  JavaScript: '#ead875',
  Shell: '#9acb8a',
  Markdown: '#c29be7',
  CSS: '#ad9bea',
  HTML: '#ec9d73',
  Rust: '#ce927c',
  Go: '#70cfd3',
  JSON: '#acbb90',
};
export const tags: Record<string, string> = {
  created: 'repo.create',
  published: 'repo.publish',
  upload: 'files.upload',
  version: 'version.save',
  workspace: 'workspace.init',
  updated: 'repo.update',
  account: 'account.update',
  deleted: 'repo.delete',
  restored: 'repo.restore',
  download: 'repo.download',
};
export function upload(rid: string, form: FormData, onProgress: (n: number) => void) {
  return new Promise<{ number: number; files: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/repos/' + rid + '/upload');
    xhr.setRequestHeader('X-DevVault-Request', 'workspace');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let r;
      try {
        r = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Invalid response from the upload server.'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(r.error || 'Upload failed.'));
      else resolve(r);
    };
    xhr.onerror = () => reject(new Error('Connection lost. Your previous version is unchanged.'));
    xhr.send(form);
  });
}
