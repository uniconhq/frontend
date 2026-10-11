import { Typography } from '@mantine/core';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { OutLink } from './OutLink';

/** Whether a link leaves this site, and so opens apart from it. */
function external(href: string | undefined): boolean {
  return href !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * Every heading one level down, since what is rendered here sits inside a
 * page that has its own title: a statement's `# Sum` is the page's second
 * level, and the page keeps one first-level heading. A link out of the site
 * opens in a tab of its own and tells the other site nothing about this one.
 * An image is a link to it rather than a picture, so reading a statement
 * fetches nothing from a host its author picked, which would hand that host
 * every reader's address; a statement's own files are not served here anyway.
 */
const COMPONENTS: Components = {
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

/**
 * A statement or any other Markdown an organiser wrote, with GitHub's tables
 * and task lists. Raw HTML inside it is left out, never run, and links keep
 * only the safe kinds react-markdown lets through, since the author is not
 * the person reading it. Application code imports this, never react-markdown,
 * which the lint rules hold it to.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <Typography>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {children}
      </ReactMarkdown>
    </Typography>
  );
}
