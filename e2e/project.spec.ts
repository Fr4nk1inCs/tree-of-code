import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addRoot(page: Page) {
  await page.getByRole('button', { name: 'Add root' }).first().click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
}

function activeCard(page: Page) {
  return page.locator('.react-flow__node').filter({ has: page.locator('.monaco-editor') });
}

async function replaceMonacoText(page: Page, label: string, text: string) {
  const editor = page.getByRole('textbox', { name: label, exact: true });
  await expect(editor).toBeVisible({ timeout: 15000 });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
}

async function applySchema(page: Page, schema: unknown) {
  await page.getByRole('button', { name: 'Schema', exact: true }).click();
  await replaceMonacoText(page, 'Raw JSON Schema', JSON.stringify(schema));
  await page.getByRole('button', { name: 'Apply schema' }).click();
}

async function editAnnotations(page: Page, annotations: unknown) {
  await activeCard(page).getByRole('button', { name: 'Edit annotation JSON' }).click();
  await replaceMonacoText(page, 'Annotation JSON', JSON.stringify(annotations));
  await page.getByRole('button', { name: 'Apply annotations' }).click();
}

test('derives the UI from a persistent Monaco theme and edits nested arrays at full height', async ({ page }) => {
  await page.goto('/');
  await addRoot(page);

  await page.getByRole('combobox', { name: 'Theme' }).click();
  await page.getByRole('option', { name: 'Light', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Light');
  const canvasColor = await page.locator('.react-flow').evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expect(page.locator('.monaco-editor')).toHaveCSS('background-color', canvasColor);
  const editorTextColor = await page.locator('.monaco-editor').evaluate(
    (element) => getComputedStyle(element).color,
  );
  await expect(page.getByText('Tree of Code', { exact: true })).toHaveCSS('color', editorTextColor);

  await page.reload();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveText('Light');

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title' },
      details: {
        type: 'object',
        title: 'Details',
        description: 'Do not show this field description.',
        properties: { note: { type: 'string', title: 'Note' } },
        additionalProperties: false,
      },
      tags: {
        type: 'array',
        title: 'Tags',
        items: { type: 'string', title: 'Tag' },
      },
    },
    additionalProperties: false,
  };
  await applySchema(page, schema);
  await editAnnotations(page, { details: { note: 'Nested note' }, tags: ['python'] });
  await expect(activeCard(page).getByText('Nested note', { exact: true })).toBeVisible();
  await expect(page.getByText('Do not show this field description.')).toHaveCount(0);
  await expect(page.getByText('Appended fragment', { exact: false })).toHaveCount(0);
  await expect(activeCard(page).getByText('Python', { exact: true })).toHaveCount(0);

  await activeCard(page).getByRole('button', { name: 'Collapse Tags' }).click();
  await expect(activeCard(page).getByText('python', { exact: true })).toHaveCount(0);
  await activeCard(page).getByRole('button', { name: 'Expand Tags' }).click();
  await expect(activeCard(page).getByText('python', { exact: true })).toBeVisible();

  const initialHeight = await activeCard(page).evaluate((element) => element.getBoundingClientRect().height);
  await editAnnotations(page, {
    details: { note: 'Nested note' },
    tags: ['python', 'tree', 'a much longer annotation value', 'another long annotation value', 'third long annotation value'],
  });
  await expect.poll(() => activeCard(page).evaluate(
    (element) => element.getBoundingClientRect().height,
  )).toBeGreaterThan(initialHeight);
  const hasInnerOverflow = await activeCard(page).locator('[data-annotation-content]').evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  );
  expect(hasInnerOverflow).toBe(false);
});

