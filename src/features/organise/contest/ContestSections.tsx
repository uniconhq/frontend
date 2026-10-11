import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { useMe } from '@/session';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, orgSectionPath, sectionOf } from '@/lib/sections';
import { FileBrowser } from '../files/FileBrowser';
import { ContestSettings } from '../forms/ContestSettings';
import { PeopleSection } from '../people/PeopleSection';
import { BodyText } from '@/ui/BodyText';
import { SectionTitle } from '@/ui/SectionTitle';
import { InvitesSection } from '../invites/InvitesSection';
import { holdsAt, holdsAtContest } from '../roles';
import classes from '../organise.module.css';
import { SectionPage } from '../SectionPage';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { ContestClarifications } from '../threads/Clarifications';

/**
 * The contest's settings as a form, read as the page opens, so the version
 * it saves against is the one the organiser started from. A manager sees the
 * admin's keys and cannot change them.
 */
export function ContestSettingsPage() {
  const { org, contest } = useContestParams();
  const place = { kind: 'contest' as const, org, contest };
  const admin = holdsAt(useMe().roles, place, 'admin');
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'settings')}>
      <Card>
        <ContestSettings place={place} admin={admin} />
      </Card>
    </SectionPage>
  );
}

/**
 * How people enter the contest: for now the invites to a place in it, which
 * a manager makes and an observer reads, the invites members of its teams
 * made among them.
 */
export function ContestEntryPage() {
  const { org, contest } = useContestParams();
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'entry')}>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Invites</SectionTitle>
          <BodyText tone="secondary">
            An invite offers someone a place in this contest. Accepting it registers
            them, and lets them see the contest while only its entrants do.
          </BodyText>
          <InvitesSection
            place={{ kind: 'contest', org, contest }}
            audience="contestants"
            manages={manages}
            administers={false}
          />
        </div>
      </Card>
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

/** The contest's files, the tree beside the open file. */
export function ContestFilesPage() {
  const { org, contest } = useContestParams();
  return (
    <SectionPage section={sectionOf(CONTEST_SECTIONS, 'files')}>
      <Card>
        <FileBrowser place={{ kind: 'contest', org, contest }} />
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
