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
 * The message a public answer leaves on its question, "Answered publicly in
 * the announcement ‘On n’", with the announcement's title, as the forge
 * reads it from the message, a link to it (M62); the whole message the link
 * where the message was edited and names no title. With no `href`, the
 * reader can no longer open the announcement, since the organisers closed
 * it, and the message says so in place of the link.
 */
function AnsweredPublicly({
  body,
  title,
  href,
}: {
  body: string;
  title: string | null;
  href: string | null;
}) {
  if (href === null) {
    return (
      <p className={classes.publicAnswer}>
        {body.trimEnd()}, which the organisers have since closed.
      </p>
    );
  }
  if (title === null) {
    return (
      <p className={classes.publicAnswer}>
        <PageLink to={href}>{body}</PageLink>
      </p>
    );
  }
  return (
    <p className={classes.publicAnswer}>
      Answered publicly in the announcement <PageLink to={href}>‘{title}’</PageLink>
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
 * `announcementHref` is where the announcement a public answer posted is
 * read, which its message on the question links to, or null where the
 * reader can no longer read it there. `children` is what can
 * be done with it, at the box's foot.
 */
export function QuestionThread({
  clarification,
  asker,
  organisers = false,
  where,
  announcementHref,
  children,
}: {
  clarification: Clarification;
  asker: string;
  organisers?: boolean;
  announcementHref?: (link: AnnouncementLink) => string | null;
  /** Which contest it was asked in, where questions of several are listed. */
  where?: string;
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
                clarification.task === null ? null : `About task ${clarification.task}`,
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
            {message.announcement !== null && announcementHref !== undefined ? (
              <AnsweredPublicly
                body={message.body}
                title={message.announcement.title}
                href={announcementHref(message.announcement)}
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
