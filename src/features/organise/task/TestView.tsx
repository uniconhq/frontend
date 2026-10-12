import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { DeclaredField, FileContent, TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { formatSize } from '@/lib/size';
import { ChosenFile, SavedFile, SavedFolder } from '../files/FilePreview';
import { fileQuery, treeQuery } from '../files/place';
import { isRecord, parseYaml, textAt, valueAt } from '../forms/yaml-doc';
import { lastPart, type TaskPlace } from './build-data';
import { partOf } from './parts';
import type { StagedTest } from './staged';
import classes from './task.module.css';

/** Parts in the workflow's order, any it does not name after them by name. */
function inOrder<T>(items: T[], partOf: (item: T) => string, order: string[]): T[] {
  const rank = (part: string) => {
    const at = order.indexOf(part);
    return at < 0 ? order.length : at;
  };
  return [...items].sort(
    (a, b) => rank(partOf(a)) - rank(partOf(b)) || partOf(a).localeCompare(partOf(b)),
  );
}

/** A test's values, field by field, as its `test.yaml` or a change gives them. */
function Values({ values }: { values: [string, string][] }) {
  if (values.length === 0) {
    return <BodyText tone="secondary">No values are given.</BodyText>;
  }
  return (
    <dl className={classes.values}>
      {values.map(([field, value]) => (
        <div key={field}>
          <dt>{field}</dt>
          <dd>{value === '' ? 'Not given' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A saved test's values, read from its `test.yaml`. */
function SavedValues({
  place,
  path,
  fields,
}: {
  place: TaskPlace;
  path: string;
  fields: DeclaredField[];
}) {
  const view = queryView(useQuery(fileQuery(place, path)));
  return (
    <section className={classes.testValues} aria-label="Its values">
      <p className={classes.partTitle}>Its values</p>
      <Loaded view={view} compact>
        {(file: FileContent) => {
          const parsed = file.encoding === 'utf-8' ? parseYaml(file.content) : null;
          if (
            parsed === null ||
            'error' in parsed ||
            !isRecord(valueAt(parsed.doc, []))
          ) {
            return <BodyText tone="secondary">Its values cannot be read.</BodyText>;
          }
          const top = valueAt(parsed.doc, []) as Record<string, unknown>;
          const names =
            fields.length > 0 ? fields.map((field) => field.name) : Object.keys(top);
          return (
            <Values values={names.map((name) => [name, textAt(parsed.doc, [name])])} />
          );
        }}
      </Loaded>
    </section>
  );
}

/** A saved test: each part as it is now, side by side, then its values. */
function SavedTest({
  place,
  folder,
  fields,
}: {
  place: TaskPlace;
  folder: string;
  fields: DeclaredField[] | null;
}) {
  const view = queryView(useQuery(treeQuery(place, folder)));
  const order = (fields ?? []).map((field) => field.name);
  const valueFields = (fields ?? []).filter(
    (field) => field.type !== 'file' && field.type !== 'folder',
  );
  return (
    <Loaded view={view} compact>
      {(entries: TreeEntry[]) => {
        const parts = inOrder(
          entries.filter((entry) => lastPart(entry.path) !== 'test.yaml'),
          (entry) => partOf(lastPart(entry.path)),
          order,
        );
        const values = entries.find((entry) => lastPart(entry.path) === 'test.yaml');
        return (
          <>
            {parts.length === 0 ? (
              <BodyText tone="secondary">It has no files.</BodyText>
            ) : (
              <div className={classes.parts}>
                {parts.map((entry) => {
                  const title = partOf(lastPart(entry.path));
                  return entry.kind === 'directory' ? (
                    <SavedFolder
                      key={entry.path}
                      place={place}
                      path={entry.path}
                      title={title}
                    />
                  ) : (
                    <SavedFile
                      key={entry.path}
                      place={place}
                      path={entry.path}
                      title={title}
                      size={entry.size}
                      upload={entry.upload}
                      listedAt={entry.version}
                    />
                  );
                })}
              </div>
            )}
            {values !== undefined ? (
              <SavedValues place={place} path={values.path} fields={valueFields} />
            ) : (
              valueFields.length > 0 && (
                <BodyText tone="secondary">It has no values yet.</BodyText>
              )
            )}
          </>
        );
      }}
    </Loaded>
  );
}

/** A test added or replaced and not saved yet: its parts from the files chosen. */
function ChosenTest({ test, order }: { test: StagedTest; order: string[] }) {
  const byPart = new Map<string, StagedTest['files']>();
  for (const file of test.files) {
    byPart.set(file.field, [...(byPart.get(file.field) ?? []), file]);
  }
  const parts = inOrder([...byPart.entries()], ([part]) => part, order);
  return (
    <>
      {parts.length === 0 ? (
        <BodyText tone="secondary">Its files stay as they are.</BodyText>
      ) : (
        <div className={classes.parts}>
          {parts.map(([part, files]) => {
            const [only] = files;
            if (files.length === 1 && only !== undefined && !only.entry.includes('/')) {
              return (
                <ChosenFile
                  key={part}
                  title={part}
                  name={only.source.path.split('/').pop() ?? part}
                  size={only.source.size}
                  read={only.source.read}
                />
              );
            }
            return (
              <section key={part} className={classes.testValues} aria-label={part}>
                <p className={classes.partTitle}>{part}, a folder</p>
                <ul className={classes.folderFiles}>
                  {files.map((file) => (
                    <li key={file.entry}>
                      {file.entry.slice(part.length + 1)} ·{' '}
                      {formatSize(file.source.size)}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {test.values !== null && (
        <section className={classes.testValues} aria-label="Its values">
          <p className={classes.partTitle}>Its values</p>
          <Values values={Object.entries(test.values)} />
        </section>
      )}
    </>
  );
}

/**
 * A test opened in place (M50): each part side by side, with its size and
 * its first lines, Show all and Download; a part that is not text or is too
 * big, or was uploaded, by its size; a folder as a small tree; and the
 * test's own values. A test added or replaced shows the files chosen for it.
 */
export function TestView({
  place,
  group,
  test,
  fields,
  staged,
}: {
  place: TaskPlace;
  group: string;
  test: string;
  fields: DeclaredField[] | null;
  staged: StagedTest | undefined;
}) {
  const order = (fields ?? []).map((field) => field.name);
  return (
    <div
      className={classes.testView}
      aria-label={`What test ${test} holds`}
      role="region"
    >
      {staged !== undefined ? (
        <ChosenTest test={staged} order={order} />
      ) : (
        <SavedTest place={place} folder={`tests/${group}/${test}`} fields={fields} />
      )}
    </div>
  );
}
