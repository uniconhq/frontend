import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useRouteError,
  type RouteObject,
} from 'react-router';
import { AppShell } from '@/ui/shell/AppShell';
import { LiveProvider } from '@/live';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { NotFound } from '@/ui/feedback/NotFound';
import { HomePage, InviteLink, InvitesPage } from '@/features/home';
import { LoginPage } from '@/features/auth';
import { AccountPage } from '@/features/account';
import {
  BoardsPage,
  ContestHomePage,
  QuestionsPage,
  TaskStatementPage,
} from '@/features/contest';
import {
  CONTEST_SECTION_PAGES,
  ContestPage,
  NewOrgPage,
  ORG_SECTION_PAGES,
  OrgPage,
  OrgsPage,
  TASK_SECTION_PAGES,
  RegradePage,
  TaskPage,
  viewFilePath,
  WorkflowPage,
  WorkflowsPage,
} from '@/features/organise';
import { stage6Routes } from '@/features/organise/stage6/routes';
import { RequireSession, SessionExpiredModal, SessionProvider } from '@/session';
import {
  CONTEST_SECTIONS,
  contestSectionPath,
  ORG_SECTIONS,
  TASK_SECTIONS,
  taskCardPath,
} from '@/lib/sections';
import { taskPath } from '@/lib/organiser-paths';
import { useContestParams, useTaskParams } from '@/lib/route-params';

const ORG = ':org';
const CONTEST = `${ORG}/contests/:contest`;
const TASK = `${CONTEST}/tasks/:task`;

/**
 * A route for each section of an org, a contest or a task, from the same
 * list that draws their cards, their sidebar entries and their crumbs.
 */
const sectionRoutes: RouteObject[] = [
  ...ORG_SECTIONS.map((section) => {
    const Page = ORG_SECTION_PAGES[section.key];
    return { path: `${ORG}/${section.segment}`, element: <Page /> };
  }),
  ...CONTEST_SECTIONS.map((section) => {
    const Page = CONTEST_SECTION_PAGES[section.key];
    return { path: `${CONTEST}/${section.segment}`, element: <Page /> };
  }),
  ...TASK_SECTIONS.map((section) => {
    const Page = TASK_SECTION_PAGES[section.key];
    return { path: `${TASK}/${section.segment}`, element: <Page /> };
  }),
];

/**
 * The contest's Contestants and Teams pages, now its one Entrants page: an
 * old link lands there, its filters kept.
 */
function ToEntrants() {
  const { org, contest } = useContestParams();
  const { search } = useLocation();
  return (
    <Navigate to={`${contestSectionPath(org, contest, 'entrants')}${search}`} replace />
  );
}

/** A task's Statement page, now the Statement card on the task's own page. */
function ToStatement() {
  const { org, contest, task } = useTaskParams();
  return <Navigate to={taskCardPath(org, contest, task, 'statement')} replace />;
}

/**
 * A task's Files page, gone now that each file has its form on the task's
 * own page (M51): an old link lands there.
 */
function ToTaskPage() {
  const { org, contest, task } = useTaskParams();
  return <Navigate to={taskPath(org, contest, task)} replace />;
}

/**
 * A contest's Files page, gone since a contest holds no file but its
 * settings (M43): an old link lands on its Settings, at the settings as
 * stored when it opened a file.
 */
function ToContestSettings() {
  const { org, contest } = useContestParams();
  const { search } = useLocation();
  const opened = new URLSearchParams(search).has('file');
  return (
    <Navigate
      to={
        opened
          ? viewFilePath(org, contest)
          : contestSectionPath(org, contest, 'settings')
      }
      replace
    />
  );
}

const movedRoutes: RouteObject[] = [
  ...['contestants', 'teams'].map((segment) => ({
    path: `${CONTEST}/${segment}`,
    element: <ToEntrants />,
  })),
  { path: `${CONTEST}/files`, element: <ToContestSettings /> },
  { path: `${TASK}/statement`, element: <ToStatement /> },
  { path: `${TASK}/files`, element: <ToTaskPage /> },
];

/**
 * Data-router mode, because the route tree is about to get deep and loaders are
 * how those pages prefetch. The session sits above the error boundary, so a
 * page that throws still renders inside a shell that knows who you are.
 */
function SessionRoot() {
  return (
    <SessionProvider>
      <LiveProvider>
        <Outlet />
        <SessionExpiredModal />
      </LiveProvider>
    </SessionProvider>
  );
}

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** A page threw. The shell stays, so the person can navigate away from it. */
function ShellError() {
  const error = useRouteError();
  return (
    <AppShell>
      <ErrorBlock error={error} onRetry={() => window.location.reload()} />
    </AppShell>
  );
}

/** The shell itself threw, which leaves nothing to render it inside. */
function BareError() {
  const error = useRouteError();
  return <ErrorBlock error={error} onRetry={() => window.location.reload()} />;
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <SessionRoot />,
    errorElement: <BareError />,
    children: [
      {
        element: <ShellLayout />,
        errorElement: <ShellError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'login', element: <LoginPage /> },
          /**
           * A contest and its tasks at one address for a visitor and for a
           * signed-in person, each page reading what the caller may see.
           */
          { path: 'contests/:org/:contest', element: <ContestHomePage /> },
          { path: 'contests/:org/:contest/boards', element: <BoardsPage /> },
          { path: 'contests/:org/:contest/questions', element: <QuestionsPage /> },
          {
            path: 'contests/:org/:contest/tasks/:task',
            element: <TaskStatementPage />,
          },
          /**
           * Where an invite's mail links to, with its token after the `#`,
           * which InviteLink moves into the tab before the guard reads the
           * address for a sign-in's `?next=`.
           */
          {
            path: 'invites',
            element: <InviteLink />,
            children: [
              {
                element: <RequireSession />,
                children: [{ index: true, element: <InvitesPage /> }],
              },
            ],
          },
          {
            element: <RequireSession />,
            children: [
              { path: 'account', element: <AccountPage /> },
              /**
               * A workflow is a person's or an org's, so its pages have an
               * address of their own, which the proxy sends here as well.
               */
              { path: 'workflows', element: <WorkflowsPage /> },
              { path: 'workflows/:owner/:name', element: <WorkflowPage /> },
              /**
               * Every organiser page is under /orgs, because the proxy in
               * deploy sends exactly /orgs and /orgs/... to this app.
               */
              {
                path: 'orgs',
                children: [
                  { index: true, element: <OrgsPage /> },
                  { path: 'new', element: <NewOrgPage /> },
                  { path: ORG, element: <OrgPage /> },
                  { path: CONTEST, element: <ContestPage /> },
                  { path: TASK, element: <TaskPage /> },
                  { path: `${TASK}/regrades/:regrade`, element: <RegradePage /> },
                  ...sectionRoutes,
                  ...movedRoutes,
                ],
              },
            ],
          },
          ...(import.meta.env.DEV ? stage6Routes : []),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
