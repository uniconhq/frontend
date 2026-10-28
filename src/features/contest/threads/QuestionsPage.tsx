import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { AnnouncementLink, Clarification, ContestHome } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Page, PageHeader } from '@/ui/Page';
import { BackToOrganising } from '../BackToOrganising';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestHomePath } from '@/lib/contest-paths';
import { inTeams } from '@/lib/entrants';
import { useFallbackPoll } from '@/live';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_VIEW_SECTIONS, contestSectionPath, sectionOf } from '@/lib/sections';
import { announcementAnchor } from '@/ui/threads/anchors';
import { QuestionThread } from '@/ui/threads/ThreadParts';
import { BySession } from '../BySession';
import { ASK_WORDS, notIn, type NotIn } from '../entry/not-in';
import { labelOf } from '@/lib/task-names';
import { SignInPrompt } from '../SignInPrompt';
import { ASK_ABOUT, QUESTIONS, useMyQuestions } from './questions';
import classes from '@/ui/threads/threads.module.css';

/**
 * A contestant's follow-up, folded behind "Follow up" until it is wanted and
 * opening in place; sending one opens an answered question again.
 */
function FollowUp({
  org,
  contest,
  clarification,
  onSent,
}: {
  org: string;
  contest: string;
  clarification: Clarification;
  onSent: () => Promise<void>;
}) {
  const followUp = $api.useMutation('post', `${QUESTIONS}/{number}/comments`, {
    onSuccess: () => onSent(),
  });
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (followUp.isPending) return;
    followUp.mutate(
      {
        params: { path: { org, contest, number: clarification.number } },
        body: { body },
      },
      {
        onSuccess: () => {
          setBody('');
          setOpen(false);
        },
      },
    );
  };

  if (!open) {
    return (
      <div className={classes.actions}>
        <Button
          size="xs"
          variant="secondary"
          label={`Follow up ${clarification.title}`}
          onClick={() => {
            followUp.reset();
            setOpen(true);
          }}
        >
          Follow up
        </Button>
      </div>
    );
  }
  return (
    <form
      className={classes.form}
      onSubmit={send}
      aria-label={`Follow up ${clarification.title}`}
    >
      <Textarea
        label="Follow up"
        value={body}
        onChange={setBody}
        rows={3}
        required
        autoFocus
      />
      {clarification.answered && (
        <BodyText tone="secondary">
          Sending this opens the question again for the organisers.
        </BodyText>
      )}
      {followUp.error !== null && <ErrorBlock error={followUp.error} compact />}
      <div className={classes.actions}>
        <Button
          type="submit"
          size="xs"
          variant="secondary"
          loading={followUp.isPending}
        >
          Send
        </Button>
        <Button size="xs" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The form a contestant asks with, naming a released task if they like, the
 * one `about` names to begin with.
 */
function AskForm({
  org,
  contest,
  tasks,
  about,
  onAsked,
}: {
  org: string;
  contest: string;
  tasks: { name: string; title: string }[];
  about: string;
  onAsked: () => Promise<void>;
}) {
  const ask = $api.useMutation('post', QUESTIONS, { onSuccess: () => onAsked() });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [task, setTask] = useState(about);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (ask.isPending) return;
    ask.mutate(
      {
        params: { path: { org, contest } },
        body: { title, body, task: task === '' ? null : task },
      },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          setTask('');
        },
      },
    );
  };

  return (
    <form className={classes.form} onSubmit={send} aria-label="Ask">
      <TextInput
        label="Question"
        value={title}
        onChange={setTitle}
        maxLength={200}
        required
      />
      <Textarea label="Details" value={body} onChange={setBody} rows={3} required />
      {tasks.length > 0 && (
        <Select
          label="About the task"
          value={task}
          placeholder="The contest as a whole"
          options={tasks.map((found) => ({ value: found.name, label: found.title }))}
          onChange={setTask}
        />
      )}
      {ask.error !== null && <ErrorBlock error={ask.error} compact />}
      <div className={classes.actions}>
        <Button type="submit" size="xs" loading={ask.isPending}>
          Ask
        </Button>
      </div>
    </form>
  );
}

/**
 * A contestant's questions to the organisers, private to them and the
 * organisers: a form to ask, about the task the address names when it names
 * one of the contest's, and every question they asked with the answers under
 * it, newest first. Commenting again on an answered question is how they
 * follow up; it reopens the question rather than starting a new one. In a
 * contest entered in teams, a question is the team's, and everyone in it
 * reads it.
 */
