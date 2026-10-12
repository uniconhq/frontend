import { useState } from 'react';
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

/** A size as short as a test's row says it: "4 B" below a kilobyte, then as everywhere. */
function shortSize(bytes: number): string {
  return bytes < 1024 ? `${String(bytes)} B` : formatSize(bytes);
}

/** One part of a test as its row names it: its name and size, or that it is a folder. */
type Part = { part: string; size: number | null; folder: boolean };

/**
 * A test's parts in the workflow's order, each with its size: "input 4 B,
 * answer 2 B". Its values (`test.yaml`) show once the test is opened.
 */
function partsText(parts: Part[], order: string[]): string {
  const rank = (part: string) => {
    const at = order.indexOf(part);
    return at < 0 ? order.length : at;
  };
  const shown = parts
    .filter((each) => each.part !== 'test')
    .sort((a, b) => rank(a.part) - rank(b.part) || a.part.localeCompare(b.part));
  if (shown.length === 0) return 'no files';
  return shown
    .map((each) =>
      each.folder
        ? `${each.part}, a folder`
        : each.size === null
          ? each.part
          : `${each.part} ${shortSize(each.size)}`,
    )
    .join(', ');
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
            })),
            order,
          )}
        </>
      )}
    </Loaded>
  );
}

/** What a staged test writes, as a row shows it: its parts, a folder's files together. */
function stagedText(test: StagedTest, order: string[]): string {
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
 * A test group's tests, a row each in natural order: "Test 1 · input 4 B,
 * answer 2 B", its parts in the workflow's order; its weight where the
 * group's rule reads weights, with what a weight does behind an ⓘ; and
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
  /** Whether the group's rule reads test weights. */
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
