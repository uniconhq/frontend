import { useRef, useState } from 'react';
import type { RunShown, ShownFile, TaskRun } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { OutLink } from '@/ui/OutLink';
import {
  entryTitle,
  groupsOf,
  pathName,
  runTitle,
  shownPath,
  tupleLine,
} from './scored-text';
import classes from './scored.module.css';

/**
 * Where an input shown as a file or a folder is, so the page can list its
 * files when it is opened: a run's, by its entry's `of` and its place
 * there, or a setting the task shows, with neither.
 */
export type FilesAsk = { group: string | null; place: number | null; name: string };

/** Lists the files of a shown input, each by its address at the download door. */
export type ReadFiles = (ask: FilesAsk) => Promise<ShownFile[]>;

/**
 * A shown input that is a file or a folder: its name, and its files once
 * opened, each a download. Without `readFiles` it is its name alone.
 */
function OpenFiles({
  label,
  value,
  ask,
  readFiles,
}: {
  /** What its files are called, where its name alone is shared by others on the page. */
  label: string;
  value: { path: string; folder: boolean };
  ask: FilesAsk;
  readFiles?: ReadFiles;
}) {
  const [files, setFiles] = useState<ShownFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const shown = pathName(value);
  if (readFiles === undefined) return <BodyText>{shown}</BodyText>;
  if (files !== null) {
    if (files.length === 0)
      return <BodyText tone="secondary">{`${shown} is empty.`}</BodyText>;
    return (
      <ul className={classes.files} aria-label={label}>
        {files.map((file) => (
          <li key={file.download}>
            <OutLink href={file.download}>{file.path ?? shown}</OutLink>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        label={label}
        onClick={() => {
          if (asked.current) return;
          asked.current = true;
          void readFiles(ask)
            .then((found) => {
              setFailed(false);
              setFiles(found);
            })
            .catch(() => {
              asked.current = false;
              setFailed(true);
            });
        }}
      >
        {shown}
      </Button>
      {failed && <BodyText tone="secondary">These files could not be listed.</BodyText>}
    </>
  );
}

/**
 * The task's settings a page shows, by name: a number or text as it is, and
 * a file or a folder by its name, its files listed when it is opened.
 */
export function ShownInputs({
  inputs,
  readFiles,
}: {
  inputs: Record<string, unknown>;
  readFiles?: ReadFiles;
}) {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return null;
  return (
    <dl className={classes.metrics} aria-label="Inputs">
      {entries.map(([name, value]) => {
        const path = shownPath(value);
        return (
          <div key={name} className={classes.metric}>
            <dt>{name}</dt>
            <dd>
              {path === null ? (
                String(value)
              ) : (
                <OpenFiles
                  label={`Files of ${name}`}
                  value={path}
                  ask={{ group: null, place: null, name }}
                  readFiles={readFiles}
                />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The rows a run came from, in a line, and each input of theirs shown as a file or folder. */
export function RunInputs({
  run,
  readFiles,
}: {
  run: {
    group: string;
    place: number;
    tuples: RunShown['tuples'];
    labelled?: RunShown['labelled'];
  };
  readFiles?: ReadFiles;
}) {
  const line = tupleLine(run.tuples);
  const files = run.tuples.flatMap((tuple) =>
    Object.entries(tuple.key).flatMap(([name, value]) => {
      const path = shownPath(value);
      return path === null ? [] : [{ name, path }];
    }),
  );
  return (
    <>
      {line !== '' && <BodyText>{line}</BodyText>}
      {readFiles !== undefined &&
        files.map(({ name, path }) => (
          <OpenFiles
            key={name}
            label={`Files of ${name}, ${entryTitle(run.group)} ${runTitle(run)}`}
            value={path}
            ask={{ group: run.group, place: run.place, name }}
            readFiles={readFiles}
          />
        ))}
    </>
  );
}

/**
 * What a task's page shows before any submission: the settings its show
 * names, and each run an entry names with the inputs it names, under the
 * entry's `of`. Nothing when it shows neither. A run given `fields`, as a
 * preview with no submission gives it, says where they will appear.
 */
export function ShownTask({
  runs,
  inputs,
  readFiles,
}: {
  runs: (TaskRun & { fields?: string[] })[];
  inputs: Record<string, unknown>;
  readFiles?: ReadFiles;
}) {
  if (runs.length === 0 && Object.keys(inputs).length === 0) return null;
  return (
    <div className={classes.stack}>
      <ShownInputs inputs={inputs} readFiles={readFiles} />
      {groupsOf(runs).map((group) => (
        <section
          key={group.name}
          aria-label={`Group ${entryTitle(group.name)}`}
          className={classes.stack}
        >
          <BodyText>{entryTitle(group.name)}</BodyText>
          {group.runs.map((run) => (
            <div key={String(run.place)} className={classes.run}>
              <BodyText>{runTitle(run)}</BodyText>
              <RunInputs run={run} readFiles={readFiles} />
              {run.fields !== undefined && run.fields.length > 0 && (
                <BodyText tone="secondary">{`${run.fields.join(', ')} ${run.fields.length === 1 ? 'appears' : 'appear'} here`}</BodyText>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
