import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Textarea } from '@/ui/Textarea';
import classes from './workflows.module.css';

/**
 * What a draft says it does, applied as the field is left, so undo takes
 * back the whole of it at once. The pages that show the workflow, a task's
 * Workflow card among them, show it above its graph.
 */
export function DescriptionField({
  value,
  apply,
}: {
  value: string | null;
  apply: (text: string) => void;
}) {
  const said = value ?? '';
  const [text, setText] = useState(said);
  const [shown, setShown] = useState(said);
  if (shown !== said) {
    setShown(said);
    setText(said);
  }
  return (
    <Textarea
      label="What it does"
      value={text}
      onChange={setText}
      rows={2}
      description="Shown above its graph wherever it is shown, so others can tell what it is for."
      placeholder="Compiles the solution, runs it on the test's input and compares its output with the answer."
      onCommit={() => {
        if (text.trim() !== said) apply(text);
      }}
    />
  );
}

/** What a workflow says it does, as it is written; nothing when it says nothing. */
export function Description({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <BodyText size="sm" tone="secondary">
      <span className={classes.said}>{text}</span>
    </BodyText>
  );
}
