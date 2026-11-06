import {
  createBrowserRouter,
  Outlet,
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
  ContestHomePage,
  LeaderboardsPage,
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
  WorkflowPage,
  WorkflowsPage,
} from '@/features/organise';
import { RequireSession, SessionExpiredModal, SessionProvider } from '@/session';
import { CONTEST_SECTIONS, ORG_SECTIONS, TASK_SECTIONS } from '@/lib/sections';

const ORG = ':org';
const CONTEST = `${ORG}/contests/:contest`;
const TASK = `${CONTEST}/tasks/:task`;

/** A route for each section, from the list that also draws its card and crumb. */
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

/** The session sits above the error boundary, so an error page still knows who you are. */
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

/** A page threw: the shell stays, so the person can leave. */
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
          // One address for visitors and the signed in; each page reads what the caller may see.
          { path: 'contests/:org/:contest', element: <ContestHomePage /> },
          {
            path: 'contests/:org/:contest/leaderboards',
            element: <LeaderboardsPage />,
          },
          {
            path: 'contests/:org/:contest/leaderboards/:leaderboard',
            element: <LeaderboardsPage />,
          },
          { path: 'contests/:org/:contest/questions', element: <QuestionsPage /> },
          {
            path: 'contests/:org/:contest/tasks/:task',
            element: <TaskStatementPage />,
          },
          // The invite mail's link; InviteLink keeps its token out of a sign-in's `?next=`.
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
              { path: 'workflows', element: <WorkflowsPage /> },
              { path: 'workflows/:owner/:name', element: <WorkflowPage /> },
              // The deploy proxy sends exactly /orgs and /orgs/... to this app.
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
                ],
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
