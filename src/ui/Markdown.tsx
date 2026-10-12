import { useMemo } from 'react';
import { Typography } from '@mantine/core';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { publicPathOf, taskPictureHref, type TaskWhere } from '@/lib/task-pictures';
import { OutLink } from './OutLink';
import classes from './Markdown.module.css';

const NONE_STAGED: ReadonlyMap<string, string> = new Map();

/** Whether a link leaves this site, and so opens apart from it. */
function external(href: string | undefined): boolean {
  return href !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * Every heading one level down, since what is rendered here sits inside a
 * page that has its own title: a statement's `# Sum` is the page's second
 * level, and the page keeps one first-level heading. A link out of the site
 * opens in a tab of its own and tells the other site nothing about this one.
 *
 * An image is drawn only when it is one of the task's own pictures, a file
 * under its `public/` folder named as `public/diagram.png`, and only in what
 * belongs to a task (`task`); it is read from the task's own route, under
 * the same rights as the statement. Any other image is a link to it with its
 * alt text, so reading a statement fetches nothing from a host its author
 * picked, which would hand that host every reader's address.
 */
function componentsFor(
  task: TaskWhere | null,
  staged: ReadonlyMap<string, string>,
): Components {
  return {
    h1: 'h2',
    h2: 'h3',
    h3: 'h4',
    h4: 'h5',
    h5: 'h6',
    a: ({ href, children }) =>
      href === undefined ? (
        <span>{children}</span>
      ) : (
        <OutLink href={href} newTab={external(href)}>
          {children}
        </OutLink>
      ),
    img: ({ src, alt }) => {
      const target = typeof src === 'string' ? src : undefined;
      const parts = target === undefined ? null : publicPathOf(target);
      const waiting = parts === null ? undefined : staged.get(parts.join('/'));
      const own =
        waiting ??
        (task === null || target === undefined ? null : taskPictureHref(task, target));
      if (own !== null) {
        return (
          <img src={own} alt={alt ?? ''} loading="lazy" className={classes.picture} />
        );
      }
      const text = alt !== undefined && alt !== '' ? alt : target;
      return target === undefined ? (
        <span>{text}</span>
      ) : (
        <OutLink href={target} newTab>
          {text}
        </OutLink>
      );
    },
  };
}

/**
 * A statement or any other Markdown an organiser wrote, with GitHub's tables
 * and task lists. Raw HTML inside it is left out, never run, and links keep
 * only the safe kinds react-markdown lets through, since the author is not
 * the person reading it. `task` is the task it belongs to, for a statement or
 * a task's announcement, whose own pictures it draws; `staged` draws, by
 * their names under `public/`, pictures not saved yet from addresses of
 * their own bytes, as the statement's editor previews them. Application code
 * imports this, never react-markdown, which the lint rules hold it to.
 */
export function Markdown({
  children,
  task,
  staged = NONE_STAGED,
}: {
  children: string;
  task?: TaskWhere;
  staged?: ReadonlyMap<string, string>;
}) {
  const org = task?.org;
  const contest = task?.contest;
  const name = task?.task;
  const components = useMemo(
    () =>
      componentsFor(
        org === undefined || contest === undefined || name === undefined
          ? null
          : { org, contest, task: name },
        staged,
      ),
    [org, contest, name, staged],
  );
  return (
    <Typography>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </Typography>
  );
}
