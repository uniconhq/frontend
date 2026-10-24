import type { TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { formatSize } from '@/lib/size';
import shared from '../organise.module.css';
import type { StagedPicture } from './statement-pictures';

/** A picture as the list shows it: under `public/` now, or chosen and waiting for the save. */
type Listed = { name: string; size: number | null; staged: StagedPicture | undefined };

/**
 * The task's pictures, the files under its `public/` folder, and those
 * chosen to be added, each with its size and what waits for the statement's
 * save, marked as a chip: New, or To be removed. One the
 * statement does not show says so. An admin takes one out with Remove, or
 * puts a change back with Undo; both wait for the statement's save.
 */
export function StatementPictures({
  saved,
  staged,
  named,
  admin,
  disabled,
  onRemove,
  onUndo,
}: {
  saved: TreeEntry[];
  staged: StagedPicture[];
  /** The names under `public/` the statement's text shows. */
  named: ReadonlySet<string>;
  admin: boolean;
  disabled: boolean;
  onRemove: (entry: TreeEntry) => void;
  onUndo: (name: string) => void;
}) {
  const nameOf = (entry: TreeEntry) => entry.path.slice('public/'.length);
  const listed: Listed[] = [
    ...saved
      .filter((entry) => entry.kind === 'file')
      .map((entry) => ({
        name: nameOf(entry),
        size: entry.upload?.size ?? entry.size ?? null,
        staged: staged.find((change) => change.name === nameOf(entry)),
      })),
    ...staged.flatMap((change) =>
      change.kind === 'add'
        ? [{ name: change.name, size: change.file.size, staged: change }]
        : [],
    ),
  ];
  if (listed.length === 0) {
    return <BodyText tone="secondary">The task has no pictures yet.</BodyText>;
  }
  return (
    <ul className={shared.named} aria-label="Pictures">
      {listed.map(({ name, size, staged: change }) => (
        <li key={name} aria-label={name}>
          <div className={shared.actions}>
            <span>
              {name}
              {size !== null && `, ${formatSize(size)}`}
            </span>
            {change?.kind === 'add' && <Chip tone="live">New</Chip>}
            {change?.kind === 'remove' && <Chip tone="warn">To be removed</Chip>}
            {change === undefined && !named.has(name) && (
              <BodyText tone="secondary">Not shown in the statement.</BodyText>
            )}
            {admin &&
              (change !== undefined ? (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Undo ${name}`}
                  onClick={() => onUndo(name)}
                  disabled={disabled}
                >
                  Undo
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Remove ${name}`}
                  onClick={() => {
                    const entry = saved.find((found) => nameOf(found) === name);
                    if (entry !== undefined) onRemove(entry);
                  }}
                  disabled={disabled}
                >
                  Remove
                </Button>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
