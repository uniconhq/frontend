import { useEffect, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { FileChange, FileContent } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { formatSize } from '@/lib/size';
import { formatDateTime } from '@/lib/time';
import { fileQuery, type Place } from './place';
import shared from '../organise.module.css';
import formClasses from '../forms/forms.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** A file this save would write or take out, which someone else changed since. */
export type MovedFile = {
  path: string;
  /** The file in words, as the page names it: "Tests, small, test 3: answer". */
  label: string;
  /** What this save does to it, in words: "answer.txt, 12 bytes", or "Taken out". */
  mine: string;
};

/** The size of what a file holds, an upload's or its text's. */
function sizeOf(file: FileContent): number {
  if (file.upload) return file.upload.size;
  if (file.encoding === 'base64') {
    const padding = file.content.endsWith('==')
      ? 2
      : file.content.endsWith('=')
        ? 1
        : 0;
    return Math.max(0, Math.floor((file.content.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(file.content).length;
}

/** Who saved a change, by the name the history gives them. */
function whoOf(change: FileChange | undefined): string {
  if (change === undefined) return 'someone';
  return change.author ?? 'someone';
}

/**
 * Files someone else changed since a change to them was made here, the one
 * way a save meets someone else's (M27), as the settings' merge is: each file
 * with what it is now, whose it is, its size and when they saved it, beside
 * what this save does to it, and a choice for each. Saving keeps their
 * version of every file left on theirs and writes this save's over the ones
 * chosen; saving every one over theirs asks first, saying what it throws
 * away. Nothing is saved until then.
 */
export function FilesMerge({
  place,
  files,
  busy,
  onSave,
  onDrop,
}: {
  place: TaskPlace;
  files: MovedFile[];
  busy: boolean;
  /** Save, writing over the files whose paths are given and leaving the rest theirs. */
  onSave: (overwrite: ReadonlySet<string>) => void;
  onDrop: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const [warning, setWarning] = useState(false);
  const task = { org: place.org, contest: place.contest, task: place.task };
  const now = useQueries({
    queries: files.map((file) => ({
      ...fileQuery(place, file.path),
      staleTime: 0,
      retry: false,
    })),
  });
  const history = useQueries({
    queries: files.map((file) =>
      $api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/history',
        { params: { path: task, query: { path: file.path } } },
      ),
    ),
  });

  const theirs = (index: number): string => {
    const read = now[index];
    const latest = history[index]?.data?.[0];
    const when =
      latest === undefined ? '' : ` on ${formatDateTime(new Date(latest.at))}`;
    if (read === undefined || read.isPending) return 'Loading…';
    if (read.data === undefined) return `Removed by ${whoOf(latest)}${when}`;
    return `${formatSize(sizeOf(read.data))}, saved by ${whoOf(latest)}${when}`;
  };
  const chosen = (path: string) => choices[path] ?? 'theirs';

  return (
    <div ref={panel} className={shared.panel} role="alert" tabIndex={-1}>
      <BodyText>
        Since you started, someone else changed{' '}
        {files.length === 1 ? 'a file' : `${String(files.length)} files`} this save also
        changes.
      </BodyText>
      <BodyText tone="secondary">
        Nothing has been saved yet. For each file, keep their version or choose yours,
        then save. Everything else in your save goes in as it is.
      </BodyText>
      <ul className={formClasses.merge} aria-label="Files that differ">
        {files.map((file, index) => (
          <li key={file.path}>
            <RadioGroup
              label={file.label}
              value={chosen(file.path)}
              options={[
                { value: 'mine', label: `Yours: ${file.mine}` },
                { value: 'theirs', label: `Now: ${theirs(index)}` },
              ]}
              onChange={(value) =>
                setChoices((before) => ({
                  ...before,
                  [file.path]: value === 'mine' ? 'mine' : 'theirs',
                }))
              }
            />
          </li>
        ))}
      </ul>
      <div className={shared.actions}>
        <Button
          loading={busy}
          onClick={() =>
            onSave(
              new Set(
                files
                  .map((file) => file.path)
                  .filter((path) => chosen(path) === 'mine'),
              ),
            )
          }
        >
          Save the merged version
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => setWarning(true)}>
          Save mine over theirs
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDrop}>
          Discard my changes
        </Button>
      </div>
      <Modal
        opened={warning}
        onClose={() => setWarning(false)}
        title="Save yours over theirs?"
      >
        <div className={shared.stack}>
          <BodyText>
            This throws away what the other person saved in{' '}
            {files.map((file) => file.label).join(', ')}. Their versions stay in the
            task’s history. Picking a side for each file keeps the rest of their work.
          </BodyText>
          <div className={shared.actions}>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                setWarning(false);
                onSave(new Set(files.map((file) => file.path)));
              }}
            >
              Save mine over theirs
            </Button>
            <Button variant="secondary" onClick={() => setWarning(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
