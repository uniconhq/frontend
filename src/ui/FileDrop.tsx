import { useId, useState, type DragEvent } from 'react';
import { Button } from './Button';
import { Progress } from './Progress';
import classes from './FileDrop.module.css';

/**
 * The browser's own file input, hidden but kept in the tab order, so Tab and
 * Enter reach the picker. `accept` only narrows the picker: a dropped file is not held to it.
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
  layout,
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
  layout?: 'compact' | 'button';
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
    <div className={classes.field} data-layout={layout}>
      <label
        className={classes.zone}
        data-layout={layout}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragOver={over}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {layout !== 'compact' && <span className={classes.label}>{label}</span>}
        {layout !== 'button' && (
          <span id={hint} className={classes.hint}>
            {several
              ? 'Drop files here or choose them.'
              : 'Drop a file here or choose one.'}
            {description !== undefined && ` ${description}`}
          </span>
        )}
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
      {layout === 'button' && (
        <span id={hint} className={classes.hint}>
          {description}
        </span>
      )}
      {folder && layout !== 'compact' && (
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
