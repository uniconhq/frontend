import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { Announcement } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { useFallbackPoll } from '@/live';
import { holdsAt } from '../roles';
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
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await onSend({ title, body });
      setTitle(initial.title);
      setBody(initial.body);
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
      {error !== null && <ErrorBlock error={error} compact />}
      <div className={classes.actions}>
        <Button type="submit" size="xs" loading={sending}>
          {label}
        </Button>
        {onCancel !== undefined && (
          <Button size="xs" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** One announcement with, for a manager, Edit and Close; there is no delete. */
function Managed({
  announcement,
  manages,
  changes,
  onChanged,
}: {
  announcement: Announcement;
  manages: boolean;
  changes: ReturnType<typeof useAnnouncementChanges>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = announcement.title;

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
    <li className={itemClass(announcement)}>
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
            loading={closing}
            onClick={() => {
              setError(null);
              setClosing(true);
              changes
                .close(announcement.number)
                .then(onChanged)
                .catch((refused: unknown) => setError(refused))
                .finally(() => setClosing(false));
            }}
          >
            Close
          </Button>
        </div>
      )}
      {error !== null && <ErrorBlock error={error} compact />}
    </li>
  );
}

/**
 * The announcements of a contest or a task for its organisers: every one,
 * newest first, closed ones kept and marked so, with a composer, Edit and
 * Close for a manager. There is no delete anywhere, since a message people
 * have already read should not vanish.
 */
export function AnnouncementsSection({ place }: { place: AnnouncementPlace }) {
  const queryClient = useQueryClient();
  const manages = holdsAt(useMe().roles, place, 'manager');
  const view = queryView(useManagedAnnouncements(place, useFallbackPoll(60_000)));
  const changes = useAnnouncementChanges(place);
  const readAgain = () =>
    queryClient.invalidateQueries({ queryKey: announcementsQuery(place).queryKey });

  return (
    <div className={classes.stack}>
      <SectionTitle>Announcements</SectionTitle>
      {manages && (
        <Composer
          label="Post announcement"
          initial={{ title: '', body: '' }}
          onSend={async (text) => {
            await changes.post(text);
            await readAgain();
          }}
        />
      )}
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText tone="secondary">No announcements yet.</BodyText>
        ) : (
          <ol className={classes.list} aria-label="Announcements">
            {[...view.data].reverse().map((announcement) => (
              <Managed
                key={announcement.number}
                announcement={announcement}
                manages={manages}
                changes={changes}
                onChanged={readAgain}
              />
            ))}
          </ol>
        ))}
    </div>
  );
}
