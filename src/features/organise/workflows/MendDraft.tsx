import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WorkflowDraft, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { LeaveGuard } from '@/ui/LeaveGuard';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { WorkflowBar } from './Bar';
import { draftQuery } from './draft';
import { SaveRefusal } from './SaveRefusal';
import { ShareButton } from './SharePanel';
import { DRAFT_FILE } from './words';
import classes from './workflows.module.css';

/**
 * A draft whose file cannot be read, so it cannot be drawn (M30): why, and
 * its text to fix and save. Once a save reads, the editor draws it.
 */
export function MendDraft({
  page,
  draft,
  onReload,
}: {
  page: WorkflowPage;
  draft: WorkflowDraft;
  onReload: () => void;
}) {
  const { owner, name } = page;
  const queryClient = useQueryClient();
  const [text, setText] = useState(draft.content ?? '');
  const [saved, setSaved] = useState({
    text: draft.content ?? '',
    token: draft.token,
    unreadable: draft.unreadable,
  });
  const [error, setError] = useState<ApiError | null>(null);
  const save = $api.useMutation('put', '/api/v1/workflows/{owner}/{name}/draft');
  const dirty = text !== saved.text;

  const write = async () => {
    const sent = text;
    setError(null);
    try {
      const written = await save.mutateAsync({
        params: { path: { owner, name } },
        body: { content: sent, token: saved.token },
      });
      setSaved({ text: sent, token: written.token, unreadable: written.unreadable });
      queryClient.setQueryData(draftQuery(owner, name).queryKey, written);
    } catch (caught) {
      setError(toApiError(caught));
    }
  };

  return (
    <div className={classes.editor}>
      <WorkflowBar
        page={page}
        version={null}
        status={
          dirty ? (
            <UnsavedNote />
          ) : (
            <BodyText size="sm" tone="secondary">
              All changes saved.
            </BodyText>
          )
        }
      >
        <Button disabled={!dirty} loading={save.isPending} onClick={() => void write()}>
          Save
        </Button>
        <ShareButton page={page} />
      </WorkflowBar>
      {error !== null && <SaveRefusal error={error} onReload={onReload} />}
      <section className={classes.mend} aria-label="Fix the draft">
        <BodyText size="md">
          This draft cannot be drawn, because its file cannot be read. Fix it here and
          save it. What is wrong:
        </BodyText>
        <pre className={classes.unreadable}>{saved.unreadable}</pre>
        <CodeEditor
          label={DRAFT_FILE}
          value={text}
          onChange={setText}
          language="yaml"
          rows={24}
        />
      </section>
      <LeaveGuard dirty={dirty} what="Your changes to the draft" search />
    </div>
  );
}
