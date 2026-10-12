import { useState } from 'react';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/SectionTitle';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import { useTaskParams } from '@/lib/route-params';
import { TASK_SECTIONS, sectionOf } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { FileEditor } from '../files/FileEditor';
import { SavedFolder } from '../files/FilePreview';
import type { Place } from '../files/place';
import { PageLink } from '@/ui/PageLink';
import { taskPath } from '@/lib/organiser-paths';
import { savedBy } from './published';
import { STORED } from '../contest/places';
import { TitleForm } from './TitleForm';
import { PeopleSection } from '../people/PeopleSection';
import { holdsAt } from '../roles';
import { SectionPage } from '../SectionPage';
import { AnnouncementsSection } from '../threads/AnnouncementsSection';
import { GradingsSection } from './GradingsSection';
import classes from '../organise.module.css';

function useTaskPlace() {
  const { org, contest, task } = useTaskParams();
  const place = { kind: 'task' as const, org, contest, task };
  return { place, admin: holdsAt(useMe().roles, place, 'admin') };
}

/**
 * The task's title, the one setting not on its page. Its workflow, inputs,
 * tests and scoring are set on the task's own page.
 */
export function TaskSettingsPage() {
  const { place, admin } = useTaskPlace();
  const { org, contest, task } = place;
  return (
    <SectionPage
      section={sectionOf(TASK_SECTIONS, 'settings')}
      intro={
        <BodyText tone="secondary">
          The workflow, inputs, tests and scoring are set on{' '}
          <PageLink to={taskPath(org, contest, task)}>the task’s page</PageLink>.
        </BodyText>
      }
    >
      <Card>
        <TitleForm place={place} admin={admin} />
      </Card>
      <section aria-label="The settings as stored" id={STORED}>
        <Card>
          <FileEditor place={place} path="task.yaml" />
        </Card>
      </section>
      {admin && <AllFiles place={place} />}
    </SectionPage>
  );
}

/**
 * Every file the task holds, for its admins to read (M51): the files its
 * forms make, and anything else in it, as a tree, a file chosen shown below.
 * Nothing here changes a file: the task's forms do that.
 */
function AllFiles({ place }: { place: Extract<Place, { kind: 'task' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className={classes.stack}>
        <SectionTitle>All files</SectionTitle>
        <BodyText tone="secondary">
          Every file the task holds, to read. Its forms change them: tests in Tests and
          scoring, pictures from the Statement card, and a setting&apos;s file in its
          box on the Inputs card.
        </BodyText>
        <div className={classes.actions}>
          <Button
            variant="secondary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide the files' : 'View all files'}
          </Button>
        </div>
        {open && (
          <SavedFolder
            place={place}
            path=""
            title="The task's files"
            heading="The task's files"
          />
        )}
      </div>
    </Card>
  );
}

/** The task's gradings with their controls, and Rejudge for the whole task. */
export function TaskGradingsPage() {
  const { place } = useTaskPlace();
  const { org, contest, task } = place;
  return (
    <SectionPage section={sectionOf(TASK_SECTIONS, 'gradings')}>
      <Card>
        <GradingsSection path={{ org, contest, task }} />
      </Card>
    </SectionPage>
  );
}

/** Every publication of the task, newest first, with what each changed. */
export function TaskPublicationsPage() {
  const { place } = useTaskPlace();
  const { org, contest, task } = place;
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/publications',
      { params: { path: { org, contest, task } } },
    ),
  );
  const history = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/history',
    { params: { path: { org, contest, task } } },
  );
  return (
    <SectionPage section={sectionOf(TASK_SECTIONS, 'publications')}>
      <Card>
        <Loaded view={view} rows={2}>
          {(publications) =>
            publications.length === 0 ? (
              <BodyText>
                None yet. The first save without problems publishes the task.
              </BodyText>
            ) : (
              <ol className={classes.list} aria-label="Publications">
                {[...publications].reverse().map((publication) => (
                  <li key={publication.number}>
                    <BodyText>
                      <strong>Publication {publication.number}</strong> ·{' '}
                      {formatDateTime(new Date(publication.at))}
                      {savedBy(publication, history.data) === null
                        ? ''
                        : ` by ${savedBy(publication, history.data) ?? ''}`}{' '}
                      ·{' '}
                      {publication.grading_changed
                        ? 'changed how submissions are graded'
                        : 'grades the same as the one before'}
                    </BodyText>
                    {publication.changes.length > 0 && (
                      <ul className={classes.named}>
                        {publication.changes.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )
          }
        </Loaded>
      </Card>
    </SectionPage>
  );
}

/** Every announcement of the task, and for a manager the form that posts one. */
export function TaskAnnouncementsPage() {
  const { place } = useTaskPlace();
  return (
    <SectionPage section={sectionOf(TASK_SECTIONS, 'announcements')}>
      <AnnouncementsSection place={place} />
    </SectionPage>
  );
}

/** Everyone who organises the task, and the invites to join them. */
export function TaskOrganisersPage() {
  const { place } = useTaskPlace();
  return (
    <SectionPage section={sectionOf(TASK_SECTIONS, 'organisers')}>
      <PeopleSection place={place} />
    </SectionPage>
  );
}
