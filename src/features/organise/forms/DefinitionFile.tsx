import { useState, type ReactNode } from 'react';
import { toApiError } from '@/api/problem';
import type { FileContent, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Tabs } from '@/ui/Tabs';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { FileEditor } from '../files/FileEditor';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { UploadedFile } from '../files/UploadedFile';
import type { Place } from '../files/place';
import { useFileWrite, useOwnFile } from './file-hooks';
import { MergeView } from './MergeView';
import { parseYaml, topMap, writeYaml, type Doc } from './yaml-doc';

/** What a form is handed: the file as read, and the way to save a change to it. */
export type FormProps = {
  doc: Doc;
  busy: boolean;
  /** Apply the form's changes to a fresh copy of the document and save it. */
  onSave: (change: (doc: Doc) => void) => void;
};

/**
 * A definition file as a form, with the file as text in a tab beside it,
 * since some keys have no field. The form gets the file parsed as a YAML
 * document; one that is not YAML, or not a mapping, falls back to the text
 * with the reason. Saving writes the changed document with the version it
 * was read at. A save refused as a conflict opens the merge view over the file
 * as it is now; any other answer is SaveOutcome's, as in the file editor.
 * A file that is an upload shows as one, by its size and digest, not as a form.
 */
export function DefinitionFile({
  place,
  path,
  label,
  admin,
  children,
}: {
  place: Place;
  path: string;
  /** What the tabs are views of, such as "The contest's settings". */
  label: string;
  /** Whether the organiser is an admin at the scope, which the merge view needs. */
  admin: boolean;
  children: (props: FormProps) => ReactNode;
}) {
  return (
    <Tabs
      label={label}
      tabs={[
        {
          value: 'form',
          label: 'Form',
          panel: (
            <FormView place={place} path={path} admin={admin}>
              {children}
            </FormView>
          ),
        },
        {
          value: 'text',
          label: path,
          panel: <FileEditor place={place} path={path} />,
        },
      ]}
    />
  );
}

type Merge = { base: string; mine: string };

function FormView({
  place,
  path,
  admin,
  children,
}: {
  place: Place;
  path: string;
  admin: boolean;
  children: (props: FormProps) => ReactNode;
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
        />
      ) : 'error' in read ? (
        <div role="alert">
          <BodyText>The form cannot read {path}, so it is open as text below.</BodyText>
          <BodyText tone="secondary">{read.error}</BodyText>
          <FileEditor place={place} path={path} />
        </div>
      ) : (
        <div key={file.token}>
          {children({
            doc: read.doc,
            busy,
            onSave: (change) => {
              const fresh = parseYaml(file.content);
              if ('error' in fresh) return;
              change(fresh.doc);
              save(file, writeYaml(fresh.doc));
            },
          })}
        </div>
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
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
