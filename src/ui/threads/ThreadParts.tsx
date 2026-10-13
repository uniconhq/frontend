import type { ReactNode } from 'react';
import type { Announcement, AnnouncementLink, Clarification } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { Markdown } from '@/ui/Markdown';
import { PageLink } from '@/ui/PageLink';
import { formatDateTime, serverNow } from '@/lib/time';
import { waitedWords, waitingSince } from './waiting';
import classes from './threads.module.css';

/**
 * Where the announcement a public answer posted is read, or why a reader
 * can no longer read it there: the organisers closed it, or its task was
 * withdrawn from the contest, which takes its announcements off.
 */
export type AnnouncementAt = { href: string } | { gone: 'closed' | 'withdrawn' };

const GONE: Record<'closed' | 'withdrawn', string> = {
  closed: 'which the organisers have since closed',
  withdrawn: 'whose task has since been withdrawn from the contest',
};

/**
 * The message a public answer leaves on its question, "Answered publicly in
 * the announcement ‘On n’", with the announcement's title, as the forge
 * reads it from the message, a link to it (M62); the whole message the link
 * where the message was edited and names no title. Where the reader can no
 * longer open the announcement, the message says why in place of the link.
 */
function AnsweredPublicly({
  body,
  title,
  at,
}: {
  body: string;
  title: string | null;
  at: AnnouncementAt;
}) {
  if ('gone' in at) {
    return (
      <p className={classes.publicAnswer}>
        {body.trimEnd()}, {GONE[at.gone]}.
      </p>
    );
  }
  if (title === null) {
    return (
      <p className={classes.publicAnswer}>
        <PageLink to={at.href}>{body}</PageLink>
      </p>
    );
  }
  return (
    <p className={classes.publicAnswer}>
      Answered publicly in the announcement <PageLink to={at.href}>‘{title}’</PageLink>
    </p>
  );
}

/**
 * One announcement's title, when it was posted, which task it is on when
 * `showPlace` asks, whether it is closed or answers a question, and its text,
 * which on a task's announcement draws the task's own pictures.
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
  const { org, contest, task } = announcement.where;
  const owner = contest !== null && task !== null ? { org, contest, task } : undefined;
  return (
    <>
      <strong>{announcement.title}</strong>
      <BodyText tone="meta">
        {formatDateTime(new Date(announcement.posted_at))}
        {place !== null && ` · task ${place}`}
        {announcement.closed && ' · closed'}
        {announcement.answers_question && ' · answers a question'}
      </BodyText>
      <Markdown task={owner}>{announcement.body}</Markdown>
    </>
  );
}

/**
 * Where a question stands, in a badge at its top right: "Answered", or
 * "Open", with how long it has waited on the organisers' side.
 */
function QuestionBadge({
  clarification,
  organisers,
}: {
  clarification: Clarification;
  organisers: boolean;
}) {
  if (clarification.answered)
    return <Chip tone={organisers ? 'quiet' : 'live'}>Answered</Chip>;
  const since = organisers ? waitingSince(clarification) : null;
  return (
    <Chip tone={organisers ? 'warn' : 'quiet'}>
      {since === null
        ? 'Open'
        : `Open, waiting ${waitedWords(serverNow().getTime() - Date.parse(since))}`}
    </Chip>
  );
}

/**
 * One question in its own box, as its asker or an organiser reads it: its
 * title, which task it is about, a badge saying whether it is answered, and
 * the conversation under it, the question first, each message under who
 * wrote it in bold, the organisers' set apart from the asker's. `asker` is
 * the name the asker's messages go under ("You", "Your team", or the
 * entrant's name for the organisers); `organisers` says the box is read by
 * them, whose badge says how long an open question has waited.
 * `announcementAt` is where the announcement a public answer posted is
 * read, which its message on the question links to, or why the reader can
 * no longer read it there. `children` is what can be done with it, at the
 * box's foot.
 */
export function QuestionThread({
  clarification,
  asker,
  organisers = false,
  where,
  taskTitle,
  announcementAt,
  children,
}: {
  clarification: Clarification;
  asker: string;
  organisers?: boolean;
  announcementAt?: (link: AnnouncementLink) => AnnouncementAt;
  /** Which contest it was asked in, where questions of several are listed. */
  where?: string;
  /** What the reader calls the task it is about; its name while unknown. */
  taskTitle?: string;
  children?: ReactNode;
}) {
  const { title } = clarification;
  const said = [
    {
      from_asker: true,
      body: clarification.body,
      at: clarification.asked_at,
      announcement: null,
    },
    ...clarification.messages,
  ];
  return (
    <article className={classes.question} aria-label={title}>
      <div className={classes.questionHead}>
        <div className={classes.questionTitle}>
          <h3 className={classes.title}>{title}</h3>
          {(where !== undefined || clarification.task !== null) && (
            <BodyText tone="meta">
              {[
                where === undefined ? null : `In ${where}`,
                clarification.task === null
                  ? null
                  : `About task ${taskTitle ?? clarification.task}`,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </BodyText>
          )}
        </div>
        <QuestionBadge clarification={clarification} organisers={organisers} />
      </div>
      <ol className={classes.conversation} aria-label={`Messages on ${title}`}>
        {said.map((message, index) => (
          <li
            key={index}
            className={message.from_asker ? classes.fromAsker : classes.fromOrganisers}
          >
            <p className={classes.who}>
              <strong>{message.from_asker ? asker : 'Organisers'}</strong>
              <span className={classes.when}>
                {formatDateTime(new Date(message.at))}
              </span>
            </p>
            {message.announcement !== null && announcementAt !== undefined ? (
              <AnsweredPublicly
                body={message.body}
                title={message.announcement.title}
                at={announcementAt(message.announcement)}
              />
            ) : (
              <Markdown>{message.body}</Markdown>
            )}
          </li>
        ))}
      </ol>
      {children}
    </article>
  );
}
