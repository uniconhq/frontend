import { Fragment } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { RegradeSummary } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useMe } from '@/session';
import { contestSectionPath } from '@/lib/sections';
import { taskPath } from '@/lib/organiser-paths';
import { holdsAt } from '../roles';
import {
  REGRADES,
  causeWords,
  regradeOf,
  regradeSearch,
  regradedTask,
  runningWords,
  summaryParts,
  useRegrades,
} from './regrades';
import shared from '../organise.module.css';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

const DISMISS =
  '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/regrades/{regrade}/dismiss';

/**
 * One task's latest regrade in a line (#448): "Regrade of A: 120 graded · 2
 * failed on Unicon's side", each count a link to
 * Gradings showing those submissions with their earlier and new results,
 * where it lists just them;
 * what started it, by whom and when; whether it still runs; and, for a
 * manager of the task, Dismiss, which takes it off for everyone.
 */
function Summary({ path, summary }: { path: ContestPath; summary: RegradeSummary }) {
  const roles = useMe().roles;
  const queryClient = useQueryClient();
  const dismiss = $api.useMutation('post', DISMISS, {
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', REGRADES, { params: { path } }).queryKey,
      }),
  });
  const gradings = contestSectionPath(path.org, path.contest, 'gradings');
  const { task } = summary;
  const manages =
    task !== null && holdsAt(roles, { kind: 'task', ...path, task }, 'manager');
  const parts = summaryParts(summary);
  const running = runningWords(summary);
  const name = regradeOf(summary);
  return (
    <li className={classes.regrade} aria-label={name}>
      <BodyText>
        <strong>{name}:</strong>{' '}
        {parts.map((part, at) => (
          <Fragment key={part.key}>
            {at > 0 && <span className={classes.dot}> · </span>}
            {part.linked ? (
              <PageLink to={`${gradings}?${regradeSearch(summary.id, part.change)}`}>
                {part.words}
              </PageLink>
            ) : (
              part.words
            )}
          </Fragment>
        ))}
      </BodyText>
      <BodyText tone="secondary">
        {causeWords(summary)}
        {running !== null && ` ${running}`}
      </BodyText>
      {dismiss.error !== null && <ErrorBlock error={dismiss.error} compact />}
      {task !== null && (
        <PageLink
          to={`${taskPath(path.org, path.contest, task)}/regrades/${summary.id}`}
        >
          What it changed
        </PageLink>
      )}
      {manages && (
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            label={`Dismiss the regrade of ${regradedTask(summary)}`}
            loading={dismiss.isPending}
            onClick={() =>
              dismiss.mutate({
                params: { path: { ...path, task, regrade: summary.id } },
              })
            }
          >
            Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * What the latest regrade of each task changed, on the contest's page and on
 * Gradings, so a broken checker or compiler is seen at once: one line per
 * task, newest first, until a newer regrade replaces it or a manager
 * dismisses it. Nothing while there is none, or while they cannot be read.
 */
export function RegradeSummaries({ path }: { path: ContestPath }) {
  const summaries = useRegrades(path).data ?? [];
  if (summaries.length === 0) return null;
  return (
    <section className={shared.panel} aria-label="Regrades">
      <ul className={classes.regrades}>
        {summaries.map((summary) => (
          <Summary key={summary.id} path={path} summary={summary} />
        ))}
      </ul>
    </section>
  );
}
