import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { $api } from '@/api/query';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { useMe } from '@/session';
import { PageLink } from '@/ui/PageLink';
import { useTaskParams } from '@/lib/route-params';
import { TASK_SECTIONS, taskSectionPath, type TaskSectionKey } from '@/lib/sections';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readTask } from '../forms/task-values';
import { readSettings } from './build-data';
import { TaskStanding } from './TaskHeader';
import { whenDrawn } from '@/ui/anchor';
import { useOpenedField } from '../contest/opened';
import { STORED } from '../contest/places';
import { fileQuery } from '../files/place';
import { StatementEditor } from '../forms/StatementEditor';
import { OrganisersLine } from '../hub/lines';
import { holdsAt } from '../roles';
import { BuildCard } from './BuildCard';
import { useTaskSave } from './build-save';
import { CARD_PARAM } from './places';
import { TaskBuild } from './TaskBuild';
import {
  AnnouncementsCard,
  GradingsCard,
  PublicationsCard,
  SettingsCard,
} from './TaskCards';

type TaskPath = { org: string; contest: string; task: string };
type CardLine = (props: { path: TaskPath }) => ReactNode;

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** The line of each section's card in the grid, by its key in the list. */
const GRID_CARDS: Record<TaskSectionKey, CardLine> = {
  gradings: GradingsCard,
  publications: PublicationsCard,
  announcements: AnnouncementsCard,
  organisers: ({ path }) => <OrganisersLine place={{ kind: 'task', ...path }} />,
  settings: SettingsCard,
};

/** The task's title, as its settings give it, or its name until they are read. */
function TaskTitle({
  place,
}: {
  place: { kind: 'task'; org: string; contest: string; task: string };
}) {
  const file = useQuery({ ...fileQuery(place, 'task.yaml'), retry: false });
  const read = file.data === undefined ? null : readSettings(file.data);
  const title =
    read === null || 'error' in read ? '' : readTask(read.doc, []).values.name.trim();
  return <>{title === '' ? place.task : title}</>;
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
    return whenDrawn(
      () => document.getElementById(card),
      (found) => found.scrollIntoView?.({ block: 'start' }),
    );
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
      <PageHeader
        title={<TaskTitle place={place} />}
        links={
          <PageLink to={`${taskSectionPath(org, contest, task, 'settings')}#${STORED}`}>
            View file
          </PageLink>
        }
      >
        <TaskStanding place={place} saving={saving} manager={manager} />
      </PageHeader>
      <TaskBuild place={place} saving={saving} admin={admin} manager={manager} />
      <BuildCard
        id="statement"
        title="Statement"
        line="What entrants read about the task, written beside a preview of how they see it. It is saved on its own."
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
