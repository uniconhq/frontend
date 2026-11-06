import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { Primitive, WorkflowPage as Workflow } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { WORKFLOWS_PATH } from '@/lib/organiser-paths';
import { useWorkflowParams } from '@/lib/route-params';
import { DefinitionErrors } from '../DefinitionErrors';
import type { Values } from '../forms/values';
import { WorkflowBar } from './Bar';
import { checkQuery } from './check';
import { draftQuery } from './draft';
import { Editor } from './Editor';
import { FileView } from './FileView';
import { MendDraft } from './MendDraft';
import { ShareButton } from './SharePanel';
import { VersionGraph } from './VersionGraph';
import { StopNewUse } from './VersionDrawer';
import { latestVersion } from './versions';
import { visibilityWords } from './words';
import classes from './workflows.module.css';

/**
 * A workflow's page: its name, who reads it, and its bar (M32). For someone
 * who may edit it, the editor over its draft, or the draft's text while it
 * cannot be read; for anyone else, and for any
 * version asked for by `?version=`, the version drawn the same way at its
 * actual size, read-only, with a copy into a workflow of one's own.
 */
export function WorkflowPage() {
  const { owner, name } = useWorkflowParams();
  const [search] = useSearchParams();
  const asked = search.get('version');
  const page = queryView(
    $api.useQuery('get', '/api/v1/workflows/{owner}/{name}', {
      params: { path: { owner, name } },
    }),
  );
  const primitives = queryView(
    $api.useQuery('get', '/api/v1/primitives', {}, { staleTime: 5 * 60_000 }),
  );

  return (
    <Page>
      <PageHeader
        title={`${owner}/${name}`}
        meta={
          page.state === 'ready' ? (
            <>
              <Chip tone={page.data.visibility === 'public' ? 'live' : 'quiet'}>
                {visibilityWords(page.data)}
              </Chip>
              <BodyText size="sm" tone="secondary">
                {page.data.versions.length === 0
                  ? 'No version yet'
                  : page.data.versions.length === 1
                    ? 'One version'
                    : `${String(page.data.versions.length)} versions`}
              </BodyText>
            </>
          ) : undefined
        }
        links={<PageLink to={WORKFLOWS_PATH}>All workflows</PageLink>}
      />
      {(page.state === 'loading' || primitives.state === 'loading') && (
        <PageSkeleton rows={6} />
      )}
      {page.state === 'error' && <ErrorBlock error={page.error} onRetry={page.retry} />}
      {primitives.state === 'error' && (
        <ErrorBlock error={primitives.error} onRetry={primitives.retry} />
      )}
      {page.state === 'ready' && primitives.state === 'ready' && (
        <Shown page={page.data} primitives={primitives.data} asked={asked} />
      )}
    </Page>
  );
}

function Shown({
  page,
  primitives,
  asked,
}: {
  page: Workflow;
  primitives: Primitive[];
  asked: string | null;
}) {
  if (page.editable && asked === null)
    return (
      <DraftView
        key={`${page.owner}/${page.name}`}
        page={page}
        primitives={primitives}
      />
    );
  return (
    <VersionView
      page={page}
      primitives={primitives}
      version={asked ?? latestVersion(page.versions) ?? null}
    />
  );
}

/** The draft as values in the editor, or as text to fix while it does not read. */
function DraftView({ page, primitives }: { page: Workflow; primitives: Primitive[] }) {
  const query = useQuery(draftQuery(page.owner, page.name));
  // Each reload starts the editor again on the draft as read.
  const [reloads, setReloads] = useState(0);
  const reload = () =>
    void query.refetch().then(() => setReloads((count) => count + 1));
  return (
    <Loaded view={queryView(query)} rows={6}>
      {(draft) =>
        draft.values !== null ? (
          <Editor
            key={reloads}
            page={page}
            draft={{ ...draft, values: draft.values }}
            primitives={primitives}
            onReload={reload}
          />
        ) : (
          <MendDraft key={reloads} page={page} draft={draft} onReload={reload} />
        )
      }
    </Loaded>
  );
}

function VersionView({
  page,
  primitives,
  version,
}: {
  page: Workflow;
  primitives: Primitive[];
  version: string | null;
}) {
  const { owner, name } = page;
  const read = queryView(
    $api.useQuery(
      'get',
      '/api/v1/workflows/{owner}/{name}/versions/{version}',
      { params: { path: { owner, name, version: version ?? '' } } },
      { enabled: version !== null },
    ),
  );
  const values = read.state === 'ready' ? read.data.values : null;
  const checked = useQuery({ ...checkQuery(values ?? {}), enabled: values !== null });
  if (version === null)
    return (
      <BodyText>
        This workflow has no version yet, so there is nothing of it to show you.
      </BodyText>
    );
  const ref = `${owner}/${name}@${version}`;
  const bar = (actions: ReactNode) => (
    <WorkflowBar page={page} version={version}>
      {actions}
    </WorkflowBar>
  );
  if (read.state === 'loading') return <PageSkeleton rows={6} />;
  if (read.state === 'error')
    return (
      <>
        {bar(null)}
        <Unopenable
          label={ref}
          // A version that is not there will not be there on asking again.
          onRetry={read.error.code === 'not_found' ? undefined : read.retry}
        >
          <BodyText>{read.error.detail ?? read.error.message}</BodyText>
        </Unopenable>
      </>
    );
  if (read.data.values === null)
    return (
      <>
        {bar(null)}
        <Unopenable label={ref}>
          <BodyText>{read.data.unreadable}</BodyText>
        </Unopenable>
      </>
    );
  if (checked.isPending) return <PageSkeleton rows={6} />;
  if (checked.isError)
    return (
      <ErrorBlock
        error={toApiError(checked.error)}
        onRetry={() => void checked.refetch()}
      />
    );
  if (checked.data.length > 0)
    return (
      <>
        {bar(null)}
        <Unopenable label={ref}>
          <DefinitionErrors errors={checked.data} />
        </Unopenable>
      </>
    );
  return (
    <Drawn
      page={page}
      version={version}
      text={read.data.content}
      values={read.data.values}
      primitives={primitives}
    />
  );
}

/**
 * A version the page cannot read, whatever the reason: the forge refused to
 * serve it, it does not parse, or the forge's check refuses it, as it refuses
 * a version in the format before 2026-10-07. A version passed every check
 * when it was made and never changes, so one the check refuses now is one
 * nothing can use; the reason says why, and its owner publishes a new
 * version.
 */
function Unopenable({
  label,
  onRetry,
  children,
}: {
  label: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className={classes.stack} role="alert">
        <SectionTitle>{label}</SectionTitle>
        <BodyText>This version cannot be opened, because:</BodyText>
        {children}
        {onRetry !== undefined && (
          <div>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** A version drawn as the editor draws a draft, with nothing to change. */
function Drawn({
  page,
  version,
  text,
  values,
  primitives,
}: {
  page: Workflow;
  version: string;
  text: string;
  values: Values;
  primitives: Primitive[];
}) {
  return (
    <VersionGraph
      owner={page.owner}
      name={page.name}
      version={version}
      values={values}
      primitives={primitives}
      bar={(tools) => (
        <>
          <WorkflowBar page={page} version={version} tools={tools}>
            {page.editable && (
              <>
                <ShareButton page={page} />
                <StopNewUse key={version} page={page} version={version} />
              </>
            )}
            <FileView
              title={`The YAML of ${version}`}
              label={`The YAML of ${version}`}
              text={text}
            />
          </WorkflowBar>
          <SectionTitle>{`${page.owner}/${page.name}@${version}`}</SectionTitle>
        </>
      )}
    />
  );
}
