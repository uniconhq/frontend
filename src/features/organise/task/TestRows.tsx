import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Loaded } from '@/ui/feedback/Loaded';
import { formatSize } from '@/lib/size';
import { FieldBox } from '../contest/ContestFile';
import { treeQuery } from '../files/place';
import { NumberField } from '../forms/fields';
import type { GroupValues } from '../forms/task-values';
import { lastPart, type TaskPlace } from './build-data';
import { testField } from './places';
import type { StagedTest } from './staged';
import shared from '../organise.module.css';
import classes from './task.module.css';

/** A file of a test as a row shows it: its name and size. */
function fileText(name: string, size: number | null, folder = false): string {
  if (folder) return `${name}/`;
  return size === null ? name : `${name} (${formatSize(size)})`;
}

/** The files a test holds now, read when its row is shown. */
function SavedFiles({ place, path }: { place: TaskPlace; path: string }) {
  const view = queryView(useQuery({ ...treeQuery(place, path), retry: false }));
  return (
    <Loaded view={view} compact>
      {(entries: TreeEntry[]) => (
        <>
          {entries.length === 0
            ? 'No files.'
            : entries
                .map((entry) =>
                  fileText(
                    lastPart(entry.path),
                    entry.size,
                    entry.kind === 'directory',
                  ),
                )
                .join(', ')}
        </>
      )}
    </Loaded>
  );
}

/** What a staged test writes, as a row shows it. */
function stagedText(test: StagedTest): string {
  const files = test.files.map((file) => fileText(file.entry, file.source.size));
  const values =
    test.values === null
      ? []
      : Object.entries(test.values)
          .filter(([, value]) => value.trim() !== '')
          .map(([field, value]) => `${field}: ${value}`);
  return [...files, ...values].join(', ');
}

/**
 * A test group's tests, a row each in natural order: its name, its files and
 * their sizes, a test's weight where the group's rule reads weights, and
 * Replace and Remove. A test added, replaced or taken out says so on its row
 * until the save, with Undo.
 */
export function TestRows({
  place,
  group,
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
          <li key={name} className={classes.test}>
            <FieldBox name={testField(name)}>
              <span className={classes.testName}>{name}</span>
            </FieldBox>
            <span className={classes.testFiles}>
              {change !== undefined ? (
                stagedText(change)
              ) : (
                <SavedFiles place={place} path={`tests/${group.name}/${name}`} />
              )}
            </span>
            {isNew && <Chip tone="live">New</Chip>}
            {change !== undefined && !isNew && <Chip tone="warn">Replaced</Chip>}
            {out && <Chip tone="warn">To be removed</Chip>}
            {weights && !out && (
              <div className={classes.weight}>
                <NumberField
                  label={`Test weight of ${name}`}
                  value={weight}
                  onChange={(value) => onWeight(name, value)}
                  placeholder="1"
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
          </li>
        );
      })}
    </ul>
  );
}
