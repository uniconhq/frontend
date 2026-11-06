import type { CodeEditor as Real } from '@/ui/CodeEditor';
import { Textarea } from '@/ui/Textarea';

/** Stands in for `ui/CodeEditor`: jsdom does no layout, so CodeMirror can't be typed into. */
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
