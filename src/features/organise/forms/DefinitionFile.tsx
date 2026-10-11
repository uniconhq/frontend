import { useState, type ReactNode } from 'react';
import { toApiError } from '@/api/problem';
import type { DefinitionError, FileContent, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { PageLink } from '@/ui/PageLink';
import { contestSectionPath, taskSectionPath } from '@/lib/sections';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { UploadedFile } from '../files/UploadedFile';
import type { Place } from '../files/place';
import { useFileWrite, useOwnFile } from './file-hooks';
import { definitionErrorsOf } from '../files/refusals';
import type { PlaceOf } from '../DefinitionErrors';
import { MergeView, type MergeWords } from './MergeView';
import { parseYaml, topMap, writeOver, type Doc } from './yaml-doc';

/**
 * What a form is handed: the file as read, the way to save a change to it,
 * and what the last save was refused for, each at its YAML path, so a form
 * can say it on the field that caused it.
 */
export type FormProps = {
  doc: Doc;
  busy: boolean;
  /** Apply the form's changes to a fresh copy of the document and save it. */
  onSave: (change: (doc: Doc) => void) => void;
  refused: DefinitionError[];
};

type Merge = { base: string; mine: string };

/** Where a place's settings are kept as stored, which an admin mends as text when they do not read. */
function mendAt(place: Place): string {
  return place.kind === 'task'
    ? taskSectionPath(place.org, place.contest, place.task, 'settings')
    : `${contestSectionPath(place.org, place.contest, 'files')}?file=contest.yaml`;
}

/**
 * A definition file as a form. The form gets the file parsed as a YAML
 * document. Saving writes the changed document with the version it was read
 * at; a save refused as a conflict opens the merge view over the file as it
 * is now, and any other answer is SaveOutcome's. A file that is an upload
 * shows as one, by its size and digest, not as a form.
 * `words` names the fields and values of the merge as the form does, and
 * `placeOf` each problem a refused save lists, with a link that opens it;
 * `bare` says a save in words alone. A file the form cannot read is no form:
 * it says why, and where an admin mends it as text.
 */
export function DefinitionForm({
  place,
  path,
  admin,
  children,
  words,
  placeOf,
  bare = false,
}: {
  place: Place;
  path: string;
  admin: boolean;
  children: (props: FormProps) => ReactNode;
  words?: MergeWords;
  placeOf?: PlaceOf;
  bare?: boolean;
}) {
  const query = useOwnFile(place, path);
  const { write, pending } = useFileWrite(place, path);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [merge, setMerge] = useState<Merge | null>(null);
  const busy = pending || query.isFetching;

  const send = async (file: FileContent, body: WriteFile) => {
    setOutcome(null);
    const answer = await write(body);
    if (answer.kind === 'refused' && answer.error.code === 'conflict') {
      setMerge({ base: file.content, mine: body.content });
      await query.refetch();
      return;
    }
    if (answer.kind === 'refused' && merge !== null) {
      // A merged version refused for what it holds keeps the merge and its
      // choices open beside the reason, as the form keeps what was typed.
      setOutcome(answer);
      return;
    }
    setMerge(null);
    setOutcome(answer);
    if (answer.kind !== 'refused') await query.refetch();
  };

  const save = (file: FileContent, content: string) =>
    void send(file, {
      content,
      encoding: 'utf-8',
      token: file.token,
      confirm: false,
      keep_as_draft: false,
    });

  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.data === undefined) {
    return (
      <ErrorBlock
        error={toApiError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const file = query.data;
  if (file.upload) {
    return (
      <UploadedFile place={place} path={path} upload={file.upload} token={file.token} />
    );
  }

  const read = readForm(file);

  return (
    <div>
      {merge !== null ? (
        <MergeView
          key={file.token}
          file={path}
          admin={admin}
          baseText={merge.base}
          mineText={merge.mine}
          currentText={file.content}
          busy={busy}
          onSave={(content) => save(file, content)}
          onDrop={() => setMerge(null)}
          words={words}
        />
      ) : 'error' in read ? (
        <div role="alert">
          <BodyText>
            These settings cannot be read, so they cannot be changed here.
          </BodyText>
          <BodyText tone="secondary">{read.error}</BodyText>
          <BodyText tone="secondary">
            An admin mends them as text where they are stored:{' '}
            <PageLink to={mendAt(place)}>the settings as stored</PageLink>.
          </BodyText>
        </div>
      ) : (
        <div key={file.token}>
          {children({
            doc: read.doc,
            busy,
            refused:
              outcome?.kind === 'refused' && outcome.error.code === 'invalid_definition'
                ? definitionErrorsOf(outcome.error)
                : [],
            onSave: (change) => {
              const fresh = parseYaml(file.content);
              if ('error' in fresh) return;
              change(fresh.doc);
              save(file, writeOver(file.content, fresh.doc));
            },
          })}
        </div>
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
          placeOf={placeOf}
          bare={bare}
          onConfirm={(body) => void send(file, { ...body, confirm: true })}
          onKeepAsDraft={(body) => void send(file, { ...body, keep_as_draft: true })}
          onReload={() => {
            setOutcome(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}

/** The file as a document the form can show, or why it is not one. */
function readForm(file: FileContent): { doc: Doc } | { error: string } {
  if (file.encoding !== 'utf-8') return { error: 'It is not text.' };
  const parsed = parseYaml(file.content);
  if ('error' in parsed) return parsed;
  return topMap(parsed.doc) === 'not-a-mapping'
    ? { error: 'Its top level is not a mapping of keys.' }
    : parsed;
}
