import { useId, useState, type DragEvent } from 'react';
import { Button } from './Button';
import { Progress } from './Progress';
import classes from './FileDrop.module.css';

/**
 * A place to drop files or choose them. It is the browser's own file input,
 * hidden but not taken out of the tab order, inside the zone that shows it, so
 * a keyboard reaches it with Tab and opens the picker with Enter or Space, a
 * click anywhere on the zone does the same, and a screen reader hears it by
 * `label`. `accept` is the input's own attribute, which only narrows what the
 * picker shows: a dropped file is not held to it here.
 *
 * A single-file zone replaces its file; a `multiple` one adds to its files,
 * one of the same name replacing the one there. The files chosen are listed
 * below the zone, each with a way to take it out and, while `progressOf`
 * gives one, how much of it has been sent.
 */
export function FileDrop({
  label,
  description,
  accept,
  multiple = false,
  files,
  onChange,
  progressOf,
  disabled = false,
}: {
  label: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  progressOf?: (file: File) => number | null;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const hint = useId();

  const take = (chosen: File[]) => {
    if (disabled || chosen.length === 0) return;
    if (!multiple) {
      onChange(chosen.slice(0, 1));
      return;
    }
    const names = new Set(chosen.map((file) => file.name));
    onChange([...files.filter((file) => !names.has(file.name)), ...chosen]);
  };

  const over = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setDragging(true);
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    take(Array.from(event.dataTransfer.files));
  };

  return (
    <div className={classes.field}>
      <label
        className={classes.zone}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragOver={over}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span className={classes.label}>{label}</span>
        <span id={hint} className={classes.hint}>
          {multiple
            ? 'Drop files here or choose them.'
            : 'Drop a file here or choose one.'}
          {description !== undefined && ` ${description}`}
        </span>
        <input
          type="file"
          className={classes.input}
          aria-label={label}
          aria-describedby={hint}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            take(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className={classes.files} aria-label={`${label}: files chosen`}>
          {files.map((file) => {
            const progress = progressOf?.(file) ?? null;
            return (
              <li key={file.name} className={classes.file}>
                <span className={classes.name}>{file.name}</span>
                {progress !== null ? (
                  <div className={classes.progress}>
                    <Progress value={progress} label={`${file.name} sent`} />
                  </div>
                ) : (
                  <Button
                    size="xs"
                    variant="secondary"
                    label={`Remove ${file.name}`}
                    disabled={disabled}
                    onClick={() => onChange(files.filter((kept) => kept !== file))}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