test('create, annotate, save, open, and recover a project', async ({ page }) => {
  await page.goto('/');
  await addRoot(page);
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.type('def root():\nreturn 42');
  await activeCard(page).getByLabel('Fragment title', { exact: true }).fill('Root');
  await editAnnotations(page, { title: 'Root annotation' });

  await activeCard(page).getByRole('button', { name: 'Add child' }).click();
  await expect(page.locator('.monaco-editor')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.type('print(root())');
  await activeCard(page).getByLabel('Fragment title', { exact: true }).fill('Child');

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title' },
      reviewed: { type: 'boolean', title: 'Reviewed', default: false },
    },
    additionalProperties: false,
  };
  await applySchema(page, schema);
  await expect(activeCard(page).getByRole('rowheader', { name: 'Reviewed' })).toBeVisible();

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Replace the current project?');
  await page.getByRole('button', { name: 'Cancel' }).click();

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  const saved = JSON.parse(await readFile(path!, 'utf8'));
  expect(saved.formatVersion).toBe(1);
  expect(saved.rootIds).toHaveLength(1);
  expect(Object.values(saved.nodes).map((node) => (node as { title: string }).title).sort())
    .toEqual(['Child', 'Root']);
  const savedRoot = Object.values(saved.nodes).find(
    (node) => (node as { title: string }).title === 'Root',
  ) as { annotations: { title: string } };
  expect(savedRoot.annotations.title).toBe('Root annotation');
  expect(saved.schema.properties.reviewed.type).toBe('boolean');
  expect(Object.values(saved.nodes).map((node) => (node as { fragment: string }).fragment).sort())
    .toEqual(['def root():\n    return 42', 'print(root())']);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByText('Start a forest')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByLabel('Fragment title', { exact: true }).nth(0)).toHaveValue('Root');
  await expect(page.getByLabel('Fragment title', { exact: true }).nth(1)).toHaveValue('Child');
  await expect(page.locator('.monaco-editor')).toHaveCount(1);

  await expect(page.getByText(/Draft saved ·/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Fragment title', { exact: true }).nth(0)).toHaveValue('Root', { timeout: 15000 });
  await expect(page.getByLabel('Fragment title', { exact: true }).nth(1)).toHaveValue('Child');
});

test('keeps a 300-node project viewport-culled with one active editor', async ({ page }) => {
  const nodes: Record<string, unknown> = {};
  const rootIds: string[] = [];
  for (let root = 0; root < 10; root += 1) {
    const rootId = `node-${root * 30}`;
    rootIds.push(rootId);
    for (let offset = 0; offset < 30; offset += 1) {
      const index = root * 30 + offset;
      const id = `node-${index}`;
      nodes[id] = {
        id,
        parentId: offset === 0 ? null : `node-${index - 1}`,
        childIds: offset === 29 ? [] : [`node-${index + 1}`],
        fragment: `def step_${index}():\n    value = ${index}\n    return value\n`,
        annotations: { title: `Node ${index}` },
      };
    }
  }
  const project = {
    format: 'tree-of-code',
    formatVersion: 1,
    language: 'python',
    schema: {
      type: 'object',
      properties: { title: { type: 'string', title: 'Title' } },
      additionalProperties: false,
    },
    rootIds,
    nodes,
  };

  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'scale.project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Fragment title', { exact: true }).first()).toHaveValue('Node 0');
  const renderedNodes = await page.locator('.react-flow__node').count();
  expect(renderedNodes).toBeGreaterThan(0);
  expect(renderedNodes).toBeLessThan(30);
  await expect(page.locator('.monaco-editor')).toHaveCount(1);
});

test('split at the cursor, reparent, and delete through node controls', async ({ page }) => {
  await page.goto('/');
  await addRoot(page);
  await activeCard(page).getByLabel('Fragment title', { exact: true }).fill('Root');
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.type('abcdef');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await activeCard(page).getByRole('button', { name: 'Node actions' }).click();
  await page.getByRole('menuitem', { name: 'Split at cursor' }).click();
  await expect(page.getByLabel('Python code preview')).toHaveText('abc');
  await expect(page.locator('.view-lines')).toContainText('def');
  await expect(page.locator('.monaco-editor')).toHaveCount(1);

  await activeCard(page).getByRole('button', { name: 'Add child' }).click();
  await activeCard(page).getByLabel('Fragment title', { exact: true }).fill('Leaf');
  await activeCard(page).getByRole('button', { name: 'Node actions' }).click();
  await page.getByRole('menuitem', { name: 'Reparent…' }).click();
  await page.getByRole('combobox', { name: 'New parent' }).click();
  await page.getByRole('option', { name: 'Root', exact: true }).click();
  await page.getByRole('button', { name: 'Reparent', exact: true }).click();

  await activeCard(page).getByRole('button', { name: 'Node actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete subtree' }).click();
  await expect(page.getByRole('dialog')).toContainText('Delete this subtree?');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});

test('allows mouse text selection in Monaco without panning the canvas', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await addRoot(page);
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.type('abcdef');
  const line = page.locator('.view-line').filter({ hasText: 'abcdef' });
  const box = await line.boundingBox();
  const viewport = page.locator('.react-flow__viewport');
  const transform = await viewport.getAttribute('style');

  await page.mouse.move(box!.x + 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();

  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('abcdef');
  await expect(viewport).toHaveAttribute('style', transform!);
});

