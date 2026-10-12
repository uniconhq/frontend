import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { ratioOf, type Ratio } from '@/lib/exact';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Loaded } from '@/ui/feedback/Loaded';
import { taskCardPath } from '@/lib/sections';
import type { ContestValues } from '../forms/contest-values';
import { boardSentence } from '../forms/board-words';
import { readTask } from '../forms/task-values';
import { readSettings } from '../task/build-data';
import { groupSentence, pointsText, taskWeight } from '../task/scoring';
import { useContestSettings } from './settings';
import { markedBoardCovers, timelineSentence } from './timeline';
import shared from '../organise.module.css';
import classes from './contest.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';

/** A number of points with its word: "1 point", "2.5 points". */
function pointsOf(value: Ratio): string {
  const text = pointsText(value);
  return `${text} ${text === '1' ? 'point' : 'points'}`;
}

/**
 * One task as the contest scores it, as its latest publication has it: what it is worth and why, how each of
 * its groups earns points, as an entrant is told, its timeline, and each
 * board that counts it, a sentence each.
 */
function TaskScoring({
  org,
  contest,
  standing,
  values,
}: {
  org: string;
  contest: string;
  standing: TaskStanding;
  values: ContestValues | null;
}) {
  const task = standing.task.name;
  const latest = standing.state.latest;
  // What entrants are told is the latest publication, not a draft saved since.
  const file = queryView(
    useQuery({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
        {
          params: {
            path: { org, contest, task, path: 'task.yaml' },
            query: { at: latest?.version ?? '' },
          },
        },
      ),
      enabled: latest !== null,
      // A publication never changes, so once read it is never read again.
      staleTime: Infinity,
      retry: false,
    }),
  );
  const entry = values?.tasks.find((found) => found.id === task);
  const worthText = entry?.worth.trim() ?? '';
  const worth = worthText === '' ? null : ratioOf(worthText);
  const marks =
    values !== null && markedBoardCovers(values, task)
      ? entry === undefined || entry.marks === ''
        ? '1'
        : entry.marks
      : null;
  const boards = (values?.boards ?? []).filter(
    (board) => board.tasks === null || board.tasks.includes(task),
  );
  const label = `${standing.label} · ${task}`;

  return (
    <section className={shared.stack} aria-label={label}>
      <SectionTitle order={3}>
        <PageLink to={taskCardPath(org, contest, task, 'tests')}>{label}</PageLink>
      </SectionTitle>
      {latest === null ? (
        <BodyText tone="secondary">
          Not published yet, so entrants are told nothing of it.
        </BodyText>
      ) : (
        <Loaded view={file} rows={2}>
          {(read) => {
            const settings = readSettings(read);
            if ('error' in settings) {
              return <BodyText tone="secondary">Its settings cannot be read.</BodyText>;
            }
            const { values: parsed, unreadable } = readTask(settings.doc, []);
            if (unreadable.includes('test_groups')) {
              return (
                <BodyText tone="secondary">Its test groups cannot be read.</BodyText>
              );
            }
            const { groups, credit } = parsed;
            const total = taskWeight(groups);
            return (
              <ul className={shared.named}>
                <li>
                  {total.num === 0n
                    ? 'It gives no points: it is ranked on what its workflow reports.'
                    : worth === null
                      ? `Worth ${pointsOf(total)}, its test groups’ total.`
                      : `Worth ${pointsOf(worth)}, as the contest sets it. Its test groups total ${pointsText(total)}.`}
                </li>
                {total.num !== 0n &&
                  groups.map((group) => (
                    <li key={group.name}>
                      Test group “{group.name}”:{' '}
                      {groupSentence(group, {
                        total,
                        worth,
                        credit: credit.kind,
                        tests: null,
                      })}
                    </li>
                  ))}
                <li>
                  {timelineSentence(standing, values, marks).replace(/^./, (first) =>
                    first.toUpperCase(),
                  )}
                  .
                </li>
                {boards.length === 0 ? (
                  <li>No leaderboard counts it.</li>
                ) : (
                  boards.map((board) => (
                    <li key={board.name}>
                      {board.name === '' ? 'A leaderboard' : board.name}:{' '}
                      {boardSentence(board)}
                    </li>
                  ))
                )}
              </ul>
            );
          }}
        </Loaded>
      )}
    </section>
  );
}

/**
 * How this contest is scored (M35): each task, in the contest's order, with
 * its worth, its groups' rules, its timeline and the boards that count it,
 * each a sentence. The one place to check the whole contest before it starts.
 */
export function ContestScoring({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery(
      'get',
      STANDINGS,
      { params: { path: { org, contest } } },
      { staleTime: 0, retry: false },
    ),
  );
  const settings = useContestSettings(org, contest);
  const values = settings.state === 'ready' ? settings.data : null;
  if (view.state === 'error') return null;
  return (
    <Card>
      <section className={shared.stack} aria-label="How this contest is scored">
        <SectionTitle>How this contest is scored</SectionTitle>
        <BodyText tone="secondary">
          How each task scores, as entrants are told it: what it is worth, how its test
          groups earn points, when it opens and closes, and the leaderboards that count
          it.
        </BodyText>
        <Loaded view={view} rows={3}>
          {(standings) =>
            standings.length === 0 ? (
              <BodyText>There are no tasks yet, so nothing is scored.</BodyText>
            ) : (
              <div className={classes.scoring}>
                {standings.map((standing) => (
                  <TaskScoring
                    key={standing.task.name}
                    org={org}
                    contest={contest}
                    standing={standing}
                    values={values}
                  />
                ))}
              </div>
            )
          }
        </Loaded>
      </section>
    </Card>
  );
}