function Questions({
  org,
  contest,
  home,
}: {
  org: string;
  contest: string;
  home: ContestHome;
}) {
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const team = inTeams(home.registration);
  // Named as the contest's page names them: its letter, then its title.
  const tasks = home.tasks.map((task) => {
    const label = labelOf(task);
    return {
      name: task.name,
      title: label === null ? task.title : `${label} · ${task.title}`,
    };
  });
  const named = search.get(ASK_ABOUT);
  const about = tasks.some((task) => task.name === named) ? (named ?? '') : '';
  const view = queryView(useMyQuestions(org, contest));
  const openAnnouncement = useOpenAnnouncements(org, contest);
  // A withdrawn task's announcements are off the contest's page with it.
  const withdrawn = (task: string | null) =>
    home.tasks.some(
      (found) => found.name === task && found.release.closed === 'withdrawn',
    );
  const readAgain = () =>
    queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', QUESTIONS, {
        params: { path: { org, contest } },
      }).queryKey,
    });

  return (
    <>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Ask a question</SectionTitle>
          <BodyText tone="secondary">
            {team
              ? 'Only your team and the organisers see what any of you asks.'
              : 'Only you and the organisers see what you ask.'}
          </BodyText>
          <AskForm
            key={about}
            org={org}
            contest={contest}
            tasks={tasks}
            about={about}
            onAsked={readAgain}
          />
        </div>
      </Card>
      <Card>
        <div className={classes.stack}>
          <SectionTitle>
            {team ? 'Your team’s questions' : 'Your questions'}
          </SectionTitle>
          {view.state === 'loading' && <PageSkeleton rows={2} />}
          {view.state === 'error' && (
            <ErrorBlock error={view.error} onRetry={view.retry} />
          )}
          {view.state === 'ready' && view.data.length === 0 && (
            <BodyText tone="secondary">No questions asked yet.</BodyText>
          )}
          {view.state === 'ready' && view.data.length > 0 && (
            <ol className={classes.questions} aria-label="Your questions">
              {[...view.data].reverse().map((clarification) => (
                <li key={clarification.number}>
                  <QuestionThread
                    clarification={clarification}
                    asker={team ? 'Your team' : 'You'}
                    taskTitle={
                      tasks.find((task) => task.name === clarification.task)?.title
                    }
                    announcementAt={(link) =>
                      openAnnouncement(link)
                        ? {
                            href: `${contestHomePath(org, contest)}#${announcementAnchor(link)}`,
                          }
                        : { gone: withdrawn(link.task) ? 'withdrawn' : 'closed' }
                    }
                  >
                    <FollowUp
                      org={org}
                      contest={contest}
                      clarification={clarification}
                      onSent={readAgain}
                    />
                  </QuestionThread>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </>
  );
}

/**
 * Whether an announcement a public answer posted can still be read on the
 * contest's page, which lists only open announcements: false once the
 * organisers closed it or its task was withdrawn, so its message on the
 * question says why rather than link to nothing. Taken as open until the list is read. The list is the one
 * the contest's page reads, so it is read once for both.
 */
function useOpenAnnouncements(
  org: string,
  contest: string,
): (link: AnnouncementLink) => boolean {
  const open = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/home/announcements',
    { params: { path: { org, contest } } },
    { refetchInterval: useFallbackPoll(60_000) },
  );
  return (link) =>
    open.data === undefined ||
    open.data.some(
      (announcement) =>
        announcement.number === link.number && announcement.where.task === link.task,
    );
}

const TITLE = sectionOf(CONTEST_VIEW_SECTIONS, 'questions').label;

function Back({ org, contest }: { org: string; contest: string }) {
  return <PageLink to={contestHomePath(org, contest)}>Back to the contest</PageLink>;
}

/**
 * The questions page as a signed-in person reads it: theirs to ask once
 * their entry is approved, and otherwise what they need first. The contest's
 * home is read for that and for its tasks, as its page reads it.
 */
function SignedInQuestions({ org, contest }: { org: string; contest: string }) {
  const view = queryView(
    $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
      params: { path: { org, contest } },
    }),
  );
  return (
    <Page>
      <PageHeader
        title={TITLE}
        links={
          <>
            <Back org={org} contest={contest} />
            <BackToOrganising org={org} contest={contest} />
          </>
        }
      />
      {view.state === 'loading' && <PageSkeleton rows={4} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.registration.entrant?.status === 'approved' ? (
          <Questions org={org} contest={contest} home={view.data} />
        ) : (
          <Card>
            {view.data.organises ? (
              <BodyText>
                You organise this contest. Its entrants&apos; questions are answered on
                its{' '}
                <PageLink to={contestSectionPath(org, contest, 'questions')}>
                  Questions
                </PageLink>{' '}
                page.
              </BodyText>
            ) : (
              <BodyText>
                {ASK_WORDS[notIn(view.data) as Exclude<NotIn, 'organises'>]}
              </BodyText>
            )}
          </Card>
        ))}
    </Page>
  );
}

/**
 * A contest's questions to its organisers, at one address for everyone: a
 * signed-in person's own, and for a visitor a way to sign in first.
 */
export function QuestionsPage() {
  const { org, contest } = useContestParams();
  return (
    <BySession
      signedIn={<SignedInQuestions org={org} contest={contest} />}
      visitor={
        <SignInPrompt
          title="Sign in to ask the organisers a question"
          back={<Back org={org} contest={contest} />}
        />
      }
    />
  );
}
