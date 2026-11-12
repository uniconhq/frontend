import type { ReactNode } from 'react';
import { $api } from '@/api/query';
import type { ContestHome } from '@/api/types';
import { BY_DEVICE, useServerClock } from '@/api/use-server-time';
import { Chip } from '@/ui/Chip';
import { BodyText } from '@/ui/BodyText';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { standingOf, statusLine } from '@/lib/contest-state';
import { contestHomePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import {
  CONTEST_SECTIONS,
  contestSectionPath,
  type ContestSectionKey,
} from '@/lib/sections';
import { OrganisersLine } from '../hub/lines';
import {
  AnnouncementsCard,
  BoardsCard,
  EntrantsCard,
  EntryCard,
  FailedGradings,
  GradingsCard,
  QuestionsCard,
} from './ContestCards';
import { RegradeSummaries } from '../gradings/RegradeSummaries';
import { ContestSummary } from './ContestSummary';
import { ContestTasks } from './ContestTasks';
import { StatusCard } from './StatusCard';

type Path = { org: string; contest: string };

/** One badge: state, the date that matters and, once the server clock is known, the time left. */
function StatusBadge({ home }: { home: ContestHome }) {
  const { at, measured, byDevice } = useServerClock();
  // Until the clock is measured, where the contest stands is the server's word at the read.
  const now = new Date(measured ? at : Date.parse(home.now));
  const standing = standingOf(home, now);
  return (
    <>
      <span role="timer" aria-label="Contest status">
        <Chip
          tone={standing === 'live' ? 'live' : standing === 'draft' ? 'warn' : 'quiet'}
        >
          {statusLine(home, now, measured)}
        </Chip>
      </span>
      {byDevice && <BodyText tone="secondary">{BY_DEVICE}</BodyText>}
    </>
  );
}

/** The line of each section's card in the grid, one per entry of the list. */
const CARDS: Record<
  Exclude<ContestSectionKey, 'settings'>,
  (props: { path: Path }) => ReactNode
> = {
  entry: EntryCard,
  entrants: EntrantsCard,
  gradings: GradingsCard,
  boards: BoardsCard,
  announcements: AnnouncementsCard,
  questions: QuestionsCard,
  organisers: ({ path }) => <OrganisersLine place={{ kind: 'contest', ...path }} />,
};

/** A contest's page for its organisers. Each part loads and fails on its own. */
export function ContestPage() {
  const { org, contest } = useContestParams();
  const home = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
    params: { path: { org, contest } },
  }).data;

  return (
    <Page>
      <PageHeader
        title={home?.name ?? contest}
        meta={home !== undefined && <StatusBadge home={home} />}
        links={
          <PageLink to={contestHomePath(org, contest)}>View as an entrant</PageLink>
        }
      />
      <FailedGradings path={{ org, contest }} />
      <RegradeSummaries path={{ org, contest }} />
      <StatusCard org={org} contest={contest} />
      <ContestSummary org={org} contest={contest} />
      <ContestTasks org={org} contest={contest} />
      <CardGrid label="The contest's sections">
        {CONTEST_SECTIONS.filter(
          (section): section is Extract<typeof section, { card: 'grid' }> =>
            section.card === 'grid',
        ).map((section) => {
          const Card = CARDS[section.key];
          return (
            <HubCard
              key={section.key}
              title={section.label}
              to={contestSectionPath(org, contest, section.key)}
            >
              <p>{section.line}</p>
              <Card path={{ org, contest }} />
            </HubCard>
          );
        })}
      </CardGrid>
    </Page>
  );
}
