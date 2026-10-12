import { useQuery } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { compareRatio, ratioOf } from '@/lib/exact';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Loaded } from '@/ui/feedback/Loaded';
import { taskCardPath } from '@/lib/sections';
import type { ContestValues } from '../forms/contest-values';
import { boardSentence } from '../forms/board-words';
import { useTestFolders } from '../task/build-data';
import { groupSentence, pointsText, taskWeight } from '../task/scoring';
import { heldOf, publishedQuery, readPublished } from './published';
import { useContestSettings } from './settings';
import { markedBoardCovers, timelineWords } from './timeline';
import shared from '../organise.module.css';
import classes from './contest.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';
const ONE = { num: 1n, den: 1n };

/** A sentence put after a colon, its first letter made small. */
function afterColon(sentence: string): string {
  return sentence.replace(/^./, (first) => first.toLowerCase());
}

/**
 * One task as the contest scores it, as its latest publication has it: in
 * its heading, what it is worth and when it is open; then each test group,
 * its points and what earns them, with a worked example from its own tests,
 * in the words the task's Tests card uses; and each board that counts it,
 * in the words of the Leaderboards page, saying when results join it only
 * where that changes something (M52).
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
  const file = queryView(
    useQuery({
      ...publishedQuery(org, contest, task, latest?.version ?? ''),
      enabled: latest !== null,
    }),
  );
  // The tests as they are now are the published ones while no draft is on top.
  const folders = useTestFolders({ kind: 'task', org, contest, task });
  const counts =
    folders.state === 'ready' && !standing.state.draft
      ? new Map(folders.data.map((folder) => [folder.name, folder.tests.length]))
      : null;
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
  const timeline = timelineWords(standing, values, marks);

  return (
    <section className={shared.stack} aria-label={label}>
      <SectionTitle order={3}>
        <PageLink to={taskCardPath(org, contest, task, 'tests')}>{label}</PageLink>
        <span className={classes.titleRest}>
          : {timeline.worth}, {timeline.when}
        </span>
      </SectionTitle>
      {latest === null ? (
        <BodyText tone="secondary">
          Not published yet, so entrants are told nothing of it.
        </BodyText>
      ) : (
        <Loaded view={file} rows={2}>
          {(read) => {
            const published = readPublished(read);
            if ('unreadable' in published) {
              return (
                <BodyText tone="secondary">
                  {published.unreadable === 'settings'
                    ? 'Its settings cannot be read.'
                    : 'Its test groups cannot be read.'}
                </BodyText>
              );
            }
            const { groups, credit } = published;
            const total = taskWeight(groups);
            const held = heldOf(standing, groups, values);
            return (
              <ul className={shared.named}>
                {total.num === 0n ? (
                  <li>
                    It gives no points: it is ranked on what its workflow reports.
                  </li>
                ) : (
                  <>
                    {worth !== null && compareRatio(worth, total) !== 0 && (
                      <li>
                        {`The contest makes it worth ${pointsText(worth)} ${
                          compareRatio(worth, ONE) === 0 ? 'point' : 'points'
                        }, so its test groups’ ${pointsText(total)} are scaled to that.`}
                      </li>
                    )}
                    {groups.map((group) => (
                      <li key={group.name}>
                        <strong>Test group “{group.name}”</strong>:{' '}
                        {afterColon(
                          groupSentence(group, {
                            total,
                            worth,
                            credit: credit.kind,
                            tests: counts?.get(group.name) ?? null,
                          }),
                        )}
                      </li>
                    ))}
                  </>
                )}
                {boards.length === 0 ? (
                  <li>No leaderboard counts it.</li>
                ) : (
                  boards.map((board) => (
                    <li key={board.name}>
                      <strong>
                        Counted on {board.name === '' ? 'a leaderboard' : board.name}:
                      </strong>{' '}
                      {boardSentence(board, { tasks: false, held })}
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
 * How this contest is scored (M35, M52): each task, in the contest's order,
 * with what it is worth and when it is open, how its test groups earn
 * points, and the leaderboards that count it, in plain words. The one place
 * to check the whole contest before it starts.
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
          Check this before the contest starts. It says how each task earns points and
          which leaderboards count them, as entrants are told.
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
