import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { queryView } from '@/api/query';
import type { Announcement } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import { useFallbackPoll } from '@/live';
import { useEntrantName } from '../entrants/names';
import { holdsAt } from '../roles';
import { announcementAnchor } from '@/ui/threads/anchors';
import { AnnouncementContent } from '@/ui/threads/ThreadParts';
import { itemClass } from '@/ui/threads/item-class';
import {
  announcementsQuery,
  useAnnouncementChanges,
  useManagedAnnouncements,
  type AnnouncementPlace,
} from './announcements';
import classes from '@/ui/threads/threads.module.css';

/**
 * A title and a text, the one form for posting an announcement and for
 * editing one. It keeps what was typed when the server refuses it, and the
 * refusal says which field it was about. It sends once at a time, until
 * the list has been read again, so a second click while the page catches up
 * never posts the same announcement twice.
 */
function Composer({
  label,
  initial,
  onSend,
  onCancel,
}: {
  label: string;
  initial: { title: string; body: string };
  onSend: (text: { title: string; body: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const change = useChange();

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if ((await change.run('send', () => onSend({ title, body }))).ok) {
      setTitle(initial.title);
      setBody(initial.body);
    }
  };

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void send(event)}
      aria-label={label}
    >
      <TextInput
        label="Title"
        value={title}
        onChange={setTitle}
        maxLength={200}
        required
      />
      <Textarea label="Text" value={body} onChange={setBody} rows={4} required />
      {change.error !== null && <ErrorBlock error={change.error} compact />}
      <div className={classes.actions}>
        <Button type="submit" loading={change.pending !== null}>
          {label}
        </Button>
        {onCancel !== undefined && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * One announcement with, for a manager, Edit and Close while it is open, and
 * Reopen once it is closed; there is no delete. Close asks first, saying what
 * entrants will then see, on the contest's page or the task's (`where`), and,
 * for a public answer (M62), that its asker loses the answer.
 */
function Managed({
  announcement,
  manages,
  where,
  changes,
  onChanged,
}: {
  announcement: Announcement;
  manages: boolean;
  where: string;
  changes: ReturnType<typeof useAnnouncementChanges>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const change = useChange({ reread: onChanged });
  const name = announcement.title;
  const answers = announcement.answers;
  const asker = useEntrantName(
    announcement.where.org,
    answers === null ? null : announcement.where.contest,
    answers?.asker ?? '',
  );

  const close = async () => {
    const outcome = await change.run('close', () => changes.close(announcement.number));
    if (outcome.ok) setClosing(false);
  };

  if (editing) {
    return (
      <li className={classes.item}>
        <Composer
          label={`Save ${name}`}
          initial={{ title: announcement.title, body: announcement.body }}
          onSend={async (text) => {
            await changes.edit(announcement.number, text);
            setEditing(false);
            await onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li
      className={itemClass(announcement)}
      id={announcementAnchor({
        task: announcement.where.task,
        number: announcement.number,
      })}
    >
      <AnnouncementContent announcement={announcement} />
      {manages && !announcement.closed && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            label={`Edit ${name}`}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="secondary"
            label={`Close ${name}`}
            onClick={() => {
              change.dismiss();
              setClosing(true);
            }}
          >
            Close
          </Button>
        </div>
      )}
      {manages && announcement.closed && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="secondary"
            label={`Reopen ${name}`}
            loading={change.pending === 'reopen'}
            onClick={() =>
              void change.run('reopen', () => changes.reopen(announcement.number))
            }
          >
            Reopen
          </Button>
        </div>
      )}
      {change.error !== null && !closing && <ErrorBlock error={change.error} compact />}
      <Modal
        opened={closing}
        onClose={() => setClosing(false)}
        title="Close this announcement?"
      >
        <div className={classes.stack}>
          <BodyText>
            Entrants will no longer see &ldquo;{name}&rdquo; on {where}. Those who have
            read it are not told it was closed.
          </BodyText>
          {announcement.answers_question && (
            <BodyText>
              {answers === null
                ? 'It answers a question, which will then say the answer was closed.'
                : `It answers a question from ${asker}, whose question will then say the answer was closed.`}
            </BodyText>
          )}
          <BodyText tone="secondary">
            It stays here for the organisers, marked closed, and you can reopen it.
          </BodyText>
          {change.error !== null && <ErrorBlock error={change.error} compact />}
          <div className={classes.actions}>
            <Button loading={change.pending === 'close'} onClick={() => void close()}>
              Close it
            </Button>
            <Button variant="secondary" onClick={() => setClosing(false)}>
              Not now
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  );
}

/**
 * The announcements of a contest or a task for its organisers: every one,
 * newest first, closed ones kept and marked so, with a composer, Edit, Close
 * and Reopen for a manager. There is no delete anywhere, since a message
 * people have already read should not vanish.
 */
export function AnnouncementsSection({ place }: { place: AnnouncementPlace }) {
  const queryClient = useQueryClient();
  const manages = holdsAt(useMe().roles, place, 'manager');
  const view = queryView(useManagedAnnouncements(place, useFallbackPoll(60_000)));
  const changes = useAnnouncementChanges(place);
  const readAgain = () =>
    queryClient.invalidateQueries({ queryKey: announcementsQuery(place).queryKey });

  return (
    <>
      {manages && (
        <Card>
          <div className={classes.stack}>
            <SectionTitle>Post an announcement</SectionTitle>
            <Composer
              label="Post announcement"
              initial={{ title: '', body: '' }}
              onSend={async (text) => {
                await changes.post(text);
                await readAgain();
              }}
            />
          </div>
        </Card>
      )}
      <Card>
        <Loaded view={view} rows={2}>
          {(posted) =>
            posted.length === 0 ? (
              <BodyText tone="secondary">No announcements yet.</BodyText>
            ) : (
              <ol className={classes.list} aria-label="Announcements">
                {[...posted].reverse().map((announcement) => (
                  <Managed
                    key={announcement.number}
                    announcement={announcement}
                    manages={manages}
                    where={
                      place.kind === 'contest'
                        ? 'the contest’s page'
                        : 'the task’s page or the contest’s'
                    }
                    changes={changes}
                    onChanged={readAgain}
                  />
                ))}
              </ol>
            )
          }
        </Loaded>
      </Card>
    </>
  );
}
