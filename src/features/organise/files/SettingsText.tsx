import { Fragment, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { DefinitionError, FileChange, FileContent } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestPath } from '@/lib/organiser-paths';
import { TASK_BUILD_CARDS, contestSectionPath, taskCardPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import { contestPlaceOf } from '../contest/opened';
import { readContest } from '../forms/contest-values';
import { readTask } from '../forms/task-values';
import { parseYaml, topMap } from '../forms/yaml-doc';
import { taskPlaceOf } from '../task/places';
import { definitionErrorsOf } from './refusals';
import type { Place } from './place';
import shared from '../organise.module.css';

/**
 * A place's settings file, `contest.yaml` or `task.yaml`: changed only on the
 * place's pages, and shown here to read and check, with every change to it.
 * When it does not read, so those pages cannot change it, the page says why
 * and offers its admins the text, with each problem named; the pages come
 * back once it reads.
 */

/** The keys of `task.yaml` the task's page has a field for. */
const TASK_KEYS = [
  'name',
  'workflow',
  'inputs',
  'repeat',
  'scoring',
  'checks',
  'submissions',
];

/**
 * Why the settings do not read, and the problems the forge names in them,
 * or null when they read. Settings that are not a list of settings do not
 * read; nor do ones holding a key in a shape the pages cannot read, or, for a
 * task, a key the task's page has no field for; nor, for a contest, ones the
 * forge refuses as they are, which no save of its pages could get past.
 */
function useUnread(
  place: Place,
  file: FileContent,
): { reason: string | null; problems: DefinitionError[] } | null {
  const path = { org: place.org, contest: place.contest };
  const task = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}',
    { params: { path: { ...path, task: place.kind === 'task' ? place.task : '' } } },
    { enabled: place.kind === 'task' },
  );
  const standings = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/organise/tasks',
    { params: { path } },
    { enabled: place.kind === 'contest', retry: false },
  );
  if (file.encoding !== 'utf-8')
    return { reason: 'The file is not text.', problems: [] };
  const parsed = parseYaml(file.content);
  if ('error' in parsed) return { reason: parsed.error, problems: [] };
  if (topMap(parsed.doc) === 'not-a-mapping') {
    return { reason: 'The file does not hold a list of settings.', problems: [] };
  }
  const unreadable =
    place.kind === 'task'
      ? readTask(parsed.doc).unreadable
      : readContest(parsed.doc).unreadable;
  const reason =
    unreadable.length === 0 ? null : `The pages cannot read ${unreadable.join(', ')}.`;
  if (place.kind === 'task') {
    const problems = (task.data?.errors ?? []).filter((error) => {
      const top = /^[^.[/]*/.exec(error.path)?.[0] ?? '';
      return (
        top !== '' &&
        !TASK_KEYS.includes(top) &&
        !error.path.includes('/') &&
        top !== 'statement'
      );
    });
    return reason === null && problems.length === 0 ? null : { reason, problems };
  }
  const refused =
    standings.isError && toApiError(standings.error).code === 'invalid_definition'
      ? definitionErrorsOf(toApiError(standings.error))
      : [];
  return reason === null && refused.length === 0 ? null : { reason, problems: refused };
}

/** Who made a change, by the username the history names them by. */
function authorName(change: FileChange): string {
  if (change.author !== null) return change.author;
  if (change.author_id === null) return 'an unknown author';
  return `account ${String(change.author_id)}`;
}

/** The contest's settings as they were at one version, to read. */
function Version({
  place,
  version,
}: {
  place: Extract<Place, { kind: 'contest' }>;
  version: string;
}) {
  const view = queryView(
    useQuery({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/files/{path}',
        {
          params: {
            path: { org: place.org, contest: place.contest, path: 'contest.yaml' },
            query: { at: version },
          },
        },
      ),
      // A version never changes, so once read it is never read again.
      staleTime: Infinity,
    }),
  );
  return (
    <Loaded view={view} rows={4}>
      {(read) => (
        <CodeEditor
          label={`The settings as they were on ${version.slice(0, 7)}`}
          value={read.content}
          language="yaml"
          rows={12}
          readOnly
        />
      )}
    </Loaded>
  );
}