test('scrolls an inactive code preview without zooming the canvas', async ({ page }) => {
  const childCode = Array.from({ length: 30 }, (_, index) => `value_${index} = ${index}`).join('\n');
  const project = {
    format: 'tree-of-code',
    formatVersion: 1,
    language: 'python',
    schema: {
      type: 'object',
      properties: { title: { type: 'string', title: 'Title' } },
      additionalProperties: false,
    },
    rootIds: ['root'],
    nodes: {
      root: {
        id: 'root', parentId: null, childIds: ['child'], title: 'Root', fragment: 'root = True', annotations: {},
      },
      child: {
        id: 'child', parentId: 'root', childIds: [], title: 'Child', fragment: childCode, annotations: {},
      },
    },
  };
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'scroll.project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const preview = page.getByLabel('Python code preview');
  await expect(preview).toBeVisible({ timeout: 15000 });
  expect(await preview.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const viewport = page.locator('.react-flow__viewport');
  const transform = await viewport.getAttribute('style');

  await preview.hover();
  await page.mouse.wheel(0, 180);

  await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(viewport).toHaveAttribute('style', transform!);
  await expect(page.locator('.monaco-editor')).toHaveCount(1);
});

test('edits array objects as tables with inline scalar-array cells', async ({ page }) => {
  await page.goto('/');
  await addRoot(page);
  const schema = {
    type: 'object',
    properties: {
      usage: {
        type: 'array',
        title: 'usage',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', title: 'file' },
            turns: { type: 'array', title: 'turns', items: { type: 'integer' } },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
  await applySchema(page, schema);

  await editAnnotations(page, { usage: [{ file: 'a.py', turns: [1, 2] }] });

  const table = activeCard(page).getByRole('table', { name: 'usage table' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('columnheader', { name: 'file' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'turns' })).toBeVisible();
  const objectRow = table.getByRole('row').nth(1);
  await expect(objectRow.getByRole('rowheader')).toHaveText('1');
  await expect(objectRow.getByText('a.py', { exact: true })).toBeVisible();
  await expect(objectRow.getByLabel('turns values')).toHaveText('12');
  await expect(objectRow.getByRole('button', { name: /Add/ })).toHaveCount(0);
  await expect(objectRow.locator('td').first()).toHaveCSS('vertical-align', 'middle');
  const fileBox = await objectRow.getByText('a.py', { exact: true }).boundingBox();
  const turnsBox = await objectRow.getByLabel('turns values').boundingBox();
  const fileCenter = fileBox!.y + fileBox!.height / 2;
  const turnsCenter = turnsBox!.y + turnsBox!.height / 2;
  expect(Math.abs(fileCenter - turnsCenter)).toBeLessThanOrEqual(1);

  await activeCard(page).getByRole('button', { name: 'Edit annotation JSON' }).click();
  await replaceMonacoText(page, 'Annotation JSON', '{bad');
  await page.getByRole('button', { name: 'Apply annotations' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await replaceMonacoText(page, 'Annotation JSON', JSON.stringify({ usage: [{ turns: ['wrong'] }] }));
  await page.getByRole('button', { name: 'Apply annotations' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(objectRow.getByText('a.py', { exact: true })).toBeVisible();

  await expect(page.getByText(/Draft saved ·/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
  const recoveredTable = activeCard(page).getByRole('table', { name: 'usage table' });
  await expect(recoveredTable.getByRole('row')).toHaveCount(2);
  await expect(recoveredTable.getByText('a.py', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await activeCard(page).getByRole('button', { name: 'Collapse annotation' }).evaluate(
    (element) => (element as HTMLElement).click(),
  );
  await activeCard(page).getByRole('button', { name: 'Expand annotation' }).evaluate(
    (element) => (element as HTMLElement).click(),
  );
  await expect.poll(() => activeCard(page).evaluate((node) => {
    const editor = node.querySelector('.monaco-editor');
    const annotation = node.querySelector('[data-annotation-content]');
    if (!editor || !annotation) return Number.NaN;
    const expected = 48 + editor.clientHeight + 34 + annotation.clientHeight;
    return Math.abs(node.clientHeight - expected);
  })).toBeLessThanOrEqual(1);
});
