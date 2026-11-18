import { test, expect } from '@playwright/test';

test('register, upload, publish, export, restore and sign back in', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Workspace overview/ })).toBeVisible();
  await page.locator('.side-identity').getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('Browser developer');
  await page.getByLabel('Email address').fill('browser@example.org');
  await page.getByLabel('Password', { exact: true }).fill('long-passphrase-123');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'New repository', exact: true }).click();
  await page.getByLabel('Repository name').fill('end-to-end');
  await page.getByLabel('Description').fill('A real browser upload');
  await page.getByRole('button', { name: 'Create repository', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'end-to-end' })).toBeVisible();
  const url = page.url();
  const apiURL = new URL(url).pathname.replace('/r/', '/api/repos/');
  const visitor = await browser.newContext();
  expect((await visitor.request.get('http://127.0.0.1:4177' + apiURL)).status()).toBe(404);
  await page.locator('main').getByRole('link', { name: 'Upload files' }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'index.ts',
      mimeType: 'text/plain',
      buffer: Buffer.from('export const value = 42;'),
    });
  await page.getByLabel('Version note').fill('Add initial module');
  await page.getByRole('button', { name: 'Upload files', exact: true }).click();
  await page.locator('.file-line').filter({ hasText: 'index.ts' }).click();
  await expect(page.locator('pre')).toHaveText('export const value = 42;');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Repository settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'Public Anyone with the link' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const shared = await visitor.newPage();
  await shared.goto(url);
  await expect(shared.getByRole('heading', { name: 'end-to-end' })).toBeVisible();
  await expect(
    shared.getByRole('button', { name: 'Repository settings', exact: true }),
  ).toHaveCount(0);
  expect((await visitor.cookies()).filter((c) => c.name === 'dv_session')).toHaveLength(0);
  const event = shared.waitForEvent('download');
  await shared.getByRole('button', { name: 'Download ZIP' }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('end-to-end-v2.zip');
  expect(await download.failure()).toBe(null);
  await visitor.close();
  await page.getByRole('button', { name: /Version history/ }).click();
  const previous = page.locator('.history-entry').filter({ hasText: 'Version 1' });
  await previous.getByRole('button', { name: 'View files' }).click();
  await expect(page.locator('.file-line').filter({ hasText: 'index.ts' })).toHaveCount(0);
  await page.getByRole('button', { name: /Version history/ }).click();
  await previous.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore version' }).click();
  await expect(page.locator('.history-entry').first()).toContainText('Version 3');
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await page.locator('.trash-row').getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Trash is empty' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search repositories').fill('end-to-end');
  await page.getByLabel('Search repositories').press('Enter');
  await expect(page.getByRole('heading', { name: 'end-to-end' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Workspace overview/ })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email address').fill('browser@example.org');
  await page.getByLabel('Password', { exact: true }).fill('long-passphrase-123');
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto(url);
  await expect(
    page.getByRole('button', { name: 'Repository settings', exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile navigation, notification state, folders and empty search results', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Workspace overview/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page
    .getByRole('link', { name: /My repositories/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'My repositories' })).toBeVisible();
  await page.getByLabel('Filter repositories').fill('none-match-here');
  await expect(page.getByRole('heading', { name: 'No matching repositories' })).toBeVisible();
  await page.getByLabel('Filter repositories').fill('orbit');
  await page.locator('.repo-row').first().click();
  await page.locator('.file-line.is-dir').filter({ hasText: 'src' }).click();
  await page.locator('.file-line').filter({ hasText: 'button.ts' }).click();
  await expect(page.locator('pre')).toContainText('export function button');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Notifications,/ }).click();
  await page.getByRole('link', { name: 'Open notifications' }).click();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  await page.getByRole('button', { name: 'Unread · 0' }).click();
  await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
});
