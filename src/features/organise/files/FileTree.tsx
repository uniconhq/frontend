import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { TreeEntry } from '@/api/types';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { BodyText } from '@/ui/BodyText';
import { fileHref } from './file-param';
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
 * The repo as a tree. Each folder is listed when it is opened, with
 * `GET <place>/tree?path=`, so a large repo costs one request per folder
 * looked at. Opening a file is a link that sets `?file=`, so it can be copied,
 * opened in a new tab and come back with the browser's back button. The
 * folders above a linked file start open.
 */
export function FileTree({ place, open }: { place: Place; open: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(foldersAbove(open)),
  );

  const toggle = (folder: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  return (
    <nav aria-label="Files" className={classes.tree}>
      <Folder place={place} folder="" expanded={expanded} toggle={toggle} open={open} />
    </nav>
  );
}

function Folder({
  place,
  folder,
  expanded,
  toggle,
  open,
}: {
  place: Place;
  folder: string;
  expanded: Set<string>;
  toggle: (folder: string) => void;
  open: string | null;
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
            >
              {nameOf(entry.path)}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
