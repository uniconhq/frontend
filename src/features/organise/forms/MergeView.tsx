import { useEffect, useRef, useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import {
  adminOnly,
  bothChanged,
  changedByThem,
  defaultSide,
  differences,
  mergeText,
  pathText,
  type FieldDiff,
  type MergePath,
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

/**
 * How a file's fields are said to the organiser: each field named as its
 * form names it, and each value as the form says it, or null where the
 * value reads well as it is. Without it, fields go by their place in the
 * file.
 */
export type MergeWords = {
  field: (path: MergePath) => string;
  value: (path: MergePath, value: unknown) => string | null;
};

/** A side of a field as the merge view shows it. */
function shown(diff: FieldDiff, value: unknown, words?: MergeWords): string {
  if (value === undefined) return diff.kind === 'item' ? 'not in the list' : 'not set';
  const said = diff.kind === 'order' ? null : words?.value(diff.path, value);
  if (said !== undefined && said !== null) return said;
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

/** The row's label: the field by name or by its path, and what it is. */
function labelOf(diff: FieldDiff, words?: MergeWords): string {
  const path = words === undefined ? pathText(diff.path) : words.field(diff.path);
  const what =
    diff.kind === 'order'
      ? words === undefined
        ? `${path}: the order`
        : `The order of ${path.toLowerCase()}`
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
 * forge would refuse a manager's change to one. `words`, when given, names
 * each field and value as the form does.
 *
 * Saving the organiser's whole version over the current one is there too,
 * after a warning that says what of the other person's it throws away.
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
  words,
}: {
  /** The file's path in the repo, which names its keyed lists and admin keys. */
  file: string;
  words?: MergeWords;
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
  const [overwriting, setOverwriting] = useState(false);
  const theirs = diffs?.filter((diff) => !locked(diff) && changedByThem(diff)) ?? [];

  return (
    <div ref={panel} className={shared.panel} role="alert" tabIndex={-1}>
      <BodyText>Someone else saved a change since you opened this.</BodyText>
      {diffs === null ? (
        <BodyText tone="secondary">
          Nothing was saved. The version saved now cannot be read by this form, so the
          two versions cannot be compared field by field. Discard your changes to see
          them.
        </BodyText>
      ) : diffs.length === 0 ? (
        <BodyText tone="secondary">
          Nothing was saved, and nothing needs to be: the version saved now already has
          every change you made.
        </BodyText>
      ) : (
        <>
          <BodyText tone="secondary">
            {choosable
              ? 'Nothing has been saved yet. For each field where the two versions differ, choose the one to keep, then save. Every other field stays as it is now.'
              : 'Nothing was saved. Only an admin can change the fields where the two versions differ, so everything stays as it is now.'}
            {diffs.some(holdsTime) && ` Times are in your time, ${zoneName()}.`}
          </BodyText>
          <ul className={classes.merge} aria-label="Fields that differ">
            {diffs.map((diff, index) => {
              const held = locked(diff);
              return (
                <li key={`${diff.kind} ${pathText(diff.path)}`}>
                  <RadioGroup
                    label={labelOf(diff, words)}
                    description={
                      held
                        ? 'Only an admin can change this, so it stays as it is now.'
                        : undefined
                    }
                    disabled={held}
                    value={choices[index] ?? 'theirs'}
                    options={[
                      {
                        value: 'mine',
                        label: `Yours: ${shown(diff, diff.mine, words)}`,
                      },
                      {
                        value: 'theirs',
                        label: `Now: ${shown(diff, diff.theirs, words)}`,
                      },
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
            loading={busy}
            onClick={() => onSave(mergeText(currentText, diffs, choices))}
          >
            Save the merged version
          </Button>
        )}
        {choosable && theirs.length > 0 && (
          <Button variant="danger" disabled={busy} onClick={() => setOverwriting(true)}>
            Save yours over theirs
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onDrop}>
          {diffs !== null && !choosable ? 'Back to the form' : 'Discard my changes'}
        </Button>
      </div>
      <Modal
        opened={overwriting}
        onClose={() => setOverwriting(false)}
        title="Save yours over theirs?"
      >
        <div className={shared.stack}>
          <BodyText>
            This throws away what the other person changed in{' '}
            {theirs
              .map((diff) => labelOf(diff, words).replace(/ \(.*\)$/, ''))
              .join(', ')}
            . Picking a side for each field above keeps the rest of their work.
          </BodyText>
          <div className={shared.actions}>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                setOverwriting(false);
                if (diffs !== null) {
                  onSave(
                    mergeText(
                      currentText,
                      diffs,
                      diffs.map((diff) => (locked(diff) ? 'theirs' : 'mine')),
                    ),
                  );
                }
              }}
            >
              Save yours over theirs
            </Button>
            <Button variant="secondary" onClick={() => setOverwriting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
