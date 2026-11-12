import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Textarea } from '@/ui/Textarea';
import classes from './workflows.module.css';

/** Applied as the field is left, so undo takes the whole of it back at once. */
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
      label="Description"
      value={text}
      onChange={setText}
      rows={2}
      placeholder="Runs the solution on the test's input and compares its output with the answer."
      onCommit={() => {
        if (text.trim() !== said) apply(text);
      }}
    />
  );
}

export function Description({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <BodyText size="sm" tone="secondary">
      <span className={classes.said}>{text}</span>
    </BodyText>
  );
}
