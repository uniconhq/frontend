import {
  createBrowserRouter,
  Outlet,
  useRouteError,
  type RouteObject,
} from 'react-router';
import { AppShell } from '@/ui/shell/AppShell';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { NotFound } from '@/ui/feedback/NotFound';
import { HomePage } from '@/features/home';
import { LoginPage } from '@/features/auth';
import { AccountPage } from '@/features/account';
import { ContestHomePage, TaskStatementPage } from '@/features/contest';
import {
  ContestantsPage,
  ContestPage,
  NewOrgPage,
  OrgPage,
  OrgsPage,
  TaskPage,
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
      <Outlet />
      <SessionExpiredModal />
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
          {
            path: 'contests/:org/:contest/tasks/:task',
            element: <TaskStatementPage />,
          },
          {
            element: <RequireSession />,
            children: [
              { path: 'account', element: <AccountPage /> },
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
                  { path: ':org/contests/:contest', element: <ContestPage /> },
                  {
                    path: ':org/contests/:contest/contestants',
                    element: <ContestantsPage />,
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
