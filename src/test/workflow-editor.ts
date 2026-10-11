import { waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { DRAFT_FILE } from '@/features/organise/workflows/words';

/**
 * Finding things on the workflow editor's page, each inside the part of the
 * page it belongs to: the bar, the toolbar, a box, a drawer, a menu. Each
 * part is found by its element and its name, by a selector: a query by label
 * over the whole page has jsdom work out every field's labels again after
 * each change, which on a graph of boxes and ports cost these tests most of
 * their time. Inside its part, a query by role or label finds the same thing
 * at once.
 */

/** The part of the page that is a `selector` named `name`, or null. */
export function partOrNull(selector: string, name: string): HTMLElement | null {
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

/** A button on the bar, which holds Save, Publish version, Share and View file. */
export function barButton(name: string): HTMLElement {
  return within(part('[role="toolbar"]', 'The workflow')).getByRole('button', { name });
}

/** A button on the toolbar, which holds Undo, Redo, Add step and the boxes. */
export function toolButton(name: string): HTMLElement {
  return within(part('[role="toolbar"]', 'Editing')).getByRole('button', { name });
}

/**
 * The draft's file as a save would write it, read where a person reads it:
 * "View file" on the bar, a dialog closed again with Escape.
 */
export async function fileText(user: UserEvent): Promise<string> {
  await user.click(barButton('View file'));
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

/** The button of a step's input port, whose menu wires it. */
export async function portButton(step: string, port: string): Promise<HTMLElement> {
  return within(await stepBox(step)).getByRole('button', {
    name: `The port ${port} of ${step}`,
  });
}

/** The button of a step's output, whose menu wires it onward or reports it. */
export async function outputButton(step: string, output: string): Promise<HTMLElement> {
  return within(await stepBox(step)).getByRole('button', {
    name: `The output ${output} of ${step}`,
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
