import { Fragment, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { DeclaredField, TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Loaded } from '@/ui/feedback/Loaded';
import { formatSize } from '@/lib/size';
import { treeQuery } from '../files/place';
import { NumberField } from '../forms/fields';
import type { GroupValues } from '../forms/task-values';
import { lastPart, type TaskPlace } from './build-data';
import { partOf } from './parts';
import { testField } from './places';
import type { StagedTest } from './staged';
import { TestView } from './TestView';
import shared from '../organise.module.css';
import classes from './task.module.css';

/**
 * One part of a test as its row names it: its name, its size, whether it is
 * a folder, and `start`, the first bytes of a small text file as the forge's
 * listing will give them (M67): text, null for a file that is not text or is
 * too large to give, undefined while the listing gives none.
 */
type Part = {
  part: string;
  size: number | null;
  folder: boolean;
  start?: string | null;
};

/** Past this a file's size says something on its row: "input 12.4 MB". */
const LARGE = 1024;

/** The longest start a row shows of a file, cut short with "…" past it or its first line. */
const START = 40;

/** A file's first line, cut short past `START` characters, "…" marking the cut. */
function startText(start: string): string {
  const [line = ''] = start.split(/\r?\n/);
  const cut = line.length > START || start.trimEnd().includes('\n');
  return `${line.slice(0, START)}${cut ? '…' : ''}`;
}

/**
 * One part on a test's row: a small text file's start, "`1 2`"; its size
 * only where it says something, a file over 1 KB or one that is not text,
 * "input 12.4 MB"; an empty file, "answer is empty", in the warning colour;
 * otherwise its name alone.
 */
function partPiece(each: Part): ReactNode {
  if (each.folder) return `${each.part}, a folder`;
  if (each.size === 0)
    return <span className={classes.emptyPart}>{each.part} is empty</span>;
  if (typeof each.start === 'string' && (each.size === null || each.size <= LARGE)) {
    return <code className={classes.partStart}>{startText(each.start)}</code>;
  }
  if (each.size !== null && (each.size > LARGE || each.start === null)) {
    return `${each.part} ${formatSize(each.size)}`;
  }
  return each.part;
}

/**
 * A test's parts in the workflow's order, each as `partPiece` says: "`1 2` →
 * `3`" once a part shows its start, from what goes in to what comes out;
 * "input, answer" while none does. Its values (`test.yaml`) show once the
 * test is opened.
 */
function partsText(parts: Part[], order: string[]): ReactNode {
  const rank = (part: string) => {
    const at = order.indexOf(part);
    return at < 0 ? order.length : at;
  };
  const shown = parts
    .filter((each) => each.part !== 'test')
    .sort((a, b) => rank(a.part) - rank(b.part) || a.part.localeCompare(b.part));
  if (shown.length === 0) return 'no files';
  const between = shown.some((each) => typeof each.start === 'string') ? ' → ' : ', ';
  return shown.map((each, at) => (
    <Fragment key={each.part}>
      {at > 0 && between}
      {partPiece(each)}
    </Fragment>
  ));
}

/** The parts a test holds now, read when its row is shown. */
function SavedParts({
  place,
  path,
  order,
}: {
  place: TaskPlace;
  path: string;
  order: string[];
}) {
  const view = queryView(useQuery({ ...treeQuery(place, path), retry: false }));
  return (
    <Loaded view={view} compact>
      {(entries: TreeEntry[]) => (
        <>
          {partsText(
            entries.map((entry) => ({
              part: partOf(lastPart(entry.path)),
              size: entry.upload?.size ?? entry.size,
              folder: entry.kind === 'directory',
              // The listing's first bytes of a small text file plug in here as
              // `start` once the forge gives them (M67); until then, none.
            })),
            order,
          )}
        </>
      )}
    </Loaded>
  );
}

/** What a staged test writes, as a row shows it: its parts, a folder's files together. */
function stagedText(test: StagedTest, order: string[]): ReactNode {
  const parts = new Map<string, Part>();
  for (const file of test.files) {
    const before = parts.get(file.field);
    parts.set(file.field, {
      part: file.field,
      size: (before?.size ?? 0) + file.source.size,
      folder: file.entry.includes('/') || (before?.folder ?? false),
    });
  }
  return partsText([...parts.values()], order);
}

const WEIGHT_INFO =
  'How much this test counts against the others. 1 by default; a test of weight 2 counts twice.';

/**
 * A test group's tests, a row each in natural order: "Test 1 · input,
 * answer", its parts in the workflow's order (`partsText`); its weight where
 * `weights` says, with what a weight does behind an ⓘ; and
 * Replace and Remove. A test added, replaced or taken out says so on its row
 * until the save, with Undo. Its name opens it in place, below its row, to
 * read what it holds (`TestView`).
 */
export function TestRows({
  place,
  group,
  fields,
  saved,
  staged,
  removed,
  weights,
  onWeight,
  onReplace,
  onRemove,
  onUndo,
  disabled,
}: {
  place: TaskPlace;
  group: GroupValues;
  /** The fields each test has, from the workflow, which order a row's parts. */
  fields: DeclaredField[] | null;
  /** The tests the group's folder holds now. */
  saved: string[];
  /** The tests the save adds or replaces in this group. */
  staged: StagedTest[];
  /** The tests the save takes out of this group. */
  removed: string[];
  /** Whether each row has a weight box: the group's rule reads weights, and they were asked for or one differs from 1. */
  weights: boolean;
  onWeight: (test: string, weight: string) => void;
  onReplace: (test: string) => void;
  onRemove: (test: string) => void;
  onUndo: (test: string) => void;
  disabled: boolean;
}) {
  const names = [...new Set([...saved, ...staged.map((test) => test.test)])].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );
  const order = (fields ?? []).map((field) => field.name);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const toggle = (name: string) =>
    setOpened((before) => {
      const next = new Set(before);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  if (names.length === 0) {
    return (
      <BodyText tone="secondary">
        No tests yet. Add tests to grade submissions on this group.
      </BodyText>
    );
  }
  return (
    <ul className={classes.tests} aria-label={`Tests of ${group.name}`}>
      {names.map((name) => {
        const change = staged.find((test) => test.test === name);
        const isNew = change !== undefined && !saved.includes(name);
        const out = removed.includes(name);
        const weight = group.weights.find((row) => row.test === name)?.weight ?? '';
        return (
          <li
            key={name}
            className={classes.test}
            data-field={testField(name)}
            aria-label={`Test ${name}`}
          >
            <button
              type="button"
              className={classes.testName}
              aria-expanded={opened.has(name)}
              onClick={() => toggle(name)}
            >
              <span aria-hidden="true">{opened.has(name) ? '▾' : '▸'}</span> Test {name}
            </button>{' '}
            <span className={classes.testFiles}>
              ·{' '}
              {change !== undefined ? (
                stagedText(change, order)
              ) : (
                <SavedParts
                  place={place}
                  path={`tests/${group.name}/${name}`}
                  order={order}
                />
              )}
            </span>
            {isNew && <Chip tone="live">New</Chip>}
            {change !== undefined && !isNew && <Chip tone="warn">Replaced</Chip>}
            {out && <Chip tone="warn">To be removed</Chip>}
            {weights && !out && (
              <div className={classes.weight}>
                <NumberField
                  label="Weight"
                  value={weight}
                  onChange={(value) => onWeight(name, value)}
                  placeholder="1"
                  info={WEIGHT_INFO}
                  disabled={disabled}
                />
              </div>
            )}
            {!disabled && (
              <div className={shared.actions}>
                {change !== undefined || out ? (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => onUndo(name)}
                    label={`Undo the change to test ${name}`}
                  >
                    Undo
                  </Button>
                ) : (
                  <>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => onReplace(name)}
                      label={`Replace test ${name}`}
                    >
                      Replace
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => onRemove(name)}
                      label={`Remove test ${name}`}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            )}
            {opened.has(name) && (
              <TestView
                place={place}
                group={group.name}
                test={name}
                fields={fields}
                staged={change}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
