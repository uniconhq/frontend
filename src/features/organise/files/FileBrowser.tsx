import { useSearchParams } from 'react-router';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { contestSectionPath } from '@/lib/sections';
import { FILE_PARAM } from './file-param';
import { FileEditor } from './FileEditor';
import { FileTree } from './FileTree';
import type { Place } from './place';
import classes from './Files.module.css';

type ContestPlace = Extract<Place, { kind: 'contest' }>;

/**
 * A contest's files, but for its settings, which have a page of their own:
 * the tree on one side and the open file on the other. Which file is open is
 * `?file=` on the page's own address, so a link to a file opens it, the
 * settings included. A typed file opens as text, and an uploaded one as what
 * it holds. A task has no such page: each of its files is changed on the
 * card it belongs to, and its admins read them all from its Settings page.
 */
export function FileBrowser({ place }: { place: ContestPlace }) {
  const [search] = useSearchParams();
  const open = search.get(FILE_PARAM);

  return (
    <div className={classes.browser}>
      <BodyText tone="secondary">
        The contest’s settings are changed on its{' '}
        <PageLink to={contestSectionPath(place.org, place.contest, 'settings')}>
          Settings
        </PageLink>{' '}
        page, so they are not listed here.
      </BodyText>
      <div className={classes.panes}>
        <FileTree place={place} open={open} />
        <div className={classes.pane}>
          {open === null ? (
            <BodyText tone="secondary">Choose a file to open it.</BodyText>
          ) : (
            <FileEditor key={open} place={place} path={open} />
          )}
        </div>
      </div>
    </div>
  );
}
