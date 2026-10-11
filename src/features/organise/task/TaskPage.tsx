import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { TaskState } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import { useTaskParams } from '@/lib/route-params';
import { TASK_SECTIONS, taskSectionPath, type TaskSectionKey } from '@/lib/sections';
import { useQueryClient } from '@tanstack/react-query';
import { DefinitionErrors } from '../DefinitionErrors';
import { useOpenedField } from '../contest/opened';
import { fileQuery } from '../files/place';
import { StatementEditor } from '../forms/StatementEditor';
import { OrganisersLine } from '../hub/lines';
import { holdsAt } from '../roles';
import { BuildCard } from './BuildCard';
import { useTaskSave } from './build-save';
import { CARD_PARAM, taskPlaceOf } from './places';
import { publishedLine } from './published';
import { TaskBuild } from './TaskBuild';
import {
  AnnouncementsCard,
  FilesCard,
  GradingsCard,
  PublicationsCard,
  SettingsCard,
} from './TaskCards';
import classes from './task.module.css';

type TaskPath = { org: string; contest: string; task: string };
type CardLine = (props: { path: TaskPath }) => ReactNode;

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** The line of each section's card in the grid, by its key in the list. */
const GRID_CARDS: Record<TaskSectionKey, CardLine> = {
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
 * What entrants are graded on, and what holds the last save back: its
 * problems, each where it is fixed, or that it was kept back as a draft.
 */
function TaskStatus({ path }: { path: TaskPath }) {
  const view = queryView($api.useQuery('get', TASK, { params: { path } }));
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
                The last save is kept back as a draft, so entrants are graded as before.
              </BodyText>
            ))}
        </div>
      )}
    </Loaded>
  );
}

/**
 * The card a link opened (`?card=`), scrolled to, and the field it names
 * focused once the cards are there.
 */
function useOpenedCard() {
  const [search] = useSearchParams();
  const card = search.get(CARD_PARAM);
  useEffect(() => {
    if (card === null) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(card)?.scrollIntoView?.({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [card]);
  useOpenedField(card !== null);
}

/**
 * A task's page for its organisers: its name and where it stands; then the
 * cards that build it, in the order one decides the next (its workflow, its
 * inputs, its tests and scoring, which share one save bar, and its
 * statement, which saves on its own); then a card for each section that runs
 * it. Saving is publishing: a save without problems publishes the task.
 */
export function TaskPage() {
  const { org, contest, task } = useTaskParams();
  const path = { org, contest, task };
  const place = { kind: 'task' as const, ...path };
  const roles = useMe().roles;
  const admin = holdsAt(roles, place, 'admin');
  const manager = holdsAt(roles, place, 'manager');
  const queryClient = useQueryClient();
  const saving = useTaskSave(place, async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...fileQuery(place, 'task.yaml').queryKey, 'own'],
      }),
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', `${TASK}/workflow-form`, {
          params: { path },
        }).queryKey,
      }),
    ]);
  });
  useOpenedCard();

  return (
    <Page>
      <PageHeader title={task}>
        <TaskStatus path={path} />
      </PageHeader>
      <TaskBuild place={place} saving={saving} admin={admin} manager={manager} />
      <BuildCard
        id="statement"
        title="Statement"
        line="What entrants read: the task itself, written beside how they see it. It saves on its own."
      >
        <StatementEditor place={place} admin={admin} />
      </BuildCard>
      <CardGrid label="Running the task">
        {TASK_SECTIONS.map((section) => {
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
