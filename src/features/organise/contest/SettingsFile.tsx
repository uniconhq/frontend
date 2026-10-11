import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { FileChange, FileContent } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestPath } from '@/lib/organiser-paths';
import { contestSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import shared from '../organise.module.css';

const FILE = '/api/v1/orgs/{org}/contests/{contest}/files/{path}';

/** Who made a change, by the username the history names them by. */
function authorName(change: FileChange): string {
  if (change.author !== null) return change.author;
  if (change.author_id === null) return 'an unknown author';
  return `account ${String(change.author_id)}`;
}

/** The settings as they were at one version, to read. */
function Version({
  org,
  contest,
  version,
}: {
  org: string;
  contest: string;
  version: string;
}) {
  const view = queryView(
    useQuery({
      ...$api.queryOptions('get', FILE, {
        params: {
          path: { org, contest, path: 'contest.yaml' },
          query: { at: version },
        },
      }),
      // A version never changes, so once read it is never read again.
      staleTime: Infinity,
    }),
  );
  return (
    <Loaded view={view} rows={4}>
      {(file) => (
        <CodeEditor
          label={`The settings as they were on ${version.slice(0, 7)}`}
          value={file.content}
          language="yaml"
          rows={12}
          readOnly
        />
      )}
    </Loaded>
  );
}

/**
 * The contest's settings as they are stored, to read and check, with every
 * change made to them, each one opened to read as it was. They are changed
 * only on the contest's pages, which it links to.
 */
export function SettingsFile({
  org,
  contest,
  file,
}: {
  org: string;
  contest: string;
  file: FileContent;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const history = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/history',
      { params: { path: { org, contest }, query: { path: 'contest.yaml' } } },
      { enabled: open },
    ),
  );
  return (
    <div className={shared.stack}>
      <BodyText>
        The contest’s settings as they are stored, to read. They are changed on the
        contest’s pages: its{' '}
        <PageLink to={contestPath(org, contest)}>status and tasks</PageLink>,{' '}
        <PageLink to={contestSectionPath(org, contest, 'settings')}>Settings</PageLink>,{' '}
        <PageLink to={contestSectionPath(org, contest, 'entry')}>
          How people enter
        </PageLink>{' '}
        and <PageLink to={contestSectionPath(org, contest, 'boards')}>Boards</PageLink>.
      </BodyText>
      <CodeEditor
        label="The contest’s settings"
        value={file.content}
        language="yaml"
        rows={18}
        readOnly
      />
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
                    <Version org={org} contest={contest} version={change.version} />
                  )}
                </li>
              ))}
            </ol>
          )}
        </Loaded>
      )}
    </div>
  );
}
