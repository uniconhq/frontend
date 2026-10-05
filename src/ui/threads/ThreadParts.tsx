import type { Announcement, Clarification } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Markdown } from '@/ui/Markdown';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import classes from './threads.module.css';

/**
 * One announcement's title, when it was posted, which task it is on when
 * `showPlace` asks, whether it is closed or answers a question, and its text.
 * The contestant's lists and the organisers' section both show it so.
 */
export function AnnouncementContent({
  announcement,
  showPlace = false,
}: {
  announcement: Announcement;
  showPlace?: boolean;
}) {
  const place = showPlace ? announcement.where.task : null;
  return (
    <>
      <strong>{announcement.title}</strong>
      <BodyText tone="meta">
        {formatDateTime(new Date(announcement.posted_at))}
        {place !== null && ` · ${t('task')} ${place}`}
        {announcement.closed && ` · ${t('closed')}`}
        {announcement.answers_question && ` · ${t('answers a question')}`}
      </BodyText>
      <Markdown>{announcement.body}</Markdown>
    </>
  );
}

/**
 * One question as its asker or an organiser reads it: what was asked, about
 * which task, whether it is answered, and every message under it, each
 * marked as the asker's, under the name `asker` gives, or the organisers'.
 */
export function QuestionThread({
  clarification,
  asker,
}: {
  clarification: Clarification;
  asker: string;
}) {
  return (
    <>
      <strong>{clarification.title}</strong>
      <BodyText tone="meta">
        {formatDateTime(new Date(clarification.asked_at))}
        {clarification.task !== null && ` · ${t('task')} ${clarification.task}`}
        {' · '}
        {clarification.answered ? t('Answered') : t('Open')}
      </BodyText>
      <Markdown>{clarification.body}</Markdown>
      {clarification.messages.length > 0 && (
        <ol
          className={classes.messages}
          aria-label={`${t('Messages on')} ${clarification.title}`}
        >
          {clarification.messages.map((message, index) => (
            <li key={index}>
              <BodyText tone="meta">
                {message.from_asker ? asker : t('Organisers')} ·{' '}
                {formatDateTime(new Date(message.at))}
              </BodyText>
              <Markdown>{message.body}</Markdown>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
