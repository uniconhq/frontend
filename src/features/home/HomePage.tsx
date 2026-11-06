import { useLocation } from 'react-router';
import { $api, queryView } from '@/api/query';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { Stack } from '@/ui/layout';
import {
  CreateAccountLink,
  currentPath,
  loginHref,
  useMe,
  useSession,
} from '@/session';
import {
  ORGS_PATH,
  WORKFLOWS_PATH,
  orgPath,
  workflowPath,
} from '@/lib/organiser-paths';
import { MyContests, PublicContests } from './ContestList';
import { PendingInvites } from './MyInvites';
import { ServerClock } from './ServerClock';
import classes from './HomePage.module.css';

function YourOrgs() {
  const orgs = useMe().orgs;
  if (orgs.length === 0) return <BodyText>You have no role at any org yet.</BodyText>;
  return orgs.map((org) => (
    <PageLink key={org} to={orgPath(org)}>
      {org}
    </PageLink>
  ));
}

function YourWorkflows() {
  const view = queryView($api.useQuery('get', '/api/v1/workflows'));
  return (
    <Loaded view={view} compact>
      {(items) =>
        items.length === 0 ? (
          <BodyText>You have no workflow yet, and none is shared with you.</BodyText>
        ) : (
          items.map(({ owner, name }) => (
            <PageLink key={`${owner}/${name}`} to={workflowPath(owner, name)}>
              {owner}/{name}
            </PageLink>
          ))
        )
      }
    </Loaded>
  );
}

function SignedInHome() {
  return (
    <>
      <CardGrid label="Your places">
        <HubCard title="Orgs" to={ORGS_PATH}>
          <YourOrgs />
        </HubCard>
        <HubCard title="Workflows" to={WORKFLOWS_PATH}>
          <YourWorkflows />
        </HubCard>
      </CardGrid>
      <PendingInvites />
      <MyContests />
    </>
  );
}

/** Signed out it is the door and the public contests; signed in, your orgs, workflows and contests. */
export function HomePage() {
  const session = useSession();
  const location = useLocation();

  return (
    <Stack gap="md">
      <PageTitle>Unicon</PageTitle>
      <BodyText size="md">
        Enter a contest, submit your work to its tasks and see how each submission is
        graded. Organisers set up and run their contests here too.
      </BodyText>

      {session.status === 'loading' && <PageSkeleton rows={1} />}

      {session.status === 'signed-out' && (
        <>
          <div className={classes.actions}>
            <Button href={loginHref(currentPath(location))}>Sign in</Button>
            <CreateAccountLink />
          </div>
          <PublicContests />
        </>
      )}

      {session.status === 'signed-in' && <SignedInHome />}

      <ServerClock />
    </Stack>
  );
}
