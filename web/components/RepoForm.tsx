import { Check, Globe2, LockKeyhole, Plus, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, type Repo, type Style } from '../lib';
import { useVault } from '../store';
import { Button, ErrorBox, Modal, StylePicker } from './UI';
export function RepoForm({
  repo,
  close,
  after,
}: {
  repo?: Repo;
  close: () => void;
  after?: () => Promise<void>;
}) {
  const { refresh, toast } = useVault();
  const nav = useNavigate();
  const [name, setName] = useState(repo?.name || '');
  const [desc, setDesc] = useState(repo?.description || '');
  const [vis, setVis] = useState<'public' | 'private'>(repo?.visibility || 'private');
  const [license, setLicense] = useState(repo?.license || 'MIT');
  const [style, setStyle] = useState<Style>(repo?.style || 'violet');
  const [readme, setReadme] = useState(true);
  const [err, error] = useState('');
  const [busy, working] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    working(true);
    error('');
    try {
      const result = await api<{ id: string }>(
        repo ? '/repos/' + repo.id : '/repos',
        repo ? 'PATCH' : 'POST',
        { name, description: desc, visibility: vis, license, style, readme },
      );
      await refresh();
      if (after) await after();
      toast(repo ? 'Repository settings saved.' : 'Repository created.');
      close();
      if (!repo) nav('/r/' + result.id);
    } catch (e) {
      error(errText(e));
    } finally {
      working(false);
    }
  };
  return (
    <Modal
      title={repo ? 'Repository settings' : 'New repository'}
      subtitle={
        repo
          ? 'Manage how your project appears in the vault.'
          : 'Create a home for your code, files, and releases.'
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Repository name <span className="required">*</span>
          <input
            data-autofocus
            required
            value={name}
            maxLength={64}
            pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*"
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-project"
          />
        </label>
        <label>
          Description <small>optional</small>
          <textarea
            value={desc}
            maxLength={420}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this project about?"
            rows={2}
          />
        </label>
        <fieldset>
          <legend>Repository icon</legend>
          <StylePicker value={style} onChange={setStyle} />
        </fieldset>
        <fieldset>
          <legend>Visibility</legend>
          <div className="visibility-choices">
            {(['private', 'public'] as const).map((v) => {
              const Icon = v === 'private' ? LockKeyhole : Globe2;
              return (
                <button
                  key={v}
                  type="button"
                  className={v === vis ? 'selected' : ''}
                  aria-pressed={v === vis}
                  onClick={() => setVis(v)}
                >
                  <div>
                    <Icon size={16} />
                    <strong>{v === 'private' ? 'Private' : 'Public'}</strong>
                    <i>{v === vis && <Check size={9} />}</i>
                  </div>
                  <small>{v === 'private' ? 'Only you have access' : 'Anyone with the link'}</small>
                </button>
              );
            })}
          </div>
          {vis === 'public' && (
            <p className="field-hint">Current files and previous versions will be public.</p>
          )}
        </fieldset>
        <label>
          License
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            {['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0-only', 'Unlicensed'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {!repo && (
          <label className="checkbox">
            <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} />
            Initialize with a README.md
          </label>
        )}
        <ErrorBox error={err} />
        <div className="form-actions">
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" primary Icon={repo ? Save : Plus} disabled={busy}>
            {busy ? 'Saving…' : repo ? 'Save changes' : 'Create repository'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
