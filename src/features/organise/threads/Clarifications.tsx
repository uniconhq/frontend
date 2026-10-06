import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { $api, queryView } from '@/api/query';
import type { Clarification } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { useFallbackPoll } from '@/live';
import { clarificationsPath, orgPath } from '@/lib/organiser-paths';
import { useOrgParam } from '@/lib/route-params';
import { holdsAtContest } from '../roles';
import { QuestionThread } from '@/ui/threads/ThreadParts';
import { isTeams } from '@/ui/threads/asker';
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

/**
 * One question for an organiser and, for a manager of its contest, what can
 * be done with it: Reply, which leaves it open and so still in the inbox;
 * Mark as answered, which closes it with or without a reply and takes it out
 * of the inbox; Unmark on an answered one, which opens it again; and Answer
 * publicly, which posts an announcement every contestant reads, pointing at
 * the question, which stays private.
 */
function ClarificationCard({
  clarification,
  manages,
}: {
  clarification: Clarification;
  manages: boolean;
}) {
  const queryClient = useQueryClient();
  const reply = $api.useMutation('post', `${QUESTION}/replies`);
  const mark = $api.useMutation('put', `${QUESTION}/answered`);
  const unmark = $api.useMutation('delete', `${QUESTION}/answered`);
  const publish = $api.useMutation('post', `${QUESTION}/announcement`);
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState(clarification.title);
  const [answer, setAnswer] = useState('');
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

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await change.run('reply', () =>
      reply.mutateAsync({ params: { path }, body: { body } }),
    );
    if (outcome.ok) setBody('');
  };

  const sendAnswer = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await change.run('publish', () =>
      publish.mutateAsync({ params: { path }, body: { title, body: answer } }),
    );
    if (outcome.ok) {
      setPublishing(false);
      setAnswer('');
    }
  };

  return (
    <li className={classes.item}>
      <BodyText tone="meta">
        {org}/{contest}
      </BodyText>
      <QuestionThread
        clarification={clarification}
        asker={isTeams(clarification) ? 'Team' : 'Contestant'}
      />
      {manages && (
        <>
          <form
            className={classes.form}
            onSubmit={(event) => void sendReply(event)}
            aria-label={`Reply to ${name}`}
          >
            <Textarea label="Reply" value={body} onChange={setBody} rows={2} required />
            <div className={classes.actions}>
              <Button
                type="submit"
                size="xs"
                variant="secondary"
                loading={busy === 'reply'}
              >
                Reply
              </Button>
              {clarification.answered ? (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Unmark ${name}`}
                  loading={busy === 'unmark'}
                  onClick={() =>
                    void change.run('unmark', () =>
                      unmark.mutateAsync({ params: { path } }),
                    )
                  }
                >
                  Unmark
                </Button>
              ) : (
                <Button
                  size="xs"
                  label={`Mark as answered ${name}`}
                  loading={busy === 'mark'}
                  onClick={() =>
                    void change.run('mark', () =>
                      mark.mutateAsync({ params: { path } }),
                    )
                  }
                >
                  Mark as answered
                </Button>
              )}
              <Button
                size="xs"
                variant="secondary"
                label={`Answer publicly ${name}`}
                onClick={() => setPublishing(!publishing)}
              >
                Answer publicly
              </Button>
            </div>
          </form>
          {publishing && (
            <form
              className={classes.form}
              onSubmit={(event) => void sendAnswer(event)}
              aria-label={`Answer publicly ${name}`}
            >
              <BodyText tone="secondary">
                Every contestant reads this announcement. The question itself stays
                private.
              </BodyText>
              <TextInput
                label="Title"
                value={title}
                onChange={setTitle}
                maxLength={200}
                required
              />
              <Textarea
                label="Answer"
                value={answer}
                onChange={setAnswer}
                rows={3}
                required
              />
              <div className={classes.actions}>
                <Button type="submit" size="xs" loading={busy === 'publish'}>
                  Post announcement
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {change.error !== null && <ErrorBlock error={change.error} compact />}
    </li>
  );
}

/**
 * The organisers' inbox: every question still open across the org, oldest
 * first, so the one waiting longest is on top. Replying keeps a question
 * here; only marking it answered takes it off.
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
    <div className={classes.stack}>
      <PageLink to={orgPath(org)}>Back to the org</PageLink>
      <PageTitle>Questions</PageTitle>
      <BodyText tone="secondary">
        Every question still open across the org. A reply keeps a question here; only
        Mark as answered takes it off.
      </BodyText>
      <Card>
        {view.state === 'loading' && <PageSkeleton rows={3} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' &&
          (view.data.length === 0 ? (
            <BodyText>No question is waiting.</BodyText>
          ) : (
            <ol className={classes.list} aria-label="Open questions">
              {view.data.map((clarification) => (
                <ClarificationCard
                  key={`${clarification.contest.contest ?? ''}/${clarification.asker}/${String(clarification.number)}`}
                  clarification={clarification}
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
    </div>
  );
}

/**
 * Every question of one contest, newest first, answered ones included, for
 * its organisers, beside the contest's other settings.
 */
export function ContestClarifications({
  org,
  contest,
}: {
  org: string;
  contest: string;
}) {
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const view = queryView(
    $api.useQuery(
      'get',
      OF_CONTEST,
      { params: { path: { org, contest } } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );

  return (
    <div className={classes.stack}>
      <SectionTitle>Questions</SectionTitle>
      <PageLink to={clarificationsPath(org)}>Open questions across the org</PageLink>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText tone="secondary">Nobody has asked anything yet.</BodyText>
        ) : (
          <ol className={classes.list} aria-label="Questions">
            {[...view.data].reverse().map((clarification) => (
              <ClarificationCard
                key={`${clarification.asker}/${String(clarification.number)}`}
                clarification={clarification}
                manages={manages}
              />
            ))}
          </ol>
        ))}
    </div>
  );
}
