import { Card } from '@/ui/Card';
import { useOrgParam } from '@/lib/route-params';
import { ORG_SECTIONS, sectionOf } from '@/lib/sections';
import { PeopleSection } from '../people/PeopleSection';
import { SectionPage } from '../SectionPage';
import { OrgProfile } from './OrgProfile';

/** Everyone who organises the whole org, and the invites to join them. */
export function OrgOrganisersPage() {
  const org = useOrgParam();
  return (
    <SectionPage section={sectionOf(ORG_SECTIONS, 'organisers')}>
      <PeopleSection place={{ kind: 'org', org }} />
    </SectionPage>
  );
}

/** The org's display name and description, which its admin changes. */
export function OrgSettingsPage() {
  const org = useOrgParam();
  return (
    <SectionPage section={sectionOf(ORG_SECTIONS, 'settings')}>
      <Card>
        <OrgProfile org={org} />
      </Card>
    </SectionPage>
  );
}
