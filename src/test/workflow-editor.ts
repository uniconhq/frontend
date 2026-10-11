import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { DRAFT_FILE } from '@/features/organise/workflows/words';

/** The editor's page for kenny/tuned, the workflow `workflowBackend` serves. */
export const EDITOR_PAGE = '/workflows/kenny/tuned';

/**
 * The draft's file as a save would write it, read where a person reads it:
 * "View file" on the bar, a dialog closed again with Escape.
 */
export async function fileText(user: UserEvent): Promise<string> {
  await user.click(screen.getByRole('button', { name: 'View file' }));
  const dialog = await screen.findByRole('dialog', { name: DRAFT_FILE });
  const text = within(dialog).getByLabelText<HTMLTextAreaElement>(DRAFT_FILE).value;
  await user.keyboard('{Escape}');
  return text;
}

/** The step's box on the graph, once it is drawn. */
export function stepBox(id: string): Promise<HTMLElement> {
  return screen.findByRole('group', { name: `Step ${id}` });
}

/** Open a step's drawer by its box's head, and give the drawer's step part. */
export async function openStep(user: UserEvent, id: string): Promise<HTMLElement> {
  const box = await stepBox(id);
  await user.click(within(box).getByRole('button', { name: new RegExp(`^${id}`) }));
  return screen.findByRole('region', { name: `The step ${id}` });
}
