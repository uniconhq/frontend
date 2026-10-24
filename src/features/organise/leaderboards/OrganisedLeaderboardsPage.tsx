import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, sectionOf } from '@/lib/sections';
import { ContestFile } from '../contest/ContestFile';
import { SectionPage } from '../SectionPage';
import { LeaderboardsForm } from './LeaderboardsForm';

/** The contest's leaderboards and its hold, one card per leaderboard. */
export function OrganisedLeaderboardsPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'boards')}>
      <ContestFile org={org} contest={contest}>
        {(props) => <LeaderboardsForm org={org} contest={contest} {...props} />}
      </ContestFile>
    </SectionPage>
  );
}
