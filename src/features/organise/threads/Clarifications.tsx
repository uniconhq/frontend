import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { $api, queryView } from '@/api/query';
import type { Clarification } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { useFallbackPoll } from '@/live';
import { useOrgParam } from '@/lib/route-params';
import { ORG_SECTIONS, sectionOf } from '@/lib/sections';
import { holdsAtContest } from '../roles';
import { SectionPage } from '../SectionPage';
import { announcementAnchor } from '@/ui/threads/anchors';
import { QuestionThread } from '@/ui/threads/ThreadParts';
import { contestPath, taskPath } from '@/lib/organiser-paths';
import { useEntrantName } from '../entrants/names';
import { useTaskTitles } from '../contest/task-entry';
import classes from '@/ui/threads/threads.module.css';

const INBOX = '/api/v1/orgs/{org}/clarifications';
const OF_CONTEST = '/api/v1/orgs/{org}/contests/{contest}/clarifications';
const QUESTION =
  '/api/v1/orgs/{org}/contests/{contest}/clarifications/{asker}/{number}';

/**
 * Every read a change to one question can move: the inbox and the contest's
 * list, and the announcement lists, which an answer made public joins.
 */
function isThreadRead(path: unknown): boolean {
  return (
    typeof path === 'string' &&
    (path.includes('/clarifications') || path.includes('/announcements'))
  );
}

/** Who an answer is for: the asker alone, or every entrant (M62). */
const READERS = [
  {
    value: 'asker',
    label: 'Only the asker',
    description:
      'A reply under the question, which only the asker and the organisers read.',
  },
  {
    value: 'everyone',
    label: 'Every entrant (posted as an announcement)',
    description:
      'The question stays private; a message on it links to the announcement.',
  },
];

/** Whether the organisers have written anything under a question yet. */
function replied(clarification: Clarification): boolean {
  return clarification.messages.some((message) => !message.from_asker);
}

/**
 * One question for an organiser, in its own box, and, for a manager of its
 * contest, what can be done with it at the box's foot. Reply opens the one
 * form to answer it in place (M62): who reads the answer, only the asker, as
 * a reply under the question, or every entrant, posted as an announcement
 * under the title given, the question itself staying private and a message
 * on it naming the announcement. Either way sending marks the question
 * answered, unless the manager unticks that, so an answer takes it out of
 * the open questions in one step. Mark it answered closes it without a
 * reply, and asks first while nobody has replied, since the entrant then
 * reads no answer. Reopen opens an answered one again.
 */
