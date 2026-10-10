import { useEffect, useRef, useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import {
  adminOnly,
  bothChanged,
  defaultSide,
  differences,
  mergeText,
  pathText,
  type FieldDiff,
  type Side,
} from './merge';
import { localOf, zoneName } from './times';
import { exactJS, NumberText, parseYaml } from './yaml-doc';
import shared from '../organise.module.css';
import classes from './forms.module.css';

/** A time as the form shows it: in the organiser's own time. */
function timeText(value: string): string | null {
  const local = localOf(value);
  return local === '' ? null : local.replace('T', ' ');
}

/** A side of a field as the merge view shows it. */
function shown(diff: FieldDiff, value: unknown): string {
  if (value === undefined) return diff.kind === 'item' ? 'not in the list' : 'not set';
  if (diff.kind === 'order') return (value as string[]).join(', ');
  if (typeof value === 'string')
    return value === '' ? '""' : (timeText(value) ?? value);
  return digitsOf(value);
}

/** A value as JSON writes it, but each number as the digits the file holds. */
function digitsOf(value: unknown): string {
  if (value instanceof NumberText) return value.text;
  if (Array.isArray(value)) return `[${value.map(digitsOf).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${digitsOf(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Whether a side of the field is a time, which the view shows in local time. */
function holdsTime(diff: FieldDiff): boolean {
  return [diff.mine, diff.theirs].some(
    (value) => typeof value === 'string' && timeText(value) !== null,
  );
}

/** The row's label: the field's path, each item by its key, and what it is. */
function labelOf(diff: FieldDiff): string {
  const path = pathText(diff.path);
  const what =
    diff.kind === 'order'
      ? `${path}: the order`
      : diff.kind === 'item'
        ? `${path} (${diff.mine === undefined ? 'only in the current version' : 'only in yours'})`
        : path;
  return bothChanged(diff) ? `${what} (both changed it)` : what;
}

/**
 * What a save refused as a conflict turns into: the organiser's version and
 * the file as it is now, field by field, with a choice for each field they
 * disagree on. Each choice starts on the side that changed the field since
 * the organiser read it, and a field both changed is marked. Nothing is
 * written until Save, which writes the chosen fields into the current file,
 * so everything else of the current file stays, at its version.
 *
 * The items of a keyed list (`contest.yaml`'s tasks by id, its boards by
 * name) are matched by their key and named by it, an item only one side has
 * is a row of its own, and so is the list's order. Times compare as the
 * moments they name. A manager's admin-only keys stay as they are now: the
 * forge would refuse a manager's change to one.
 */
export function MergeView({
  file,
  admin,
  baseText,
  mineText,
  currentText,
  busy,
  onSave,
  onDrop,
}: {
  /** The file's path in the repo, which names its keyed lists and admin keys. */
  file: string;
  /** Whether the organiser is an admin at the scope, who may change every key. */
  admin: boolean;
  /** The file as the organiser read it. */
  baseText: string;
  /** What the organiser tried to save. */
  mineText: string;
  /** The file as it is now. */
  currentText: string;
  busy: boolean;
  onSave: (content: string) => void;
  onDrop: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const base = parseYaml(baseText);
  const mine = parseYaml(mineText);
  const current = parseYaml(currentText);
  const diffs =
    'error' in current || 'error' in mine
      ? null
      : differences(
          'error' in base ? undefined : exactJS(base.doc),
          exactJS(mine.doc),
          exactJS(current.doc),
          file,
        );
  const locked = (diff: FieldDiff) => !admin && adminOnly(diff, file);
  const [choices, setChoices] = useState<Side[]>(() =>
    (diffs ?? []).map((diff) => (locked(diff) ? 'theirs' : defaultSide(diff))),
  );
  const choosable = diffs !== null && diffs.some((diff) => !locked(diff));

  return (
    <div ref={panel} className={shared.panel} role="alert" tabIndex={-1}>
      <BodyText>Someone else saved this file since you opened it.</BodyText>
      {diffs === null ? (
        <BodyText tone="secondary">
          Nothing was saved. The file as it is now is not YAML the form can read, so the
          two cannot be compared field by field. Drop your changes to see it, or edit it
          as text.
        </BodyText>
      ) : diffs.length === 0 ? (
        <BodyText tone="secondary">
          Nothing was saved, and nothing needs to be: the file as it is now already has
          every change you made.
        </BodyText>
      ) : (
        <>
          <BodyText tone="secondary">
            {choosable
              ? 'Nothing was saved yet. For each field the two versions disagree on, pick the one to keep, then save. Every other field stays as it is now.'
              : 'Nothing was saved. Every field the two versions disagree on is one only an admin changes, so the file stays as it is now.'}
            {diffs.some(holdsTime) && ` Times are in your time, ${zoneName()}.`}
          </BodyText>
          <ul className={classes.merge} aria-label="Fields that differ">
            {diffs.map((diff, index) => {
              const held = locked(diff);
              return (
                <li key={`${diff.kind} ${pathText(diff.path)}`}>
                  <RadioGroup
                    label={labelOf(diff)}
                    description={
                      held
                        ? 'Only an admin changes this, so it stays as it is now.'
                        : undefined
                    }
                    disabled={held}
                    value={choices[index] ?? 'theirs'}
                    options={[
                      { value: 'mine', label: `Yours: ${shown(diff, diff.mine)}` },
                      { value: 'theirs', label: `Now: ${shown(diff, diff.theirs)}` },
                    ]}
                    onChange={(value) =>
                      setChoices((before) =>
                        before.map((side, at) =>
                          at === index ? (value === 'mine' ? 'mine' : 'theirs') : side,
                        ),
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className={shared.actions}>
        {choosable && (
          <Button
            size="xs"
            loading={busy}
            onClick={() => onSave(mergeText(currentText, diffs, choices))}
          >
            Save the merged version
          </Button>
        )}
        <Button size="xs" variant="secondary" disabled={busy} onClick={onDrop}>
          {diffs !== null && !choosable ? 'Back to the form' : 'Drop my changes'}
        </Button>
      </div>
    </div>
  );
}