/** Every change made to the contest's settings, each opened to read as it was. */
function ContestChanges({ place }: { place: Extract<Place, { kind: 'contest' }> }) {
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
      <div className={shared.actions}>
        <Button size="xs" variant="secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide the changes' : 'Every change'}
        </Button>
      </div>
      {open && (
        <Loaded view={history} rows={3}>
          {(changes) => (
            <ol className={shared.list} aria-label="Changes to the settings">
              {changes.map((change, at) => (
                <li key={change.version}>
                  <BodyText>{change.message}</BodyText>
                  <BodyText tone="secondary">
                    {authorName(change)} · {formatDateTime(new Date(change.at))}
                    {at === 0 && ' · as they are now'}
                  </BodyText>
                  {at > 0 && (
                    <div className={shared.actions}>
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
                    </div>
                  )}
                  {viewing === change.version && (
                    <Version place={place} version={change.version} />
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

/**
 * Where the settings are changed, as links to the pages that change them.
 * Both settings files are read on the page whose form changes the rest of
 * them, so that form is the one above, not a link to the page itself.
 */
function WhereChanged({ place }: { place: Place }) {
  if (place.kind === 'task') {
    const { org, contest, task } = place;
    // Every card of the task's page but the statement, which is a file of its own.
    const cards = TASK_BUILD_CARDS.filter((card) => card.key !== 'statement');
    return (
      <BodyText>
        The task’s settings as they are stored, for reading only. They are changed on
        the task’s page: its{' '}
        {cards.map((card, at) => (
          <Fragment key={card.key}>
            {at === 0 ? '' : at === cards.length - 1 ? ' and ' : ', '}
            <PageLink to={taskCardPath(org, contest, task, card.key)}>
              {card.label}
            </PageLink>
          </Fragment>
        ))}{' '}
        cards, and its title in the form above.
      </BodyText>
    );
  }
  const { org, contest } = place;
  return (
    <BodyText>
      The contest’s settings as they are stored, for reading only. They are changed on
      the contest’s pages: its{' '}
      <PageLink to={contestPath(org, contest)}>status and tasks</PageLink>,{' '}
      <PageLink to={contestSectionPath(org, contest, 'entry')}>
        How people enter
      </PageLink>{' '}
      and{' '}
      <PageLink to={contestSectionPath(org, contest, 'boards')}>Leaderboards</PageLink>,
      and the rest in the form above.
    </BodyText>
  );
}

/**
 * The settings file, to read, with where it is changed and every change to
 * it; or, when it does not read, why, with its problems, and for an admin
 * `editor`, the text to mend it in.
 */
export function SettingsText({
  place,
  file,
  admin,
  editor,
}: {
  place: Place;
  file: FileContent;
  admin: boolean;
  /** The settings as text to edit and save, for an admin while they do not read. */
  editor: ReactNode;
}) {
  const unread = useUnread(place, file);
  const label =
    place.kind === 'task' ? 'The task’s settings' : 'The contest’s settings';
  const placeOf =
    place.kind === 'task'
      ? taskPlaceOf(place.org, place.contest, place.task)
      : contestPlaceOf(place.org, place.contest, file.content);
  return (
    <div className={shared.stack}>
      {unread === null ? (
        <WhereChanged place={place} />
      ) : (
        <div className={shared.panel} role="alert">
          <BodyText>
            These settings cannot be read, so the pages cannot change them.
          </BodyText>
          {unread.reason !== null && (
            <BodyText tone="secondary">{unread.reason}</BodyText>
          )}
          <DefinitionErrors errors={unread.problems} placeOf={placeOf} />
          <BodyText tone="secondary">
            {admin
              ? 'Fix them here as text. The pages work again once the settings can be read.'
              : 'See who can on the organisers page.'}
          </BodyText>
        </div>
      )}
      {unread !== null && admin ? (
        editor
      ) : (
        <CodeEditor
          label={label}
          value={file.content}
          language="yaml"
          rows={18}
          readOnly
        />
      )}
      {place.kind === 'contest' && <ContestChanges place={place} />}
    </div>
  );
}
