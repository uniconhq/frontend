import { screen } from '@testing-library/react';

/** The editor's page for kenny/tuned, the workflow `workflowBackend` serves. */
export const EDITOR_PAGE = '/workflows/kenny/tuned';

const PREVIEW = 'workflow.yaml as a save writes it';

/** The file as a save would write it, once the editor shows it. */
export async function preview(): Promise<string> {
  return (await screen.findByLabelText<HTMLTextAreaElement>(PREVIEW)).value;
}

/** The file as a save would write it, as the editor shows it now. */
export function previewNow(): string {
  return screen.getByLabelText<HTMLTextAreaElement>(PREVIEW).value;
}
