import type { ReactNode } from 'react';
import { $api, queryView } from '@/api/query';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { contestHomePath, taskPagePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import { BySession } from '../BySession';
import { SignInPrompt } from '../SignInPrompt';
import { submissionHref } from '../submit/submission-param';
import { BOARDS_EVERY_MS, BoardList } from './BoardList';
import classes from '../contest.module.css';

type ContestPath = { org: string; contest: string };

function Back({ org, contest }: ContestPath) {
  return <PageLink to={contestHomePath(org, contest)}>Back to the contest</PageLink>;
}

function Page({ org, contest, children }: ContestPath & { children: ReactNode }) {
  return (
    <div className={classes.page}>
      <Back org={org} contest={contest} />
      <PageTitle>Boards</PageTitle>
      {children}
    </div>
  );
}

/**
 * The boards a signed-in person may see, each as their audience sees it,
 * their own row's counted submissions each a link to it on its task.
 */
function SignedInBoards({ org, contest }: ContestPath) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/boards',
      { params: { path: { org, contest } } },
      { refetchInterval: BOARDS_EVERY_MS },
    ),
  );
  return (
    <Page org={org} contest={contest}>
      <BoardList
        view={view}
        empty="This contest has no board you can see."
        submissionTo={(task, number) =>
          `${taskPagePath(org, contest, task)}${submissionHref(number)}`
        }
      />
    </Page>
  );
}

/**
 * The boards a visitor sees: those shown to everyone, of a contest shown to
 * everyone. Any other contest asks them to sign in, since it may be one they
 * can see with a session.
 */
function PublicBoards({ org, contest }: ContestPath) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/public/contests/{org}/{contest}/boards',
      { params: { path: { org, contest } } },
      { refetchInterval: BOARDS_EVERY_MS },
    ),
  );
  if (view.state === 'error' && view.error.status === 404) {
    return (
      <SignInPrompt
        title="Sign in to see this contest"
        back={<Back org={org} contest={contest} />}
      />
    );
  }
  return (
    <Page org={org} contest={contest}>
      <BoardList view={view} empty="This contest shows no board to visitors." />
    </Page>
  );
}

/**
 * A contest's boards at one address for a signed-in person and a visitor,
 * each reading the boards their audience may see.
 */
export function BoardsPage() {
  const { org, contest } = useContestParams();
  return (
    <BySession
      signedIn={<SignedInBoards org={org} contest={contest} />}
      visitor={<PublicBoards org={org} contest={contest} />}
    />
  );
}
