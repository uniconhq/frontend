import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { FileContent, TreeEntry, UploadInfo } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { OutLink } from '@/ui/OutLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { formatSize } from '@/lib/size';
import { saveFile } from '@/lib/save-file';
import { fileQuery, taskDownloadHref, treeQuery, type Place } from './place';
import classes from './FilePreview.module.css';

/**
 * A file of a task shown to be read, never edited (M50, M51): its first
 * lines as text, with Show all and Download; a file that is not text by its
 * size and Download; and a file that is an upload, or too big to read here,
 * by its size and Download as a link to the download door (#444), which
 * streams it whatever its size; and a folder as a small tree, a file in it
 * shown once chosen.
 */

/** How many lines a text shows before Show all. */
const FIRST_LINES = 12;
/** How long a text runs before Show all, for one with few long lines. */
const FIRST_CHARACTERS = 2_000;
/** The largest file read to be shown; a larger one is read only to be downloaded. */
const READ_AT_MOST = 1024 * 1024;

/** A file's last name, the one a download is saved under. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** A file as read, as the bytes a download saves. */
function blobOf(file: FileContent): Blob {
  if (file.encoding === 'utf-8')
    return new Blob([file.content], { type: 'text/plain' });
  const binary = atob(file.content);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return new Blob([bytes]);
}

/** A text's first lines, and whether there is more after them. */
function firstOf(text: string): { shown: string; more: boolean } {
  const lines = text.split('\n');
  let shown = lines.slice(0, FIRST_LINES).join('\n');
  if (shown.length > FIRST_CHARACTERS) shown = shown.slice(0, FIRST_CHARACTERS);
  return { shown, more: shown.length < text.replace(/\n$/, '').length };
}

/**
 * Text as a part shows it: its first lines, Show all for the rest, and
 * Download; or, for bytes that are not text, that it is not text.
 */
function Shown({
  name,
  text,
  onDownload,
}: {
  name: string;
  /** The text, or null for bytes that are not text. */
  text: string | null;
  onDownload: () => void;
}) {
  const [all, setAll] = useState(false);
  const first = text === null ? null : firstOf(text);
  return (
    <>
      {text === null || first === null ? (
        <BodyText tone="secondary">It is not text, so it is not shown here.</BodyText>
      ) : text === '' ? (
        <BodyText tone="secondary">It is empty.</BodyText>
      ) : (
        <pre className={classes.text} aria-label={`What ${name} holds`} tabIndex={0}>
          {all ? text : first.shown}
          {!all && first.more && '\n…'}
        </pre>
      )}
      <div className={classes.actions}>
        {first?.more === true && (
          <Button size="xs" variant="secondary" onClick={() => setAll(!all)}>
            {all ? 'Show less' : 'Show all'}
          </Button>
        )}
        <Button
          size="xs"
          variant="secondary"
          onClick={onDownload}
          label={`Download ${name}`}
        >
          Download
        </Button>
      </div>
    </>
  );
}

/** A heading for one part or file: its name and its size. */
function Head({ name, size }: { name: string; size: number | null }) {
  return (
    <p className={classes.head}>
      <span className={classes.name}>{name}</span>
      {size !== null && <span className={classes.size}>{formatSize(size)}</span>}
    </p>
  );
}

/**
 * Download for a file the page does not read whole, as a link to the
 * download door at `version`; nothing at a contest or without a version,
 * where the file's size alone is shown.
 */
function DownloadLink({
  place,
  path,
  version,
}: {
  place: Place;
  path: string;
  version: string | null;
}) {
  if (place.kind !== 'task' || version === null) return null;
  return (
    <div className={classes.actions}>
      <OutLink
        href={taskDownloadHref(place, version, path)}
        label={`Download ${nameOf(path)}`}
      >
        Download
      </OutLink>
    </div>
  );
}

/**
 * One saved file, read once it is shown: an upload for the version it holds
 * its pointer at, to download it whole through the download door; a file
 * too big to read here not at all, downloaded at the version its listing
 * named (`listedAt`, the commit that last changed it), so the link fetches
 * the file whose size was shown whatever has been saved since; and any
 * other file whole, its first lines shown.
 */
