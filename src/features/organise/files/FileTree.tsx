import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { TreeEntry } from '@/api/types';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { BodyText } from '@/ui/BodyText';
import { formatSize } from '@/lib/size';
import { fileHref, folderOf } from './file-param';
import { treeQuery, type Place } from './place';
import classes from './Files.module.css';

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Folders first, then files, each alphabetically, as a file manager lists them. */
function ordered(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) =>
    a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'directory' ? -1 : 1,
  );
}

/** Every folder above `path`: `a/b/c.txt` is inside `a` and `a/b`. */
function foldersAbove(path: string | null): string[] {
  if (path === null) return [];
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/**
 * The repo as a tree. A file that is an upload says so beside its name, with
 * the size of what it holds. Each folder is listed when it is opened, with
 * `GET <place>/tree?path=`, so a large repo costs one request per folder
 * looked at. Opening a file is a link that sets `?file=`, so it can be copied,
 * opened in a new tab and come back with the browser's back button. The
 * folders above a linked file start open.
 *
 * The folder picked last, `folder`, is where an upload goes by default:
 * opening a folder picks it, closing one picks the folder it is in, and
 * opening a file picks the file's folder.
 */
export function FileTree({
  place,
  open,
  folder = '',
  onFolder = () => undefined,
}: {
  place: Place;
  open: string | null;
  folder?: string;
  onFolder?: (folder: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(foldersAbove(open)),
  );

  const toggle = (path: string) => {
    onFolder(expanded.has(path) ? folderOf(path) : path);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav aria-label="Files" className={classes.tree}>
      <Folder
        place={place}
        folder=""
        expanded={expanded}
        toggle={toggle}
        open={open}
        picked={folder}
        onFolder={onFolder}
      />
    </nav>
  );
}

function Folder({
  place,
  folder,
  expanded,
  toggle,
  open,
  picked,
  onFolder,
}: {
  place: Place;
  folder: string;
  expanded: Set<string>;
  toggle: (folder: string) => void;
  open: string | null;
  picked: string;
  onFolder: (folder: string) => void;
}) {
  const view = queryView(useQuery(treeQuery(place, folder)));

  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.length === 0) {
    return <BodyText tone="secondary">Empty folder</BodyText>;
  }

  return (
    <ul className={classes.entries}>
      {ordered(view.data).map((entry) =>
        entry.kind === 'directory' ? (
          <li key={entry.path}>
            <button
              type="button"
              className={classes.folder}
              data-picked={entry.path === picked || undefined}
              aria-expanded={expanded.has(entry.path)}
              onClick={() => toggle(entry.path)}
            >
              <span aria-hidden="true" className={classes.caret}>
                {expanded.has(entry.path) ? '▾' : '▸'}
              </span>
              {nameOf(entry.path)}/
            </button>
            {expanded.has(entry.path) && (
              <div className={classes.nested}>
                <Folder
                  place={place}
                  folder={entry.path}
                  expanded={expanded}
                  toggle={toggle}
                  open={open}
                  picked={picked}
                  onFolder={onFolder}
                />
              </div>
            )}
          </li>
        ) : (
          <li key={entry.path}>
            <Link
              to={fileHref(entry.path)}
              className={classes.file}
              aria-current={entry.path === open ? 'page' : undefined}
              onClick={() => onFolder(folderOf(entry.path))}
            >
              {nameOf(entry.path)}
              {entry.upload ? (
                <>
                  {' '}
                  <span className={classes.mark}>
                    uploaded, {formatSize(entry.upload.size)}
                  </span>
                </>
              ) : null}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
