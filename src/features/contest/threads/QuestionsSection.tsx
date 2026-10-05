import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { Clarification } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useFallbackPoll } from '@/live';
import { t } from '@/lib/t';
import { QuestionThread } from '@/ui/threads/ThreadParts';
import classes from '@/ui/threads/threads.module.css';

const QUESTIONS = '/api/v1/orgs/{org}/contests/{contest}/questions';

/** A contestant's follow-up, which opens an answered question again. */
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
  const followUp = $api.useMutation('post', `${QUESTIONS}/{number}/comments`);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await followUp.mutateAsync({
        params: { path: { org, contest, number: clarification.number } },
        body: { body },
      });
      setBody('');
      await onSent();
    } catch (refused) {
      setError(refused);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void send(event)}
      aria-label={`${t('Follow up')} ${clarification.title}`}
    >
      <Textarea
        label={t('Follow up')}
        value={body}
        onChange={setBody}
        rows={2}
        required
      />
      {clarification.answered && (
        <BodyText tone="secondary">
          {t('Sending this opens the question again for the organisers.')}
        </BodyText>
      )}
      {error !== null && <ErrorBlock error={error} compact />}
      <div className={classes.actions}>
        <Button type="submit" size="xs" variant="secondary" loading={sending}>
          {t('Send')}
        </Button>
      </div>
    </form>
  );
}

/** The form a contestant asks with, naming a released task if they like. */
function AskForm({
  org,
  contest,
  tasks,
  onAsked,
}: {
  org: string;
  contest: string;
  tasks: { name: string; title: string }[];
  onAsked: () => Promise<void>;
}) {
  const ask = $api.useMutation('post', QUESTIONS);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [task, setTask] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await ask.mutateAsync({
        params: { path: { org, contest } },
        body: { title, body, task: task === '' ? null : task },
      });
      setTitle('');
      setBody('');
      setTask('');
      await onAsked();
    } catch (refused) {
      setError(refused);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void send(event)}
      aria-label={t('Ask')}
    >
      <TextInput
        label={t('Question')}
        value={title}
        onChange={setTitle}
        maxLength={200}
        required
      />
      <Textarea
        label={t('Details')}
        value={body}
        onChange={setBody}
        rows={3}
        required
      />
      {tasks.length > 0 && (
        <Select
          label={t('About the task')}
          value={task}
          placeholder={t('The contest as a whole')}
          options={tasks.map((found) => ({ value: found.name, label: found.title }))}
          onChange={setTask}
        />
      )}
      {error !== null && <ErrorBlock error={error} compact />}
      <div className={classes.actions}>
        <Button type="submit" size="xs" loading={sending}>
          {t('Ask')}
        </Button>
      </div>
    </form>
  );
}

/**
 * A contestant's questions to the organisers, private to them and the
 * organisers: a form to ask, and every question they asked with the answers
 * under it, newest first. Commenting again on an answered question is how
 * they follow up; it reopens the question rather than starting a new one.
 * Refetched when a nudge says one changed, and polled while the live stream
 * is closed.
 */
export function QuestionsSection({
  org,
  contest,
  tasks,
}: {
  org: string;
  contest: string;
  tasks: { name: string; title: string }[];
}) {
  const queryClient = useQueryClient();
  const query = $api.queryOptions('get', QUESTIONS, {
    params: { path: { org, contest } },
  });
  const view = queryView(
    $api.useQuery(
      'get',
      QUESTIONS,
      { params: { path: { org, contest } } },
      { refetchInterval: useFallbackPoll(30_000) },
    ),
  );
  const readAgain = () => queryClient.invalidateQueries({ queryKey: query.queryKey });

  return (
    <div className={classes.stack}>
      <SectionTitle>{t('Questions to the organisers')}</SectionTitle>
      <BodyText tone="secondary">
        {t('Only you and the organisers see what you ask.')}
      </BodyText>
      <AskForm org={org} contest={contest} tasks={tasks} onAsked={readAgain} />
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && view.data.length > 0 && (
        <ol className={classes.list} aria-label={t('Your questions')}>
          {[...view.data].reverse().map((clarification) => (
            <li key={clarification.number} className={classes.item}>
              <QuestionThread clarification={clarification} asker={t('You')} />
              <FollowUp
                org={org}
                contest={contest}
                clarification={clarification}
                onSent={readAgain}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
