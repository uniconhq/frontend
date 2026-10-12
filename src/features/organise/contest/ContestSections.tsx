import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, orgSectionPath, sectionOf } from '@/lib/sections';
import { FileEditor } from '../files/FileEditor';
import { ContestSettings } from '../forms/ContestSettings';
import { PeopleSection } from '../people/PeopleSection';
import { STORED, viewFilePath } from './places';
import { SectionPage } from '../SectionPage';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { ContestClarifications } from '../threads/Clarifications';

/**
 * The contest's settings as a form in sections, read as the page opens, so
 * the version it saves against is the one the organiser started from; then
 * the settings as they are stored, to read with every change to them, which
 * View file leads to and where an admin fixes them as text when the pages
 * cannot read them. A manager sees the admin's settings and cannot change
 * them.
 */
export function ContestSettingsPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage
      section={sectionOf(CONTEST_SECTIONS, 'settings')}
      links={<PageLink to={viewFilePath(org, contest)}>View file</PageLink>}
    >
      <Card>
        <ContestSettings org={org} contest={contest} />
      </Card>
      <section aria-label="The settings as stored" id={STORED}>
        <Card>
          <FileEditor place={{ kind: 'contest', org, contest }} path="contest.yaml" />
        </Card>
      </section>
    </SectionPage>
  );
}

/** Every announcement of the contest, and for a manager the form that posts one. */
export function ContestAnnouncementsPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'announcements')}>
      <AnnouncementsSection place={{ kind: 'contest', org, contest }} />
    </SectionPage>
  );
}

/** Every question of the contest, with the way to the org's open questions. */
export function ContestQuestionsPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage
      section={sectionOf(CONTEST_SECTIONS, 'questions')}
      links={
        <PageLink to={orgSectionPath(org, 'questions')}>
          Open questions across the org
        </PageLink>
      }
    >
      <Card>
        <ContestClarifications org={org} contest={contest} />
      </Card>
    </SectionPage>
  );
}

/** Everyone who organises the contest, and the invites to join them. */
export function ContestOrganisersPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'organisers')}>
      <PeopleSection place={{ kind: 'contest', org, contest }} />
    </SectionPage>
  );
}
