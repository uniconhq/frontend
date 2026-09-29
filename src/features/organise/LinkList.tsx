import { PageLink } from '@/ui/PageLink';
import classes from './organise.module.css';

/** Orgs, contests or tasks by name, each a link to its page. */
export function LinkList({
  label,
  links,
}: {
  label: string;
  links: { name: string; to: string }[];
}) {
  return (
    <ul className={classes.list} aria-label={label}>
      {links.map((link) => (
        <li key={link.to}>
          <PageLink to={link.to} mono>
            {link.name}
          </PageLink>
        </li>
      ))}
    </ul>
  );
}
