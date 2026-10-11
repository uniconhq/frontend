import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { ratioOf } from '@/lib/exact';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Loaded } from '@/ui/feedback/Loaded';
import { taskCardPath } from '@/lib/sections';
import { fileQuery } from '../files/place';
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

/**
 * One task as the contest scores it: what it is worth and why, how each of
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
  const place = { kind: 'task' as const, org, contest, task };
  const file = queryView(useQuery({ ...fileQuery(place, 'task.yaml'), retry: false }));
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
      <Loaded view={file} rows={2}>
        {(read) => {
          const settings = readSettings(read);
          if ('error' in settings) {
            return <BodyText tone="secondary">Its settings do not read.</BodyText>;
          }
          const { groups, credit } = readTask(settings.doc, []).values;
          const total = taskWeight(groups);
          return (
            <ul className={shared.named}>
              <li>
                {total.num === 0n
                  ? 'It gives no points: it is ranked on what its workflow reports.'
                  : worth === null
                    ? `Worth ${pointsText(total)} points, its groups’ total.`
                    : `Worth ${pointsText(worth)} points, as the contest sets it; its groups total ${pointsText(total)}.`}
              </li>
              {total.num !== 0n &&
                groups.map((group) => (
                  <li key={group.name}>
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
                <li>No board counts it.</li>
              ) : (
                boards.map((board) => (
                  <li key={board.name}>
                    {board.name === '' ? 'A board' : board.name}: {boardSentence(board)}
                  </li>
                ))
              )}
            </ul>
          );
        }}
      </Loaded>
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
          Each task as entrants are told it scores: what it is worth, how its groups
          earn points, when it opens and closes, and the boards that count it.
        </BodyText>
        <Loaded view={view} rows={3}>
          {(standings) =>
            standings.length === 0 ? (
              <BodyText>No tasks yet, so nothing scores.</BodyText>
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
