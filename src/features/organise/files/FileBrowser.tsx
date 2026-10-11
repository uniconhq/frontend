import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMe } from '@/session';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { contestSectionPath, taskCardPath } from '@/lib/sections';
import { taskPath } from '@/lib/organiser-paths';
import { holdsAt } from '../roles';
import { FILE_PARAM, folderOf } from './file-param';
import { FileEditor } from './FileEditor';
import { FileTree } from './FileTree';
import type { Place } from './place';
import { TaskUpload } from './TaskUpload';
import classes from './Files.module.css';

/** Where what Files leaves out is changed instead, in a line above the tree. */
function Elsewhere({ place }: { place: Place }) {
  if (place.kind === 'contest') {
    return (
      <BodyText tone="secondary">
        The contest’s settings are changed on its{' '}
        <PageLink to={contestSectionPath(place.org, place.contest, 'settings')}>
          Settings
        </PageLink>{' '}
        page, so they are not listed here.
      </BodyText>
    );
  }
  return (
    <BodyText tone="secondary">
      Tests are added in{' '}
      <PageLink to={taskCardPath(place.org, place.contest, place.task, 'tests')}>
        Tests and scoring
      </PageLink>{' '}
      and the settings on the{' '}
      <PageLink to={taskPath(place.org, place.contest, place.task)}>
        task’s page
      </PageLink>
      , so neither is listed here. Everything else the task holds is here, such as
      pictures for its statement, which go in the <code>public</code> folder.
    </BodyText>
  );
}

/**
 * A contest's or a task's files, but for its tests and settings, which have
 * pages of their own: the tree on one side and the open file on the other.
 * Which file is open is `?file=` on the page's own address, so a link to a
 * file opens it, the settings included. A typed file opens as text, and an
 * uploaded one as what it holds.
 *
 * At a task, a manager also uploads a file into it and saves it in one step,
 * by default into the folder last picked in the tree: the folder last opened
 * or closed there, or the open file's.
 */
export function FileBrowser({ place }: { place: Place }) {
  const [search] = useSearchParams();
  const open = search.get(FILE_PARAM);
  const roles = useMe().roles;
  const uploads = place.kind === 'task' && holdsAt(roles, place, 'manager');
  const [folder, setFolder] = useState(() => folderOf(open));
  const [uploading, setUploading] = useState(false);

  return (
    <div className={classes.browser}>
      <Elsewhere place={place} />
      {uploads && !uploading && (
        <div className={classes.heading}>
          <Button variant="secondary" onClick={() => setUploading(true)}>
            Upload a file
          </Button>
        </div>
      )}
      {place.kind === 'task' && uploading && (
        <TaskUpload place={place} folder={folder} onClose={() => setUploading(false)} />
      )}
      <div className={classes.panes}>
        <FileTree place={place} open={open} folder={folder} onFolder={setFolder} />
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
