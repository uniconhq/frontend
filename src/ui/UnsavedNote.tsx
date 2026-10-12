import { BodyText } from './BodyText';

/**
 * What a form says beside its Save while it holds changes: plainly, that
 * they are not saved and leaving the page loses them.
 */
export function UnsavedNote() {
  return (
    <BodyText tone="secondary">
      Not saved yet: leaving this page loses these changes.
    </BodyText>
  );
}
