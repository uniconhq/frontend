import type { CodeEditor as Real } from '@/ui/CodeEditor';
import { Textarea } from '@/ui/Textarea';

/**
 * What the tests use in place of `ui/CodeEditor`: jsdom lays nothing out, so
 * CodeMirror cannot be typed into there the way a person types. This takes
 * the same props and is a plain text field with the same label, so a test
 * finds the editor by its label, reads its value and types into it.
 */
export function CodeEditor({
  label,
  value,
  onChange,
  readOnly = false,
  autoFocus = false,
  rows = 18,
  marked,
}: Parameters<typeof Real>[0]) {
  return (
    <div
      data-marked={marked
        ?.map((range) => `${String(range.from)}-${String(range.to)}`)
        .join(' ')}
    >
      <Textarea
        label={label}
        value={value}
        onChange={(next) => onChange?.(next)}
        mono
        rows={rows}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
    </div>
  );
}
