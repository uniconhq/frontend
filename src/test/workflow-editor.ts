import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { DRAFT_FILE } from '@/features/organise/workflows/words';

/**
 * Finding things on the workflow editor's page, each inside the part of the
 * page it belongs to: the bar, the toolbar, a box, a drawer, a menu. A role
 * query over the whole page weighs every element of a graph of boxes and
 * ports, which made these tests slow enough to time out beside the rest of
 * the suite; inside its part, the same query finds the same thing at once.
 */

/** The editor's page for kenny/tuned, the workflow `workflowBackend` serves. */
export const EDITOR_PAGE = '/workflows/kenny/tuned';

/** A button on the bar, which holds Save, Publish version, Share and View file. */
export function barButton(name: string): HTMLElement {
  const bar = screen.getByLabelText('The workflow', { selector: '[role="toolbar"]' });
  return within(bar).getByRole('button', { name });
}

/** A button on the toolbar, which holds Undo, Redo, Add step and the boxes. */
export function toolButton(name: string): HTMLElement {
  const tools = screen.getByLabelText('Editing', { selector: '[role="toolbar"]' });
  return within(tools).getByRole('button', { name });
}

/**
 * The draft's file as a save would write it, read where a person reads it:
 * "View file" on the bar, a dialog closed again with Escape.
 */
export async function fileText(user: UserEvent): Promise<string> {
  await user.click(barButton('View file'));
  const file = await screen.findByLabelText<HTMLTextAreaElement>(DRAFT_FILE, {
    selector: 'textarea',
  });
  const text = file.value;
  await user.keyboard('{Escape}');
  return text;
}

/** The step's box on the graph, once it is drawn. */
export function stepBox(id: string): Promise<HTMLElement> {
  return screen.findByLabelText(`Step ${id}`, { selector: '[role="group"]' });
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
  return screen.findByLabelText(name, { selector: '[role="menu"]' });
}

/** The drawer open, by its title. */
export function drawer(title: string): HTMLElement {
  return screen.getByLabelText(title, { selector: 'aside' });
}

/** No drawer is open. */
export function noDrawer(): boolean {
  return document.querySelector('aside') === null;
}

/** Open a step's drawer by its box's head, and give the drawer's step part. */
export async function openStep(user: UserEvent, id: string): Promise<HTMLElement> {
  const box = await stepBox(id);
  await user.click(within(box).getByRole('button', { name: new RegExp(`^${id}`) }));
  return within(drawer(`Step ${id}`)).getByLabelText(`The step ${id}`, {
    selector: 'section',
  });
}
