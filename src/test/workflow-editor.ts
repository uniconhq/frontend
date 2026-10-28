import { waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { DRAFT_FILE } from '@/features/organise/workflows/words';

/**
 * Finding things on the workflow editor's page, each inside the part of the
 * page it belongs to: the bar, its tools, a box, a drawer, a menu. Each
 * part is found by its element and its name, by a selector: a query by label
 * over the whole page has jsdom work out every field's labels again after
 * each change, which on a graph of boxes and ports cost these tests most of
 * their time. Inside its part, a query by role or label finds the same thing
 * at once.
 */

/** The part of the page that is a `selector` named `name`, or null. */
function partOrNull(selector: string, name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `${selector}[aria-label="${CSS.escape(name)}"]`,
  );
}

/** The part of the page that is a `selector` named `name`. */
export function part(selector: string, name: string): HTMLElement {
  const found = partOrNull(selector, name);
  if (found === null) throw new Error(`There is no ${selector} named ${name}.`);
  return found;
}

/** The part of the page that is a `selector` named `name`, once it is drawn. */
export function findPart(
  selector: string,
  name: string,
  options: { timeout?: number } = {},
): Promise<HTMLElement> {
  return waitFor(() => part(selector, name), options);
}

/** The editor's page for kenny/tuned, the workflow `workflowBackend` serves. */
export const EDITOR_PAGE = '/workflows/kenny/tuned';

/** A button on the bar, which holds Save, Publish version, Share and View YAML. */
export function barButton(name: string): HTMLElement {
  return within(part('[role="toolbar"]', 'The workflow')).getByRole('button', { name });
}

/** A button of the graph's tools on the bar, which hold Undo, Redo and Files. */
export function toolButton(name: string): HTMLElement {
  return within(part('[role="group"]', 'Editing')).getByRole('button', { name });
}

/** The drawer of every file of the workflow, opened from the bar. */
export async function openFiles(user: UserEvent): Promise<HTMLElement> {
  await user.click(await waitFor(() => toolButton('Files')));
  return findPart('section', 'Files');
}

/**
 * The draft's file as a save would write it, read where a person reads it:
 * "View YAML" on the bar, a dialog closed again with Escape.
 */
export async function fileText(user: UserEvent): Promise<string> {
  await user.click(barButton('View YAML'));
  const dialog = await waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="dialog"]');
    if (found === null) throw new Error('No dialog is open.');
    return found;
  });
  const text = within(dialog).getByLabelText<HTMLTextAreaElement>(DRAFT_FILE, {
    selector: 'textarea',
  }).value;
  await user.keyboard('{Escape}');
  return text;
}

/** The step's box on the graph, once it is drawn. */
export function stepBox(id: string): Promise<HTMLElement> {
  return findPart('[role="group"]', `Step ${id}`);
}

/**
 * A step's box, opened as a person opens it, by its head: a closed box shows
 * its head and a line, and its ports only once it is selected.
 */
async function openBox(
  user: UserEvent,
  name: string,
  head: string,
): Promise<HTMLElement> {
  const box = await findPart('[role="group"]', name);
  if (!box.hasAttribute('data-open'))
    await user.click(within(box).getByRole('button', { name: new RegExp(`^${head}`) }));
  return waitFor(() => {
    const open = part('[role="group"]', name);
    if (!open.hasAttribute('data-open'))
      throw new Error(`The box ${name} is not open.`);
    return open;
  });
}

/** A button of the tray over the graph, in its group: Inputs, Primitives or Workflows. */
export function trayButton(group: string, name: string | RegExp): HTMLElement {
  return within(part('section', group)).getByRole('button', { name });
}

/** An input's box opened by its head, which opens that input's drawer. */
export function openInput(user: UserEvent, id: string): Promise<HTMLElement> {
  return openBox(user, `Input ${id}`, id);
}

/** The outputs' box, always open, with its head clicked to open the outputs' drawer. */
export async function openOutputs(user: UserEvent): Promise<HTMLElement> {
  const box = await findPart('[role="group"]', 'Outputs');
  if (partOrNull('aside', 'Outputs') === null)
    await user.click(within(box).getByRole('button', { name: /^Outputs/ }));
  return box;
}

/** The button of a step's input port, whose menu wires it, its box opened first. */
export async function portButton(
  user: UserEvent,
  step: string,
  port: string,
): Promise<HTMLElement> {
  return within(await openBox(user, `Step ${step}`, step)).getByRole('button', {
    name: `The port ${port} of ${step}`,
  });
}

/** The button of a step's output, whose menu wires it onward or reports it, its box opened first. */
export async function outputButton(
  user: UserEvent,
  step: string,
  output: string,
): Promise<HTMLElement> {
  return within(await openBox(user, `Step ${step}`, step)).getByRole('button', {
    name: `The output ${output} of ${step}`,
  });
}

/** The button of one of the workflow's outputs, whose menu changes what it reads, the outputs' box opened first. */
export async function entryButton(user: UserEvent, name: string): Promise<HTMLElement> {
  return within(await openOutputs(user)).getByRole('button', {
    name: `The output ${name}`,
  });
}

/** A menu open, by its name. */
export function openMenu(name: string): Promise<HTMLElement> {
  return findPart('[role="menu"]', name);
}

/** The drawer open, by its title. */
export function drawer(title: string): HTMLElement {
  return part('aside', title);
}

/** No drawer is open. */
export function noDrawer(): boolean {
  return document.querySelector('aside') === null;
}

/** The step's part of its open drawer. */
export function stepPanel(id: string): HTMLElement {
  const step = drawer(`Step ${id}`).querySelector<HTMLElement>(
    `section[aria-label="${CSS.escape(`The step ${id}`)}"]`,
  );
  if (step === null) throw new Error(`The drawer of ${id} has no step part.`);
  return step;
}

/** Open a step's drawer by its box's head, and give the drawer's step part. */
export async function openStep(user: UserEvent, id: string): Promise<HTMLElement> {
  const box = await stepBox(id);
  await user.click(within(box).getByRole('button', { name: new RegExp(`^${id}`) }));
  return stepPanel(id);
}

/** The dialog open with the title `title`, once it is. */
export function findDialog(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
      (dialog) =>
        dialog.getAttribute('aria-label') === title ||
        document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
          ?.textContent === title,
    );
    if (found === undefined) throw new Error(`No dialog is open titled ${title}.`);
    return found;
  });
}

/** The problems banner once it says `words`: the check answers a moment after a change. */
export function findProblems(words: RegExp): Promise<HTMLElement> {
  return waitFor(
    () => {
      const banner = part('section', 'Problems');
      if (!words.test(banner.textContent))
        throw new Error(`The banner does not say ${String(words)}.`);
      return banner;
    },
    { timeout: 3_000 },
  );
}

/** The merge view of a save over someone else's, once it is open. */
export async function findMerge(): Promise<HTMLElement> {
  const fields = await findPart('ul', 'Fields that differ');
  const panel = fields.closest<HTMLElement>('[role="alert"]');
  if (panel === null) throw new Error('The merge view has no panel.');
  return panel;
}
