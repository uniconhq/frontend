import { PageLink } from '@/ui/PageLink';
import classes from './stage6.module.css';

/** The three screens, from any one of them. */
export function MockLinks() {
  return (
    <div className={classes.nav}>
      <PageLink to="/dev/stage-6">Screens</PageLink>
      <PageLink to="/dev/stage-6/workflow">Run workflow</PageLink>
      <PageLink to="/dev/stage-6/formula">Formula</PageLink>
      <PageLink to="/dev/stage-6/task">Task</PageLink>
    </div>
  );
}
