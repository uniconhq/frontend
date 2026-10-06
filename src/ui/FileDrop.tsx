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
 * one at the same path replacing the one there. A `folder` zone takes
 * several files too, and offers a second picker under it that chooses a
 * whole folder, its own file input, labelled `<label>: a folder`. Each file
 * is known by `pathOf`, its name unless told otherwise. The files chosen are
 * listed below the zone by that path, each with a way to take it out and,
 * while `progressOf` gives one, how much of it has been sent.
 */
export function FileDrop({
  label,
  description,
  accept,
  multiple = false,
  folder = false,
  pathOf = (file) => file.name,
  files,
  onChange,
  progressOf,
  disabled = false,
}: {
  label: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  folder?: boolean;
  pathOf?: (file: File) => string;
  files: File[];
  onChange: (files: File[]) => void;
  progressOf?: (file: File) => number | null;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const hint = useId();
  const several = multiple || folder;

  const take = (chosen: File[]) => {
    if (disabled || chosen.length === 0) return;
    if (!several) {
      onChange(chosen.slice(0, 1));
      return;
    }
    const paths = new Set(chosen.map(pathOf));
    onChange([...files.filter((file) => !paths.has(pathOf(file))), ...chosen]);
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
          {several
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
          multiple={several}
          disabled={disabled}
          onChange={(event) => {
            take(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      </label>
      {folder && (
        <label className={classes.folder} data-disabled={disabled || undefined}>
          Or choose a folder
          <input
            type="file"
            className={classes.input}
            aria-label={`${label}: a folder`}
            ref={(node) => {
              if (node !== null) node.webkitdirectory = true;
            }}
            multiple
            disabled={disabled}
            onChange={(event) => {
              take(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
      {files.length > 0 && (
        <ul className={classes.files} aria-label={`${label}: files chosen`}>
          {files.map((file) => {
            const progress = progressOf?.(file) ?? null;
            const path = pathOf(file);
            return (
              <li key={path} className={classes.file}>
                <span className={classes.name}>{path}</span>
                {progress !== null ? (
                  <div className={classes.progress}>
                    <Progress value={progress} label={`${path} sent`} />
                  </div>
                ) : (
                  <Button
                    size="xs"
                    variant="secondary"
                    label={`Remove ${path}`}
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