function ClarificationCard({
  clarification,
  manages,
  showContest,
}: {
  clarification: Clarification;
  manages: boolean;
  showContest: boolean;
}) {
  const queryClient = useQueryClient();
  const reply = $api.useMutation('post', `${QUESTION}/replies`);
  const mark = $api.useMutation('put', `${QUESTION}/answered`);
  const unmark = $api.useMutation('delete', `${QUESTION}/answered`);
  const publish = $api.useMutation('post', `${QUESTION}/announcement`);
  const [body, setBody] = useState('');
  const [markToo, setMarkToo] = useState(true);
  const [asking, setAsking] = useState(false);
  const [readers, setReaders] = useState<'asker' | 'everyone'>('asker');
  const [replying, setReplying] = useState(false);
  const [title, setTitle] = useState(clarification.title);
  const change = useChange({
    reread: () =>
      queryClient.invalidateQueries({
        predicate: (query) => isThreadRead(query.queryKey[1]),
      }),
  });
  const busy = change.pending;
  const { org, contest } = clarification.contest;
  const path = {
    org,
    contest: contest ?? '',
    asker: clarification.asker,
    number: clarification.number,
  };
  const name = clarification.title;
  const asker = useEntrantName(org, contest, clarification.asker);
  const about = clarification.task;
  const taskTitle = useTaskTitles(
    org,
    contest ?? '',
    about === null || contest === null ? [] : [about],
  ).get(about ?? '');
  const open = !clarification.answered;

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const answering = open && markToo;
    const outcome =
      readers === 'everyone'
        ? await change.run('reply', () =>
            publish.mutateAsync({
              params: { path },
              body: { title, body, mark: answering },
            }),
          )
        : await change.run('reply', async () => {
            await reply.mutateAsync({ params: { path }, body: { body } });
            if (answering) await mark.mutateAsync({ params: { path } });
          });
    if (outcome.ok) {
      setBody('');
      setReaders('asker');
      setReplying(false);
    }
  };

  const markAnswered = async () => {
    const outcome = await change.run('mark', () =>
      mark.mutateAsync({ params: { path } }),
    );
    if (outcome.ok) setAsking(false);
  };

  const markOrReopen = open ? (
    <Button
      size="xs"
      variant="secondary"
      label={`Mark ${name} answered`}
      loading={busy === 'mark'}
      onClick={() => {
        if (replied(clarification)) void markAnswered();
        else setAsking(true);
      }}
    >
      Mark it answered
    </Button>
  ) : (
    <Button
      size="xs"
      variant="secondary"
      label={`Reopen ${name}`}
      loading={busy === 'unmark'}
      onClick={() =>
        void change.run('unmark', () => unmark.mutateAsync({ params: { path } }))
      }
    >
      Reopen
    </Button>
  );

  return (
    <li>
      <QuestionThread
        clarification={clarification}
        asker={asker}
        organisers
        where={showContest ? `${org}/${contest ?? ''}` : undefined}
        taskTitle={taskTitle}
        announcementAt={(link) => ({
          href: `${link.task === null ? contestPath(org, contest ?? '') : taskPath(org, contest ?? '', link.task)}/announcements#${announcementAnchor(link)}`,
        })}
      >
        {manages && (
          <>
            {!replying ? (
              <div className={classes.actions}>
                <Button
                  size="xs"
                  label={`Reply to ${name}`}
                  onClick={() => {
                    change.dismiss();
                    setReplying(true);
                  }}
                >
                  Reply
                </Button>
                {markOrReopen}
              </div>
            ) : (
              <form
                className={classes.form}
                onSubmit={(event) => void sendReply(event)}
                aria-label={`Reply to ${name}`}
              >
                <Textarea
                  label="Answer"
                  value={body}
                  onChange={setBody}
                  rows={3}
                  required
                  autoFocus
                />
                <RadioGroup
                  label="Who reads the answer"
                  value={readers}
                  options={READERS}
                  onChange={(next) =>
                    setReaders(next === 'everyone' ? 'everyone' : 'asker')
                  }
                />
                {readers === 'everyone' && (
                  <TextInput
                    label="Announcement title"
                    value={title}
                    onChange={setTitle}
                    maxLength={200}
                    required
                  />
                )}
                {open && (
                  <Checkbox
                    label="Mark it answered"
                    checked={markToo}
                    onChange={setMarkToo}
                    description={
                      markToo
                        ? 'It leaves the open questions as the answer is sent.'
                        : 'It stays open after the answer, for a fuller one later.'
                    }
                  />
                )}
                <div className={classes.actions}>
                  <Button type="submit" size="xs" loading={busy === 'reply'}>
                    {readers === 'everyone' ? 'Post the announcement' : 'Send reply'}
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setReplying(false);
                      setReaders('asker');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            <Modal
              opened={asking}
              onClose={() => setAsking(false)}
              title="Mark it answered without a reply?"
            >
              <div className={classes.stack}>
                <BodyText>
                  Nobody has replied to &ldquo;{name}&rdquo;. The entrant sees it
                  answered with no answer from you, and it leaves the open questions.
                </BodyText>
                <BodyText tone="secondary">
                  You can reopen it later. To answer it, write a reply instead.
                </BodyText>
                {change.error !== null && <ErrorBlock error={change.error} compact />}
                <div className={classes.actions}>
                  <Button loading={busy === 'mark'} onClick={() => void markAnswered()}>
                    Mark it answered
                  </Button>
                  <Button variant="secondary" onClick={() => setAsking(false)}>
                    Not now
                  </Button>
                </div>
              </div>
            </Modal>
          </>
        )}
        {change.error !== null && !asking && (
          <ErrorBlock error={change.error} compact />
        )}
      </QuestionThread>
    </li>
  );
}

/**
 * The organisers' inbox: every question still open across the org, oldest
 * first, so the one waiting longest is on top. A reply takes a question off
 * unless the manager keeps it open; so does marking it answered.
 */
export function InboxPage() {
  const org = useOrgParam();
  const roles = useMe().roles;
  const view = queryView(
    $api.useQuery(
      'get',
      INBOX,
      { params: { path: { org } } },
      { refetchInterval: useFallbackPoll(30_000) },
    ),
  );

  return (
    <SectionPage
      section={sectionOf(ORG_SECTIONS, 'questions')}
      intro={
        <BodyText tone="secondary">
          Every question still open across the org, the one waiting longest first.
          Replying marks a question answered and takes it off this list, unless you
          untick Mark it answered.
        </BodyText>
      }
    >
      <Card>
        {view.state === 'loading' && <PageSkeleton rows={3} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' &&
          (view.data.length === 0 ? (
            <BodyText>No questions are waiting for an answer.</BodyText>
          ) : (
            <ol className={classes.questions} aria-label="Open questions">
              {view.data.map((clarification) => (
                <ClarificationCard
                  key={`${clarification.contest.contest ?? ''}/${clarification.asker}/${String(clarification.number)}`}
                  clarification={clarification}
                  showContest
                  manages={holdsAtContest(
                    roles,
                    clarification.contest.org,
                    clarification.contest.contest ?? '',
                    'manager',
                  )}
                />
              ))}
            </ol>
          ))}
      </Card>
    </SectionPage>
  );
}

/**
 * Every question of one contest for its organisers: the open ones first, the
 * one waiting longest on top, and the answered ones under them, folded away
 * until asked for, newest first.
 */
export function ContestClarifications({
  org,
  contest,
}: {
  org: string;
  contest: string;
}) {
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const [showAnswered, setShowAnswered] = useState(false);
  const view = queryView(
    $api.useQuery(
      'get',
      OF_CONTEST,
      { params: { path: { org, contest } } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );

  const card = (clarification: Clarification) => (
    <ClarificationCard
      key={`${clarification.asker}/${String(clarification.number)}`}
      clarification={clarification}
      manages={manages}
      showContest={false}
    />
  );

  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.length === 0) {
    return <BodyText tone="secondary">Nobody has asked anything yet.</BodyText>;
  }
  const open = view.data
    .filter((found) => !found.answered)
    .sort((a, b) => Date.parse(a.asked_at) - Date.parse(b.asked_at));
  const answered = view.data
    .filter((found) => found.answered)
    .sort((a, b) => Date.parse(b.asked_at) - Date.parse(a.asked_at));
  const count = (n: number) =>
    `${String(n)} answered ${n === 1 ? 'question' : 'questions'}`;

  return (
    <div className={classes.stack}>
      <SectionTitle>Open</SectionTitle>
      {open.length === 0 ? (
        <BodyText tone="secondary">Every question is answered.</BodyText>
      ) : (
        <ol className={classes.questions} aria-label="Open questions">
          {open.map(card)}
        </ol>
      )}
      {answered.length > 0 && (
        <>
          <div className={classes.actions}>
            <Button variant="secondary" onClick={() => setShowAnswered(!showAnswered)}>
              {showAnswered
                ? 'Hide the answered questions'
                : `Show ${count(answered.length)}`}
            </Button>
          </div>
          {showAnswered && (
            <ol className={classes.questions} aria-label="Answered questions">
              {answered.map(card)}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
