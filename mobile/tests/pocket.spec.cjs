const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const zip = (name, body) =>
  execFileSync('python3', [
    '-c',
    "import io,sys,zipfile;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr(sys.argv[1],sys.argv[2]);z.close();sys.stdout.buffer.write(b.getvalue())",
    name,
    body,
  ]);
function ui(page) {
  return {
    act: (name, val) =>
      page
        .locator(`[data-act="${name}"]${val === undefined ? '' : `[data-val="${val}"]`}`)
        .first()
        .click(),
    submit: (name) => page.locator(`form[data-form="${name}"] button[type="submit"]`).click(),
    field: (form, name, value) =>
      page.locator(`form[data-form="${form}"] [name="${name}"]`).fill(value),
  };
}
async function create(page, name) {
  let { act, submit, field } = ui(page);
  await act('nav:home');
  await act('nav:new');
  await field('new', 'name', name);
  await submit('new');
  await expect(page.locator('h1')).toHaveText(name);
}
async function addZip(page, name, bytes) {
  let { act, submit } = ui(page);
  await act('nav:add');
  await page
    .locator('[name="files"]')
    .setInputFiles({ name, mimeType: 'application/zip', buffer: bytes });
  await submit('add');
}
async function download(page, action) {
  const wait = page.waitForEvent('download');
  await ui(page).act(action);
  const d = await wait;
  return readFile(await d.path());
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/pocket/');
  await expect(page.locator('h1')).toHaveText('Моє сховище.');
});
test('offline project: ZIP, safe preview, edit, rollback, restart, backup, restore and purge', async ({
  page,
  context,
}) => {
  const { act, submit, field } = ui(page);
  let outbound = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) outbound.push(r.url());
  });
  await context.setOffline(true);
  await create(page, 'offline-vault');
  await addZip(page, 'project.zip', zip('src/main.rb', 'puts "<svg>"'));
  await expect(page.locator('.files')).toContainText('src/main.rb');
  await act('file', '0');
  await expect(page.locator('pre')).toHaveText('puts "<svg>"');
  await field('write-text', 'content', 'version three');
  await submit('write-text');
  await expect(page.locator('.meta')).toContainText('v3');
  await act('nav:history');
  await act('restore-v', '2');
  await expect(page.locator('.panel').first()).toContainText('v4');
  await act('version', '4');
  await act('file', '0');
  await expect(page.locator('pre')).toHaveText('puts "<svg>"');
  await field('rename-file', 'path', 'lib/entry.rb');
  await submit('rename-file');
  await expect(page.locator('.files')).toContainText('lib/entry.rb');
  const binary = await download(page, 'export');
  expect(binary.subarray(0, 4).toString('hex')).toBe('504b0304');
  const backup = await download(page, 'backup-out');
  await act('trash');
  await act('untrash');
  await expect(page.locator('h1')).toHaveText('offline-vault');
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.files')).toContainText('lib/entry.rb');
  await act('nav:home');
  await act('nav:backup-in');
  await field('backup-in', 'name', 'restored-vault');
  await page
    .locator('[name="backup"]')
    .setInputFiles({ name: 'copy.dvault', mimeType: 'application/octet-stream', buffer: backup });
  await submit('backup-in');
  await expect(page.locator('h1')).toHaveText('restored-vault');
  await expect(page.locator('.meta')).toContainText('v5');
  await act('trash');
  await act('nav:purge');
  await field('purge', 'name', 'restored-vault');
  await submit('purge');
  await expect(page.locator('main')).toContainText('Кошик порожній');
  await act('nav:home');
  await page.locator('[data-key^="offline-vault"]').click();
  await act('file', '0');
  await expect(page.locator('pre')).toHaveText('puts "<svg>"');
  expect(outbound).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('unsafe selection fails atomically; safe files and editor stay functional', async ({
  page,
}) => {
  const { act, submit, field } = ui(page);
  await create(page, 'screening');
  await act('nav:add');
  await page.locator('[name="files"]').setInputFiles([
    { name: 'safe.txt', mimeType: 'text/plain', buffer: Buffer.from('test') },
    { name: '.env', mimeType: 'text/plain', buffer: Buffer.from('synthetic QA') },
  ]);
  await submit('add');
  await expect(page.locator('#notice')).toHaveClass(/error/);
  await act('nav:project');
  await expect(page.locator('.meta')).toContainText('v1');
  await expect(page.locator('.files')).not.toContainText('safe.txt');
  await act('nav:add');
  await field('write-new', 'path', 'docs/notes.md');
  await field('write-new', 'content', 'saved offline');
  await submit('write-new');
  await act('file', '0');
  await expect(page.locator('pre')).toHaveText('saved offline');
  await act('remove-file');
  await expect(page.locator('.files')).toContainText('Порожній знімок');
});
test('explicit HTTPS account, private-first publication, anonymous public ZIP, local pull', async ({
  page,
  request,
}) => {
  const { act, submit, field } = ui(page);
  await create(page, 'source-pocket');
  await addZip(page, 'docs.zip', zip('docs/note.md', 'from device'));
  await expect(page.locator('.files')).toContainText('docs/note.md');
  await act('nav:server');
  await field('connect', 'origin', 'https://127.0.0.1:4186');
  await submit('connect');
  await act('register');
  await field('register', 'name', 'Pocket Author');
  const email = `pocket-${Date.now()}@example.test`;
  await field('register', 'email', email);
  await field('register', 'password', 'testing mobile release');
  await submit('register');
  await expect(page.locator('main')).toContainText('Pocket Author');
  await act('nav:home');
  await page.locator('[data-key^="source-pocket"]').click();
  await act('nav:publish');
  await field('publish', 'name', 'server-pocket');
  await page.selectOption('[name="visibility"]', 'public');
  await submit('publish');
  await expect(page.locator('h1')).toHaveText('server-pocket');
  const id = new URL(page.url()).hash.split('/')[1];
  const detail = await (await request.get(`/api/repos/${id}`)).json();
  expect(detail.owner).toBe(false);
  expect(detail.repo.visibility).toBe('public');
  expect(detail.files.map((f) => f.path)).toEqual(['docs/note.md']);
  await act('remote-file', '0');
  await expect(page.locator('pre')).toHaveText('from device');
  await act('remote-version');
  await act('pull');
  await expect(page.locator('.meta')).toContainText('Локальний');
  await act('file', '0');
  await expect(page.locator('pre')).toHaveText('from device');
  await act('nav:server');
  await act('logout');
  await act('cloud-public');
  await page.locator(`[data-act="remote"][data-val="${id}"]`).click();
  await expect(page.locator('main')).toContainText('Pocket Author');
  await expect(page.locator('[data-act="remote-web"]')).toHaveCount(0);
});
