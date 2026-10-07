import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { Holder, Publication } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor, type CodeLanguage } from '@/ui/CodeEditor';
import { Modal } from '@/ui/Modal';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { useMe } from '@/session';
import { holdsAt } from '../roles';
import { useHolders } from '../people/holders';
import type { Place } from './place';
import { UploadedFile } from './UploadedFile';
import shared from '../organise.module.css';
import classes from './Files.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** A version is a commit; its first seven characters are how git shows one. */
function short(version: string): string {
  return version.slice(0, 7);
}

/**
 * Who made a change, by the username of someone holding a role at the task.
 * A change by someone who holds none here any more shows their account
 * number, and one whose author the forge could not match to an account says
 * so.
 */
function authorName(authorId: number | null, holders: Holder[] | undefined): string {
  if (authorId === null) return 'an unknown author';
  const holder = holders?.find((each) => each.user.id === authorId);
  return holder === undefined ? `account ${String(authorId)}` : holder.user.username;
}

/**
 * One file's history at a task, newest first: each version with who made it,
 * what they said and when, and the publication that froze it, with whether
 * that publication changed how the task grades. A publication is marked on
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
      <div className={shared.actions}>
        <Button
          size="xs"
          variant="secondary"
          label={`${open ? 'Hide' : 'Show'} the history of ${path}`}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide history' : 'History'}
        </Button>
      </div>
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
  const manages = holdsAt(useMe().roles, place, 'manager');
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
  const holders = useHolders(place, { enabled: true });
  const [viewing, setViewing] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  if (history.state === 'loading') return <PageSkeleton rows={3} />;
  if (history.state === 'error')
    return <ErrorBlock error={history.error} onRetry={history.retry} />;
  if (history.data.length === 0)
    return <BodyText tone="secondary">No versions of {path} yet.</BodyText>;

  const byVersion = new Map<string, Publication[]>();
  for (const publication of publications.data ?? []) {
    byVersion.set(publication.version, [
      ...(byVersion.get(publication.version) ?? []),
      publication,
    ]);
  }
  const current = history.data[0]?.version;

  const rollBack = async (version: string) => {
    setRolling(null);
    setViewing(null);
    await onRollBack(version);
  };

  return (
    <>
      <ol className={classes.history} aria-label={`History of ${path}`}>
        {history.data.map((change) => {
          const label = short(change.version);
          return (
            <li key={change.version} className={classes.version}>
              <BodyText>
                <code>{label}</code> {change.message}
              </BodyText>
              <BodyText tone="secondary">
                {authorName(change.author_id, holders.data)} ·{' '}
                {formatDateTime(new Date(change.at))}
                {change.version === current && ' · the file as it is now'}
              </BodyText>
              {(byVersion.get(change.version) ?? []).map((publication) => (
                <BodyText key={publication.number}>
                  <strong>Publication {publication.number}</strong> ·{' '}
                  {publication.grading_changed
                    ? 'changed how the task grades'
                    : 'grading unchanged'}
                </BodyText>
              ))}
              {change.version !== current && (
                <div className={shared.actions}>
                  <Button
                    size="xs"
                    variant="secondary"
                    label={`View ${path} at ${label}`}
                    onClick={() =>
                      setViewing(viewing === change.version ? null : change.version)
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
                </div>
              )}
              {viewing === change.version && (
                <OldVersion
                  place={place}
                  path={path}
                  version={change.version}
                  language={language}
                />
              )}
            </li>
          );
        })}
      </ol>
      <Modal
        opened={rolling !== null}
        onClose={() => setRolling(null)}
        title="Roll this file back?"
      >
        <div className={shared.stack}>
          <BodyText>
            {path} is written as it was at version <code>{short(rolling ?? '')}</code>,
            as a new version on top of the history, which keeps every version before it.
          </BodyText>
          <BodyText tone="secondary">
            It is a save of the task: it publishes, or keeps a draft, like any other.
            Unsaved text in the editor is replaced.
          </BodyText>
          <div className={shared.actions}>
            <Button onClick={() => rolling !== null && void rollBack(rolling)}>
              Roll back
            </Button>
            <Button variant="secondary" onClick={() => setRolling(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** The file as it was at one version, to read and copy from. */
function OldVersion({
  place,
  path,
  version,
  language,
}: {
  place: TaskPlace;
  path: string;
  version: string;
  language: CodeLanguage;
}) {
  const view = queryView(
    useQuery({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
        {
          params: {
            path: { org: place.org, contest: place.contest, task: place.task, path },
            query: { at: version },
          },
        },
      ),
      // A version never changes, so once read it is never read again.
      staleTime: Infinity,
    }),
  );

  if (view.state === 'loading') return <PageSkeleton rows={4} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.upload)
    return (
      <UploadedFile
        place={place}
        path={path}
        upload={view.data.upload}
        token={null}
        label={`${path} at ${short(version)}`}
      />
    );
  if (view.data.encoding === 'base64')
    return (
      <BodyText tone="secondary">
        Binary at this version. It cannot be shown as text.
      </BodyText>
    );
  return (
    <CodeEditor
      label={`${path} at ${short(version)}`}
      value={view.data.content}
      language={language}
      rows={12}
      readOnly
    />
  );
}
