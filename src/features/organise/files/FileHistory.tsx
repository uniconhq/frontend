import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { FileChange, Publication } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor, type CodeLanguage } from '@/ui/CodeEditor';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Loaded } from '@/ui/feedback/Loaded';
import { Group } from '@/ui/layout';
import { formatDateTime } from '@/lib/time';
import { usePlaceMay } from '../may';
import { fileQuery, type Place } from './place';
import { UploadedFile } from './UploadedFile';
import shared from '../organise.module.css';
import classes from './Files.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** A version is a commit; its first seven characters are how git shows one. */
function short(version: string): string {
  return version.slice(0, 7);
}

/**
 * Who made a change, by the username the history names them by, whether or
 * not they still hold a role. One whose account the forge no longer knows
 * shows its number, and one it could not match to an account says so.
 */
function authorName(change: FileChange): string {
  if (change.author !== null) return change.author;
  if (change.author_id === null) return 'an unknown author';
  return `account ${String(change.author_id)}`;
}

/** Who made a change and when, and `now` when it is the latest. */
function Made({ change, now }: { change: FileChange; now: string | null }) {
  return (
    <BodyText tone="secondary">
      {authorName(change)} · {formatDateTime(new Date(change.at))}
      {now !== null && ` · ${now}`}
    </BodyText>
  );
}

/**
 * One file's history at a task, newest first: each version with who made it,
 * what they said and when, and the publication that froze it, saying when
 * one after the first changed how the task grades. A publication is marked on
 * the version it points at; one that froze a later change to another file is
 * on that file's history instead. It is read when it is opened, and again
 * after every save.
 *
 * An older version opens below the list, read-only. A manager rolls the file
 * back to one, after saying so in a dialog: the forge writes the old content
 * as a new version on top, so nothing in the history is rewritten, and the
 * rollback is a save of the task like any other, whose answer the editor
 * shows. `onRollBack` makes it; `busy` is the editor's own, so a rollback and
 * a save never run at once.
 */
