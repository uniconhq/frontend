import { BodyText } from '@/ui/BodyText';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { MockLinks } from './MockLinks';
import classes from './stage6.module.css';

/** Where the three stage 6 mock screens are. */
export function Stage6Page() {
  return (
    <Page label="Stage 6">
      <PageHeader title="Stage 6" links={<MockLinks />}>
        <BodyText>Three screens, filled with examples. Nothing here is saved.</BodyText>
      </PageHeader>
      <ul className={classes.index}>
        <li>
          <PageLink to="/dev/stage-6/workflow">Run workflow</PageLink>
          <BodyText>
            Three workflows as boxes. Open one to go inside, down to the primitives.
          </BodyText>
        </li>
        <li>
          <PageLink to="/dev/stage-6/formula">Formula</PageLink>
          <BodyText>
            A scoring value or a leaderboard column, as a line and as blocks.
          </BodyText>
        </li>
        <li>
          <PageLink to="/dev/stage-6/task">Task</PageLink>
          <BodyText>
            Islands, with a file per test, and tour, with a route per test.
          </BodyText>
        </li>
      </ul>
    </Page>
  );
}
