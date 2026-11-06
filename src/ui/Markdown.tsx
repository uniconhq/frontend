import { useMemo } from 'react';
import { Typography } from '@mantine/core';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { publicPathOf, taskPictureHref, type TaskWhere } from '@/lib/task-pictures';
import { OutLink } from './OutLink';
import classes from './Markdown.module.css';

const NONE_STAGED: ReadonlyMap<string, string> = new Map();

function external(href: string | undefined): boolean {
  return href !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * Headings go one level down, since the page keeps its own h1. Only a task's
 * own `public/` pictures are drawn; any other image is a link, so reading a
 * statement fetches nothing from a host its author picked.
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
 * Raw HTML is left out, never run, since the author is not the reader.
 * `staged` draws pictures not saved yet, as the statement editor previews them.
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