export function SavedFile({
  place,
  path,
  title = nameOf(path),
  size,
  upload,
  listedAt,
}: {
  place: Place;
  path: string;
  /** What the file is called here, such as the part of a test it is. */
  title?: string;
  size: number | null;
  upload: UploadInfo | null;
  /** The version the listing the file was found in names it at, or null. */
  listedAt: string | null;
}) {
  const big = upload === null && size !== null && size > READ_AT_MOST;
  // An upload reads as its pointer, which is small, and says its version.
  const read = useQuery({ ...fileQuery(place, path), enabled: !big });
  const name = nameOf(path);

  return (
    <section className={classes.part} aria-label={title}>
      <Head name={title} size={upload?.size ?? size} />
      {upload !== null ? (
        <>
          <BodyText tone="secondary">
            It was uploaded, so it is shown by its size rather than as text.
          </BodyText>
          <DownloadLink
            place={place}
            path={path}
            version={read.data?.version ?? null}
          />
        </>
      ) : big ? (
        <>
          <BodyText tone="secondary">It is too big to show here.</BodyText>
          <DownloadLink place={place} path={path} version={listedAt} />
        </>
      ) : (
        <Loaded view={queryView(read)} compact>
          {(file: FileContent) => (
            <Shown
              name={title}
              text={file.encoding === 'utf-8' ? file.content : null}
              onDownload={() => saveFile(name, blobOf(file))}
            />
          )}
        </Loaded>
      )}
    </section>
  );
}

/** One folder's entries, folders first, a folder opening below itself. */
function FolderLevel({
  place,
  path,
  chosen,
  onChoose,
}: {
  place: Place;
  path: string;
  chosen: TreeEntry | null;
  onChoose: (entry: TreeEntry) => void;
}) {
  const view = queryView(useQuery(treeQuery(place, path)));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  return (
    <Loaded view={view} compact>
      {(entries: TreeEntry[]) =>
        entries.length === 0 ? (
          <BodyText tone="secondary">It is empty.</BodyText>
        ) : (
          <ul className={classes.tree}>
            {[...entries]
              .sort((a, b) =>
                a.kind === b.kind
                  ? a.path.localeCompare(b.path, undefined, { numeric: true })
                  : a.kind === 'directory'
                    ? -1
                    : 1,
              )
              .map((entry) => {
                const name = nameOf(entry.path);
                if (entry.kind === 'directory') {
                  const opened = open.has(entry.path);
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className={classes.entry}
                        aria-expanded={opened}
                        onClick={() =>
                          setOpen((before) => {
                            const next = new Set(before);
                            if (opened) next.delete(entry.path);
                            else next.add(entry.path);
                            return next;
                          })
                        }
                      >
                        <span aria-hidden="true">{opened ? '▾ ' : '▸ '}</span>
                        {name}/
                      </button>
                      {opened && (
                        <FolderLevel
                          place={place}
                          path={entry.path}
                          chosen={chosen}
                          onChoose={onChoose}
                        />
                      )}
                    </li>
                  );
                }
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={classes.entry}
                      aria-pressed={chosen?.path === entry.path}
                      onClick={() => onChoose(entry)}
                    >
                      {name}
                      <span className={classes.size}>
                        {' '}
                        {formatSize(entry.upload?.size ?? entry.size ?? 0)}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )
      }
    </Loaded>
  );
}

/**
 * A folder as a small tree, the file chosen in it shown below; `path` ""
 * is the whole of the place, every file it holds.
 */
export function SavedFolder({
  place,
  path,
  title = nameOf(path),
  heading = `${title}, a folder`,
}: {
  place: Place;
  path: string;
  title?: string;
  heading?: string;
}) {
  const [chosen, setChosen] = useState<TreeEntry | null>(null);
  return (
    <section className={classes.part} aria-label={title}>
      <Head name={heading} size={null} />
      <FolderLevel place={place} path={path} chosen={chosen} onChoose={setChosen} />
      {chosen !== null && (
        <SavedFile
          key={chosen.path}
          place={place}
          path={chosen.path}
          title={path === '' ? chosen.path : chosen.path.slice(path.length + 1)}
          size={chosen.size}
          upload={chosen.upload}
          listedAt={chosen.version}
        />
      )}
    </section>
  );
}