export function FileHistory({
  place,
  path,
  language,
  busy,
  onRollBack,
}: {
  place: TaskPlace;
  path: string;
  language: CodeLanguage;
  busy: boolean;
  onRollBack: (version: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={shared.stack}>
      <Group gap="xs">
        <Button
          size="xs"
          variant="secondary"
          label={`${open ? 'Hide' : 'Show'} the history of ${path}`}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide history' : 'History'}
        </Button>
      </Group>
      {open && (
        <Versions
          place={place}
          path={path}
          language={language}
          busy={busy}
          onRollBack={onRollBack}
        />
      )}
    </div>
  );
}

function Versions({
  place,
  path,
  language,
  busy,
  onRollBack,
}: {
  place: TaskPlace;
  path: string;
  language: CodeLanguage;
  busy: boolean;
  onRollBack: (version: string) => Promise<void>;
}) {
  const where = { org: place.org, contest: place.contest, task: place.task };
  const manages = usePlaceMay(place).manage;
  const history = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/history', {
      params: { path: where, query: { path } },
    }),
  );
  const publications = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/publications',
    { params: { path: where } },
  );
  const [viewing, setViewing] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  return (
    <Loaded view={history} rows={3}>
      {(changes) => {
        if (changes.length === 0)
          return <BodyText tone="secondary">No versions of {path} yet.</BodyText>;

        const byVersion = new Map<string, Publication[]>();
        for (const publication of publications.data ?? []) {
          byVersion.set(publication.version, [
            ...(byVersion.get(publication.version) ?? []),
            publication,
          ]);
        }
        const current = changes[0]?.version;
        const rollingTo = changes.find((change) => change.version === rolling);

        const rollBack = async (version: string) => {
          setRolling(null);
          setViewing(null);
          await onRollBack(version);
        };
        return (
          <>
            <ol className={classes.history} aria-label={`History of ${path}`}>
              {changes.map((change) => {
                const label = short(change.version);
                return (
                  <li key={change.version} className={classes.version}>
                    <BodyText>
                      <code>{label}</code> {change.message}
                    </BodyText>
                    <Made
                      change={change}
                      now={change.version === current ? 'the file as it is now' : null}
                    />
                    {(byVersion.get(change.version) ?? []).map((publication) => (
                      <BodyText key={publication.number}>
                        <strong>Publication {publication.number}</strong>
                        {publication.grading_changed &&
                          publication.number > 1 &&
                          ' · changed how the task grades'}
                      </BodyText>
                    ))}
                    {change.version !== current && (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="secondary"
                          label={`View ${path} at ${label}`}
                          onClick={() =>
                            setViewing(
                              viewing === change.version ? null : change.version,
                            )
                          }
                        >
                          {viewing === change.version ? 'Close' : 'View'}
                        </Button>
                        {manages && (
                          <Button
                            size="xs"
                            variant="secondary"
                            label={`Roll ${path} back to ${label}`}
                            disabled={busy}
                            onClick={() => setRolling(change.version)}
                          >
                            Roll back to this
                          </Button>
                        )}
                      </Group>
                    )}
                    {viewing === change.version && (
                      <OldVersion
                        place={place}
                        path={path}
                        version={change.version}
                        language={language}
                        label={`${path} at ${label}`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            <ConfirmDialog
              opened={rolling !== null}
              onClose={() => setRolling(null)}
              title="Roll this file back?"
              confirm="Roll back"
              onConfirm={() => rolling !== null && void rollBack(rolling)}
            >
              <BodyText>
                {path} goes back to how it was{' '}
                {rollingTo === undefined
                  ? 'at the version chosen'
                  : `on ${formatDateTime(new Date(rollingTo.at))}, after “${rollingTo.message}”`}
                . This is saved as a new change, and every earlier one stays in the
                history.
              </BodyText>
              <BodyText tone="secondary">
                Like any save of the task, it publishes the task, or keeps it as a draft
                if it has problems. Unsaved text in the editor is replaced.
              </BodyText>
            </ConfirmDialog>
          </>
        );
      }}
    </Loaded>
  );
}

/**
 * Every change made to the contest's settings, each opened to read as it
 * was. Unlike a task's file it is not rolled back here.
 */
export function ContestChanges({
  place,
}: {
  place: Extract<Place, { kind: 'contest' }>;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const history = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/history',
      {
        params: {
          path: { org: place.org, contest: place.contest },
          query: { path: 'contest.yaml' },
        },
      },
      { enabled: open },
    ),
  );
  return (
    <>
      <Group gap="xs">
        <Button size="xs" variant="secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide the changes' : 'Every change'}
        </Button>
      </Group>
      {open && (
        <Loaded view={history} rows={3}>
          {(changes) => (
            <ol className={shared.list} aria-label="Changes to the settings">
              {changes.map((change, at) => (
                <li key={change.version}>
                  <BodyText>{change.message}</BodyText>
                  <Made change={change} now={at === 0 ? 'as they are now' : null} />
                  {at > 0 && (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="secondary"
                        label={`Read the settings as they were on ${formatDateTime(new Date(change.at))}`}
                        onClick={() =>
                          setViewing(viewing === change.version ? null : change.version)
                        }
                      >
                        {viewing === change.version ? 'Close' : 'Read'}
                      </Button>
                    </Group>
                  )}
                  {viewing === change.version && (
                    <OldVersion
                      place={place}
                      path="contest.yaml"
                      version={change.version}
                      language="yaml"
                      label={`The settings as they were on ${short(change.version)}`}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </Loaded>
      )}
    </>
  );
}

/** A file as it was at one version, to read and copy from, named `label`. */
function OldVersion({
  place,
  path,
  version,
  language,
  label,
}: {
  place: Place;
  path: string;
  version: string;
  language: CodeLanguage;
  label: string;
}) {
  const view = queryView(
    useQuery({
      ...fileQuery(place, path, version),
      // A version never changes, so once read it is never read again.
      staleTime: Infinity,
    }),
  );

  return (
    <Loaded view={view} rows={4}>
      {(file) => {
        if (file.upload)
          return (
            <UploadedFile
              place={place}
              path={path}
              upload={file.upload}
              token={null}
              label={label}
            />
          );
        if (file.encoding === 'base64')
          return (
            <BodyText tone="secondary">
              At this version the file is not text, so it cannot be shown here.
            </BodyText>
          );
        return (
          <CodeEditor
            label={label}
            value={file.content}
            language={language}
            rows={12}
            readOnly
          />
        );
      }}
    </Loaded>
  );
}
