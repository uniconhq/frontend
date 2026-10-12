import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeclaredInput, TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { FileDrop } from '@/ui/FileDrop';
import { InfoTip } from '@/ui/InfoTip';
import { formatSize } from '@/lib/size';
import { SavedFile, SavedFolder } from '../files/FilePreview';
import { treeQuery } from '../files/place';
import { inputTitle, lastPart, type TaskPlace } from './build-data';
import type { StagedInput } from './input-files';
import shared from '../organise.module.css';
import classes from './task.module.css';

/** The folder a path is in: `checker/checker.cpp` is in `checker`. */
function folderOf(path: string): string {
  const end = path.lastIndexOf('/');
  return end < 0 ? '' : path.slice(0, end);
}

/** What the setting names now, read from its folder: its entry, or null when the task has none there. */
function useNamed(place: TaskPlace, value: string) {
  const folder = value.endsWith('/');
  const path = folder ? value.slice(0, -1) : value;
  const read = useQuery({
    ...treeQuery(place, folderOf(path)),
    enabled: value !== '',
    retry: false,
  });
  const entry: TreeEntry | null | undefined =
    value === ''
      ? null
      : read.isPending
        ? undefined
        : read.data === undefined
          ? null
          : (read.data.find((found) => found.path === path) ?? null);
  return entry;
}

/**
 * A setting of the task that is a file or a folder, such as a checker or a
 * data folder (M51): what it names now, with View to read it and Replace to
 * choose another, or a box to choose its file when it names none. A file
 * chosen waits for the task's save, which writes it under the input's own
 * folder and points the setting at it; Undo puts the setting back. A big
 * file goes through the upload door at the save, as a test's does.
 */
export function FileSetting({
  place,
  declared,
  value,
  staged,
  hint,
  onChoose,
  onUndo,
  onClear,
  disabled,
}: {
  place: TaskPlace;
  declared: DeclaredInput;
  value: string;
  staged: StagedInput | undefined;
  /** What to know while choosing, such as that the setting is required. */
  hint: string | undefined;
  onChoose: (files: File[]) => void;
  onUndo: () => void;
  /** Leaves an optional setting empty; none for a required one. */
  onClear: (() => void) | null;
  disabled: boolean;
}) {
  const label = inputTitle(declared);
  const folder = declared.type === 'folder';
  const [viewing, setViewing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const named = useNamed(place, staged === undefined ? value : '');

  const drop = (
    <FileDrop
      label={
        value === ''
          ? `${label}: choose ${folder ? 'its files' : 'its file'}`
          : `${label}: a new ${folder ? 'folder' : 'file'}`
      }
      folder={folder}
      files={[]}
      onChange={(files) => {
        if (files.length === 0) return;
        setReplacing(false);
        setViewing(false);
        onChoose(files);
      }}
      disabled={disabled}
    />
  );

  return (
    <div className={classes.fileSetting}>
      <div className={classes.titleRow}>
        <span className={classes.settingTitle}>{label}</span>
        {declared.help !== null && <InfoTip about={label}>{declared.help}</InfoTip>}
      </div>
      {staged !== undefined ? (
        <div className={shared.actions}>
          <BodyText>{staged.summary}</BodyText>
          {/* Waiting for the task's save, marked as a test's row marks one. */}
          {staged.was === '' ? (
            <Chip tone="live">New</Chip>
          ) : (
            <Chip tone="warn">Replaced</Chip>
          )}
          {!disabled && (
            <Button
              size="xs"
              variant="secondary"
              onClick={onUndo}
              label={`Undo the new file of ${label}`}
            >
              Undo
            </Button>
          )}
        </div>
      ) : value === '' ? (
        <>
          {hint !== undefined && <BodyText tone="secondary">{hint}</BodyText>}
          {!disabled && drop}
        </>
      ) : (
        <>
          <div className={shared.actions}>
            <BodyText>
              {named === undefined
                ? lastPart(value.replace(/\/$/, ''))
                : named === null
                  ? `The task has no ${folder ? 'folder' : 'file'} at ${value}.`
                  : named.kind === 'directory'
                    ? `${lastPart(value.replace(/\/$/, ''))}, a folder`
                    : `${lastPart(value)}, ${formatSize(named.upload?.size ?? named.size ?? 0)}`}
            </BodyText>
            {named !== null && named !== undefined && (
              <Button
                size="xs"
                variant="secondary"
                aria-expanded={viewing}
                onClick={() => setViewing(!viewing)}
                label={`${viewing ? 'Hide' : 'View'} ${label}`}
              >
                {viewing ? 'Hide' : 'View'}
              </Button>
            )}
            {!disabled && (
              <Button
                size="xs"
                variant="secondary"
                aria-expanded={replacing}
                onClick={() => setReplacing(!replacing)}
                label={`Replace ${label}`}
              >
                Replace
              </Button>
            )}
            {!disabled && onClear !== null && (
              <Button
                size="xs"
                variant="secondary"
                onClick={onClear}
                label={`Use no ${folder ? 'folder' : 'file'} for ${label}`}
              >
                Use none
              </Button>
            )}
          </div>
          {viewing &&
            named !== null &&
            named !== undefined &&
            (named.kind === 'directory' ? (
              <SavedFolder place={place} path={named.path} title={label} />
            ) : (
              <SavedFile
                place={place}
                path={named.path}
                title={lastPart(named.path)}
                size={named.size}
                upload={named.upload}
              />
            ))}
          {replacing && !disabled && drop}
        </>
      )}
    </div>
  );
}
