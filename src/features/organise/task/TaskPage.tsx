import { $api, queryView } from '@/api/query';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatDateTime } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import { FileBrowser } from '../files/FileBrowser';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { GradingsSection } from './GradingsSection';
import { PeopleSection } from '../people/PeopleSection';
import { useTaskParams } from '@/lib/route-params';
import classes from '../organise.module.css';

/**
 * A task as its organiser sees it: where its files stand, every publication,
 * its gradings with their controls, and the files themselves. There is no publish button; saving a file is
 * the save, and the save's answer is shown beside the file. Every save
 * fetches the state and the publications again.
 */
export function TaskPage() {
  const { org, contest, task } = useTaskParams();
  const path = { org, contest, task };

  return (
    <div className={classes.page}>
      <PageTitle>{task}</PageTitle>
      <Card>
        <TaskStatus path={path} />
      </Card>
      <Card>
        <PublicationList path={path} />
      </Card>
      <Card>
        <GradingsSection path={path} />
      </Card>
      <Card>
        <AnnouncementsSection place={{ kind: 'task', ...path }} />
      </Card>
      <Card>
        <FileBrowser place={{ kind: 'task', ...path }} />
      </Card>
      <Card>
        <PeopleSection place={{ kind: 'task', ...path }} />
      </Card>
    </div>
  );
}

type TaskPath = { org: string; contest: string; task: string };

function TaskStatus({ path }: { path: TaskPath }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}', {
      params: { path },
    }),
  );

  return (
    <div className={classes.stack}>
      <SectionTitle>State</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && (
        <>
          <BodyText>
            {view.data.latest === null
              ? 'Not published yet.'
              : `Latest publication: ${String(view.data.latest.number)}.`}
          </BodyText>
          {view.data.draft ? (
            <>
              <BodyText>
                The files as they stand are a draft. They do not grade; the latest
                publication does.
              </BodyText>
              {view.data.errors.length > 0 ? (
                <>
                  <BodyText>What keeps the draft from publishing:</BodyText>
                  <DefinitionErrors errors={view.data.errors} />
                </>
              ) : (
                <BodyText tone="secondary">
                  It has no errors: it was held back, or it has not been saved since the
                  task was made.
                </BodyText>
              )}
            </>
          ) : (
            <BodyText tone="secondary">
              The files as they stand are the latest publication.
            </BodyText>
          )}
        </>
      )}
    </div>
  );
}

function PublicationList({ path }: { path: TaskPath }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/publications',
      { params: { path } },
    ),
  );

  return (
    <div className={classes.stack}>
      <SectionTitle>Publications</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText>None yet. The first valid save publishes.</BodyText>
        ) : (
          <ol className={classes.list} aria-label="Publications">
            {[...view.data].reverse().map((publication) => (
              <li key={publication.number}>
                <BodyText>
                  <strong>Publication {publication.number}</strong> ·{' '}
                  {formatDateTime(new Date(publication.at))} ·{' '}
                  {publication.grading_changed
                    ? 'changed how the task grades'
                    : 'grading unchanged'}
                </BodyText>
                {publication.changes.length > 0 && (
                  <ul className={classes.named}>
                    {publication.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}
