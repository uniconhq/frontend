import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMe } from '@/session';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { holdsAt } from '../roles';
import { FILE_PARAM, folderOf } from './file-param';
import { FileEditor } from './FileEditor';
import { FileTree } from './FileTree';
import type { Place } from './place';
import { TaskUpload } from './TaskUpload';
import classes from './Files.module.css';

/**
 * A contest's or a task's files: the tree on one side and the open file on
 * the other. Which file is open is `?file=` on the page's own address, so a
 * link to a file opens it. Every file opens as text.
 *
 * At a task, a manager also uploads a file into it, by default into the
 * folder last picked in the tree: the folder last opened or closed there, or
 * the open file's.
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
      <div className={classes.heading}>
        <SectionTitle>Files</SectionTitle>
        {uploads && !uploading && (
          <Button size="xs" variant="secondary" onClick={() => setUploading(true)}>
            Upload a file
          </Button>
        )}
      </div>
      {place.kind === 'task' && uploading && (
        <TaskUpload place={place} folder={folder} onClose={() => setUploading(false)} />
      )}
      <div className={classes.panes}>
        <FileTree place={place} open={open} folder={folder} onFolder={setFolder} />
        <div className={classes.pane}>
          {open === null ? (
            <BodyText tone="secondary">Pick a file to open it.</BodyText>
          ) : (
            <FileEditor key={open} place={place} path={open} />
          )}
        </div>
      </div>
    </div>
  );
}
