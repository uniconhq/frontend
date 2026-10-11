import type { ReactNode } from 'react';
import { $api } from '@/api/query';
import { Chip } from '@/ui/Chip';
import { Countdown } from '@/ui/Countdown';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { STANDING_WORD, standingOf } from '@/lib/contest-state';
import { contestHomePath } from '@/lib/contest-paths';
import { useContestParams } from '@/lib/route-params';
import {
  CONTEST_SECTIONS,
  contestSectionPath,
  type ContestSectionKey,
} from '@/lib/sections';
import { serverNow } from '@/lib/time';
import { OrganisersLine } from '../hub/lines';
import {
  AnnouncementsCard,
  BoardsCard,
  ContestantsCard,
  FilesCard,
  GradingsCard,
  QuestionsCard,
  TeamsCard,
} from './ContestCards';
import { ContestSummary } from './ContestSummary';
import { ContestTasks } from './ContestTasks';

type Path = { org: string; contest: string };

/** The line of each section's card in the grid, one per entry of the list. */
const CARDS: Record<
  Exclude<ContestSectionKey, 'settings'>,
  (props: { path: Path }) => ReactNode
> = {
  contestants: ContestantsCard,
  teams: TeamsCard,
  gradings: GradingsCard,
  boards: BoardsCard,
  announcements: AnnouncementsCard,
  questions: QuestionsCard,
  files: FilesCard,
  organisers: ({ path }) => <OrganisersLine place={{ kind: 'contest', ...path }} />,
};

/**
 * A contest's page for its organisers: a header with its name, where it
 * stands, the time to its start or end and the page its contestants see;
 * its settings at a glance; its tasks; and a card for each of its sections,
 * each going to its own page. Nothing here changes anything: the forms are
 * on the sections' pages. Each part loads and fails on its own, so a refused
 * task list still leaves the rest of the page.
 */
export function ContestPage() {
  const { org, contest } = useContestParams();
  const home = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
    params: { path: { org, contest } },
  }).data;
  const standing = home === undefined ? null : standingOf(home, serverNow());

  return (
    <Page>
      <PageHeader
        title={home?.name ?? contest}
        meta={
          home !== undefined &&
          standing !== null && (
            <>
              <Chip tone={standing === 'live' ? 'live' : 'quiet'}>
                {STANDING_WORD[standing]}
              </Chip>
              {standing !== 'archived' && (
                <Countdown start={home.start} end={home.end} />
              )}
            </>
          )
        }
        links={
          <PageLink to={contestHomePath(org, contest)}>View as contestant</PageLink>
        }
      />
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
              <Card path={{ org, contest }} />
            </HubCard>
          );
        })}
      </CardGrid>
    </Page>
  );
}
