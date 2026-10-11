import type { ReactNode } from 'react';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { CardGrid, HubCard } from '@/ui/HubCard';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { useFallbackPoll } from '@/live';
import { useMe } from '@/session';
import { useOrgParam } from '@/lib/route-params';
import { ORG_SECTIONS, orgSectionPath, type OrgSectionKey } from '@/lib/sections';
import { useOrganisersLine } from '../people/summary';
import { holdsAt } from '../roles';
import { OrgContests } from './OrgContests';

const ORG = '/api/v1/orgs/{org}';

/** The name an org shows: its display name, or its own name when it has none. */
function shownName(org: string, displayName: string | null | undefined): string {
  return displayName !== null && displayName !== undefined && displayName !== ''
    ? displayName
    : org;
}

function OrganisersCard({ org }: { org: string }) {
  return (
    <Loaded view={useOrganisersLine({ kind: 'org', org })} compact>
      {(line) => <BodyText>{line}</BodyText>}
    </Loaded>
  );
}

function QuestionsCard({ org }: { org: string }) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/clarifications',
      { params: { path: { org } } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );
  return (
    <Loaded view={view} compact>
      {(open) => (
        <BodyText>
          {open.length === 0
            ? 'No question is waiting for an answer.'
            : `${String(open.length)} ${open.length === 1 ? 'question waits' : 'questions wait'} for an answer.`}
        </BodyText>
      )}
    </Loaded>
  );
}

function SettingsCard({ org }: { org: string }) {
  const view = queryView($api.useQuery('get', ORG, { params: { path: { org } } }));
  return (
    <Loaded view={view} compact>
      {(profile) => (
        <BodyText>
          Shown as {shownName(org, profile.display_name)}
          {profile.description === '' ? ', with no description.' : '.'}
        </BodyText>
      )}
    </Loaded>
  );
}

/** Each section's card on the org's page, one per entry of its list. */
const CARDS: Record<OrgSectionKey, (props: { org: string }) => ReactNode> = {
  organisers: OrganisersCard,
  questions: QuestionsCard,
  settings: SettingsCard,
};

/**
 * An org's page: its name and description, with a small Edit for its admin;
 * its contests, full width; and a card for each of its sections, each going
 * to its own page. Nothing here changes anything: the forms are on the
 * sections' pages.
 */
export function OrgPage() {
  const org = useOrgParam();
  const administers = holdsAt(useMe().roles, { kind: 'org', org }, 'admin');
  const profile = $api.useQuery('get', ORG, { params: { path: { org } } }).data;

  return (
    <Page>
      <PageHeader
        title={shownName(org, profile?.display_name)}
        links={
          administers ? (
            <PageLink to={orgSectionPath(org, 'settings')} label="Edit the org">
              Edit
            </PageLink>
          ) : undefined
        }
      >
        {profile !== undefined && profile.description !== '' && (
          <BodyText size="md">{profile.description}</BodyText>
        )}
      </PageHeader>
      <OrgContests org={org} />
      <CardGrid label="The org's sections">
        {ORG_SECTIONS.map((section) => {
          const Card = CARDS[section.key];
          return (
            <HubCard
              key={section.key}
              title={section.label}
              to={orgSectionPath(org, section.key)}
            >
              <Card org={org} />
            </HubCard>
          );
        })}
      </CardGrid>
    </Page>
  );
}
