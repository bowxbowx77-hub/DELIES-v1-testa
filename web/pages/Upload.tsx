import {
  Archive,
  File,
  FileUp,
  FolderOpen,
  GitBranch,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Upload as Up,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty, ErrorBox, Title } from '../components/UI';
import { bytes, errText, upload } from '../lib';
import { useVault } from '../store';
export default function Upload() {
  const { data, modal, refresh, toast } = useVault();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [rid, repo] = useState(
    data.repos.find((r) => r.id === params.get('repo'))?.id || data.repos[0]?.id || '',
  );
  const [files, setFiles] = useState<File[]>([]);
  const [message, note] = useState('');
  const [err, error] = useState('');
  const [busy, working] = useState(false);
  const [progress, setProgress] = useState(0);
  const [over, drag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null);
  const selected = data.repos.find((r) => r.id === rid);
  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);
  const add = (list: File[]) => {
    error('');
    const map = new Map(files.map((f) => [f.webkitRelativePath || f.name, f]));
    list.forEach((f) => map.set(f.webkitRelativePath || f.name, f));
    const next = [...map.values()];
    if (next.length > 2000 || next.reduce((s, f) => s + f.size, 0) > 128 * 1024 ** 2)
      return error('Select up to 2,000 files and 128 MB per upload.');
    if (next.some((f) => !f.name.toLowerCase().endsWith('.zip') && f.size > 32 * 1024 ** 2))
      return error('Individual files must not exceed 32 MB.');
    setFiles(next);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !files.length) return;
    working(true);
    setProgress(0);
    error('');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f, f.name));
    fd.set('paths', JSON.stringify(files.map((f) => f.webkitRelativePath || f.name)));
    fd.set('message', message);
    fd.set('base', String(selected.version));
    try {
      const r = await upload(rid, fd, setProgress);
      await refresh();
      toast(`${r.files} ${r.files === 1 ? 'file' : 'files'} saved in version ${r.number}.`);
      nav('/r/' + rid);
    } catch (e) {
      error(errText(e));
      await refresh().catch(() => {});
    } finally {
      working(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="FILE INTAKE"
        title="Upload files"
        description="Add source files or import a ZIP archive as a new repository version."
      />
      {!data.repos.length ? (
        <Empty
          title="Create a repository first"
          detail="Your uploads need a repository to call home."
        >
          <Button primary Icon={Plus} onClick={() => modal('create')}>
            New repository
          </Button>
        </Empty>
      ) : (
        <div className="content-split">
          <form className="panel padded form-stack" onSubmit={submit}>
            <label>
              Destination repository
              <select required value={rid} disabled={busy} onChange={(e) => repo(e.target.value)}>
                {data.repos.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name} · {r.visibility}
                  </option>
                ))}
              </select>
            </label>
            <div
              className={'dropzone ' + (over ? 'over' : '')}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) drag(true);
              }}
              onDragLeave={() => drag(false)}
              onDrop={(e) => {
                e.preventDefault();
                drag(false);
                if (busy) return;
                if ([...e.dataTransfer.items].some((i) => i.webkitGetAsEntry?.()?.isDirectory))
                  return error('Choose “Select folder” to preserve a directory tree.');
                add([...e.dataTransfer.files]);
              }}
            >
              <span className="upload-glyph">
                <UploadCloud size={31} />
              </span>
              <h3>Drop your project files here</h3>
              <p>ZIP archives, individual files, or a whole folder.</p>
              <div className="inline">
                <Button Icon={FileUp} onClick={() => fileInput.current?.click()} disabled={busy}>
                  Choose files
                </Button>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => folderInput.current?.click()}
                  disabled={busy}
                >
                  Select folder
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  add([...(e.target.files || [])]);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  add([...(e.target.files || [])]);
                  e.target.value = '';
                }}
              />
            </div>
            {files.length > 0 && (
              <div className="selection-list">
                <div className="overline">
                  {files.length} SELECTED · {bytes(files.reduce((n, f) => n + f.size, 0))}
                </div>
                {files.map((f, i) => (
                  <div key={f.webkitRelativePath || f.name}>
                    <File size={14} />
                    <span>{f.webkitRelativePath || f.name}</span>
                    <small>{bytes(f.size)}</small>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={'Remove ' + f.name}
                      disabled={busy}
                      onClick={() => setFiles(files.filter((_, j) => i !== j))}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label>
              Version note <small>optional</small>
              <textarea
                rows={3}
                disabled={busy}
                placeholder="Describe what changed in this version…"
                maxLength={240}
                value={message}
                onChange={(e) => note(e.target.value)}
              />
            </label>
            <ErrorBox error={err} />
            {busy && (
              <div className="upload-progress">
                <progress max="100" value={progress} />
                <small>
                  {progress === 100
                    ? 'Validating files and saving snapshot…'
                    : `${progress}% uploaded`}
                </small>
              </div>
            )}
            <div className="form-actions">
              <Button onClick={() => nav('/repositories')} disabled={busy}>
                Cancel
              </Button>
              <Button primary type="submit" Icon={Up} disabled={!selected || !files.length || busy}>
                {busy ? 'Uploading…' : 'Upload files'}
              </Button>
            </div>
          </form>
          <aside>
            <div className="panel padded help-card">
              <div className="mini-title">
                <ShieldCheck size={18} />
                <h3>Upload guidelines</h3>
              </div>
              {[
                [
                  Archive,
                  'Archive support',
                  'ZIP archives are unpacked safely. Nested archives are not supported.',
                ],
                [
                  FolderOpen,
                  'Project limits',
                  'Up to 2,000 files, 32 MB per file, and 128 MB per version.',
                ],
                [
                  GitBranch,
                  'Versioned by default',
                  'Matching paths are replaced in a new snapshot. Previous versions stay available.',
                ],
                [
                  LockKeyhole,
                  'Source files only',
                  'Executables, private keys, and unsafe paths are rejected. Uploaded code is never run.',
                ],
              ].map(([Ic, title, desc]) => {
                const I = Ic as typeof Archive;
                return (
                  <div className="guide-row" key={String(title)}>
                    <I size={16} />
                    <div>
                      <strong>{String(title)}</strong>
                      <p>{String(desc)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
