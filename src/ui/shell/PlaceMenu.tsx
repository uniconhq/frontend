import { Menu } from '@mantine/core';
import { Link } from 'react-router';
import { $api, isRefused, queryView, type QueryView } from '@/api/query';
import { Loaded } from '@/ui/feedback/Loaded';
import { useNamedContests, useNamedTasks, useSession } from '@/session';
import { taskPagePath } from '@/lib/contest-paths';
import { contestPath, orgPath, taskPath, workflowPath } from '@/lib/organiser-paths';
import {
  CONTEST_SECTIONS,
  CONTEST_VIEW_SECTIONS,
  ORG_SECTIONS,
  TASK_BUILD_CARDS,
  TASK_SECTIONS,
  contestSectionPath,
  contestViewSectionPath,
  orgSectionPath,
  taskCardPath,
  taskSectionPath,
} from '@/lib/sections';
import { headingOf, labelOf } from '@/lib/task-names';
import classes from './Breadcrumb.module.css';

/** A place on the trail whose arrow lists what sits under it. */
export type Place =
  | { kind: 'home' }
  | { kind: 'org'; org: string }
  | { kind: 'contest'; org: string; contest: string }
  | { kind: 'task'; org: string; contest: string; task: string }
  | { kind: 'entered'; org: string; contest: string };

type Entry = { label: string; to: string };

function Group({ heading, entries }: { heading: string; entries: Entry[] }) {
  return (
    <>
      <Menu.Label>{heading}</Menu.Label>
      {entries.length === 0 && <div className={classes.none}>None yet</div>}
      {entries.map((entry) => (
        <Menu.Item key={entry.to} component={Link} to={entry.to}>
          {entry.label}
        </Menu.Item>
      ))}
    </>
  );
}

function ReadGroup<T>({
  heading,
  view,
  entries,
}: {
  heading: string;
  view: QueryView<T>;
  entries: (data: T) => Entry[];
}) {
  if (view.state === 'ready')
    return <Group heading={heading} entries={entries(view.data)} />;
  return (
    <>
      <Menu.Label>{heading}</Menu.Label>
      <div className={classes.none}>
        <Loaded view={view} compact>
          {() => null}
        </Loaded>
      </div>
    </>
  );
}

function HomeEntries() {
  const session = useSession();
  const workflows = queryView($api.useQuery('get', '/api/v1/workflows'));
  const orgs = session.status === 'signed-in' ? session.me.orgs : [];
  return (
    <>
      <Group
        heading="Orgs"
        entries={orgs.map((org) => ({ label: org, to: orgPath(org) }))}
      />
      <ReadGroup
        heading="Workflows"
        view={workflows}
        entries={(items) =>
          items.map(({ owner, name }) => ({
            label: `${owner}/${name}`,
            to: workflowPath(owner, name),
          }))
        }
      />
    </>
  );
}

function OrgEntries({ org }: { org: string }) {
  const listed = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests', { params: { path: { org } } }),
  );
  const named = useNamedContests(org);
  const contests: QueryView<string[]> =
    listed.state === 'ready'
      ? { state: 'ready', data: listed.data.map(({ name }) => name) }
      : isRefused(listed)
        ? { state: 'ready', data: named }
        : listed;
  return (
    <>
      <ReadGroup
        heading="Contests"
        view={contests}
        entries={(names) =>
          names.map((name) => ({ label: name, to: contestPath(org, name) }))
        }
      />
      <Group
        heading="Sections"
        entries={ORG_SECTIONS.map((section) => ({
          label: section.label,
          to: orgSectionPath(org, section.key),
        }))}
      />
    </>
  );
}

function ContestEntries({ org, contest }: { org: string; contest: string }) {
  const listed = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/organise/tasks', {
      params: { path: { org, contest } },
    }),
  );
  const named = useNamedTasks(org, contest);
  const tasks: QueryView<Entry[]> =
    listed.state === 'ready'
      ? {
          state: 'ready',
          data: listed.data.map(({ label, task: { name } }) => {
            const letter = labelOf({ name, label, title: name });
            return {
              label: letter === null ? name : `${letter} · ${name}`,
              to: taskPath(org, contest, name),
            };
          }),
        }
      : isRefused(listed)
        ? {
            state: 'ready',
            data: named.map((name) => ({
              label: name,
              to: taskPath(org, contest, name),
            })),
          }
        : listed;
  return (
    <>
      <ReadGroup heading="Tasks" view={tasks} entries={(entries) => entries} />
      <Group
        heading="Sections"
        entries={CONTEST_SECTIONS.map((section) => ({
          label: section.label,
          to: contestSectionPath(org, contest, section.key),
        }))}
      />
    </>
  );
}

function TaskEntries({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  return (
    <>
      <Group
        heading="On the task's page"
        entries={TASK_BUILD_CARDS.map((card) => ({
          label: card.label,
          to: taskCardPath(org, contest, task, card.key),
        }))}
      />
      <Group
        heading="Sections"
        entries={TASK_SECTIONS.map((section) => ({
          label: section.label,
          to: taskSectionPath(org, contest, task, section.key),
        }))}
      />
    </>
  );
}

type Named = { name: string; label: string; title: string };

function EnteredTasks({
  org,
  contest,
  view,
}: {
  org: string;
  contest: string;
  view: QueryView<{ tasks: Named[] }>;
}) {
  return (
    <ReadGroup
      heading="Tasks"
      view={view}
      entries={({ tasks }) =>
        tasks.map((task) => ({
          label: headingOf(task),
          to: taskPagePath(org, contest, task.name),
        }))
      }
    />
  );
}

function SignedInTasks({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
      params: { path: { org, contest } },
    }),
  );
  return <EnteredTasks org={org} contest={contest} view={view} />;
}

function PublicTasks({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/public/contests/{org}/{contest}', {
      params: { path: { org, contest } },
    }),
  );
  return <EnteredTasks org={org} contest={contest} view={view} />;
}

function EnteredEntries({ org, contest }: { org: string; contest: string }) {
  const signedIn = useSession().status === 'signed-in';
  return (
    <>
      {signedIn ? (
        <SignedInTasks org={org} contest={contest} />
      ) : (
        <PublicTasks org={org} contest={contest} />
      )}
      <Group
        heading="Sections"
        entries={CONTEST_VIEW_SECTIONS.filter((section) => section.segment !== '').map(
          (section) => ({
            label: section.label,
            to: contestViewSectionPath(org, contest, section.key),
          }),
        )}
      />
    </>
  );
}

function Entries({ place }: { place: Place }) {
  switch (place.kind) {
    case 'home':
      return <HomeEntries />;
    case 'org':
      return <OrgEntries org={place.org} />;
    case 'contest':
      return <ContestEntries org={place.org} contest={place.contest} />;
    case 'task':
      return <TaskEntries org={place.org} contest={place.contest} task={place.task} />;
    case 'entered':
      return <EnteredEntries org={place.org} contest={place.contest} />;
  }
}

/** The small arrow after a part of the trail. Its reads run only while it is open. */
export function PlaceMenu({ label, place }: { label: string; place: Place }) {
  return (
    <Menu position="bottom-start" withinPortal width={260}>
      <Menu.Target>
        <button type="button" className={classes.arrow} aria-label={`${label} menu`}>
          <span aria-hidden="true">▾</span>
        </button>
      </Menu.Target>
      <Menu.Dropdown aria-label={`${label} menu`} className={classes.menu}>
        <Entries place={place} />
      </Menu.Dropdown>
    </Menu>
  );
}
