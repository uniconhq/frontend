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
import { BoardsPage, ContestHomePage, TaskStatementPage } from '@/features/contest';
import {
  ContestantsPage,
  ContestPage,
  GradingsFeedPage,
  InboxPage,
  NewOrgPage,
  OrganisedBoardsPage,
  OrgPage,
  OrgsPage,
  TaskPage,
  TeamsPage,
  WorkflowPage,
  WorkflowsPage,
} from '@/features/organise';
import { RequireSession, SessionExpiredModal, SessionProvider } from '@/session';

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
                  { path: ':org', element: <OrgPage /> },
                  { path: ':org/clarifications', element: <InboxPage /> },
                  { path: ':org/contests/:contest', element: <ContestPage /> },
                  {
                    path: ':org/contests/:contest/contestants',
                    element: <ContestantsPage />,
                  },
                  {
                    path: ':org/contests/:contest/teams',
                    element: <TeamsPage />,
                  },
                  {
                    path: ':org/contests/:contest/gradings',
                    element: <GradingsFeedPage />,
                  },
                  {
                    path: ':org/contests/:contest/boards',
                    element: <OrganisedBoardsPage />,
                  },
                  {
                    path: ':org/contests/:contest/tasks/:task',
                    element: <TaskPage />,
                  },
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
