import type { ReactNode } from 'react';
import { $api, queryView } from '@/api/query';
import type { TaskState } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { Loaded } from '@/ui/feedback/Loaded';
import { useTaskParams } from '@/lib/route-params';
import {
  TASK_BUILD_CARDS,
  TASK_SECTIONS,
  taskSectionPath,
  type TaskSectionKey,
} from '@/lib/sections';
import { DefinitionErrors } from '../DefinitionErrors';
import { OrganisersLine } from '../hub/lines';
import { taskPlaceOf } from './places';
import { publishedLine } from './published';
import {
  AnnouncementsCard,
  FilesCard,
  GradingsCard,
  InputsCard,
  PublicationsCard,
  SettingsCard,
  StatementCard,
  TestsCard,
  WorkflowCard,
} from './TaskCards';
import classes from './task.module.css';

type TaskPath = { org: string; contest: string; task: string };
type CardLine = (props: { path: TaskPath }) => ReactNode;

/** The line of each card that builds the task, by its key in the list. */
const BUILD_CARDS: Record<(typeof TASK_BUILD_CARDS)[number]['key'], CardLine> = {
  workflow: WorkflowCard,
  inputs: InputsCard,
  tests: TestsCard,
  statement: StatementCard,
};

/** The line of each section's card in the grid, by its key in the list. */
const GRID_CARDS: Record<Exclude<TaskSectionKey, 'statement'>, CardLine> = {
  gradings: GradingsCard,
  publications: PublicationsCard,
  announcements: AnnouncementsCard,
  files: FilesCard,
  organisers: ({ path }) => <OrganisersLine place={{ kind: 'task', ...path }} />,
  settings: SettingsCard,
};

/** Where the task's files stand, in a word beside its name. */
function StateChip({ state }: { state: TaskState }) {
  if (state.draft && state.errors.length > 0) {
    return <Chip tone="warn">Last save has problems</Chip>;
  }
  if (state.latest === null) return <Chip>Not published</Chip>;
  if (state.draft) return <Chip>Draft kept back</Chip>;
  return <Chip tone="live">Published</Chip>;
}

/**
 * What contestants are graded on, and what holds the last save back: its
 * problems, each where it is, or that it was kept back as a draft.
 */
function TaskStatus({ path }: { path: TaskPath }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}', {
      params: { path },
    }),
  );
  return (
    <Loaded view={view} rows={1}>
      {(state) => (
        <div className={classes.status} aria-label="Where the task stands">
          <div className={classes.statusLine}>
            <StateChip state={state} />
            <BodyText>{publishedLine(state.latest)}</BodyText>
          </div>
          {state.draft &&
            (state.errors.length > 0 ? (
              <>
                <BodyText>The last save did not publish, for these problems:</BodyText>
                <DefinitionErrors
                  errors={state.errors}
                  placeOf={taskPlaceOf(path.org, path.contest, path.task)}
                />
              </>
            ) : (
              <BodyText tone="secondary">
                The last save is kept back as a draft, so contestants are graded as
                before.
              </BodyText>
            ))}
        </div>
      )}
    </Loaded>
  );
}

/**
 * A task's page for its organisers: its name and where it stands, what
 * contestants are graded on and what holds a save back; then the cards that
 * build it, in the order one decides the next; then a card for each section
 * that runs it. Each card goes to the page where its part is done; there is
 * no publish button, since saving is publishing.
 */
export function TaskPage() {
  const { org, contest, task } = useTaskParams();
  const path = { org, contest, task };

  return (
    <Page>
      <PageHeader title={task}>
        <TaskStatus path={path} />
      </PageHeader>
      <CardGrid label="Building the task" four>
        {TASK_BUILD_CARDS.map((card) => {
          const Line = BUILD_CARDS[card.key];
          return (
            <HubCard
              key={card.key}
              title={card.label}
              to={taskSectionPath(org, contest, task, card.section)}
            >
              <Line path={path} />
            </HubCard>
          );
        })}
      </CardGrid>
      <CardGrid label="Running the task">
        {TASK_SECTIONS.filter(
          (section): section is Extract<typeof section, { card: 'grid' }> =>
            section.card === 'grid',
        ).map((section) => {
          const Line = GRID_CARDS[section.key];
          return (
            <HubCard
              key={section.key}
              title={section.label}
              to={taskSectionPath(org, contest, task, section.key)}
            >
              <Line path={path} />
            </HubCard>
          );
        })}
      </CardGrid>
    </Page>
  );
}
