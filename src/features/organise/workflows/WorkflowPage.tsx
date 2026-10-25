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
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { WORKFLOWS_PATH } from '@/lib/organiser-paths';
import { useWorkflowParams } from '@/lib/route-params';
import { parseYaml } from '../forms/yaml-doc';
import { DefinitionErrors } from '../DefinitionErrors';
import { WorkflowBar } from './Bar';
import { checkQuery } from './check';
import { Editor } from './Editor';
import { FileView } from './FileView';
import type { Box } from './layout';
import { DrawnGraph } from './DrawnGraph';
import { linesOf, type Selected } from './lines';
import { NewWorkflowButton } from './NewWorkflow';
import { ShareButton } from './SharePanel';
import { latestVersion } from './versions';
import { visibilityWords } from './words';
import classes from './workflows.module.css';

/**
 * A workflow's page: its name, who reads it, and its bar (M32). For someone
 * who may edit it, the editor over its draft; for anyone else, and for any
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
              <Chip>{visibilityWords(page.data)}</Chip>
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
  if (page.editable && asked === null && page.draft !== null)
    return (
      <Editor
        key={`${page.owner}/${page.name}`}
        page={{ ...page, draft: page.draft }}
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
  const text = read.state === 'ready' ? read.data.content : null;
  const checked = useQuery({ ...checkQuery(text ?? ''), enabled: text !== null });
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
  if (checked.isPending) return <PageSkeleton rows={6} />;
  if (checked.isError)
    return (
      <ErrorBlock
        error={toApiError(checked.error)}
        onRetry={() => void checked.refetch()}
      />
    );
  const parsed = parseYaml(read.data.content);
  if (checked.data.length > 0 || 'error' in parsed)
    return (
      <>
        {bar(null)}
        <Unopenable label={ref}>
          {checked.data.length > 0 ? (
            <DefinitionErrors errors={checked.data} />
          ) : (
            'error' in parsed && <BodyText>{parsed.error}</BodyText>
          )}
        </Unopenable>
      </>
    );
  return (
    <Drawn
      page={page}
      version={version}
      text={read.data.content}
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
  primitives,
}: {
  page: Workflow;
  version: string;
  text: string;
  primitives: Primitive[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [box, setBox] = useState<Box | undefined>(undefined);
  const lines: Selected | null =
    box === undefined
      ? null
      : box.kind === 'step' && box.step !== null
        ? { kind: 'step', index: box.step }
        : box.kind === 'inputs'
          ? { kind: 'inputs', ids: box.right }
          : { kind: 'outputs' };
  const ref = `${page.owner}/${page.name}@${version}`;
  return (
    <>
      <WorkflowBar page={page} version={version}>
        <NewWorkflowButton source={ref} label="Copy into a new workflow" />
        {page.editable && <ShareButton page={page} />}
        <FileView
          title={`The file of ${version}`}
          label={`The file of ${version}`}
          text={text}
          marked={linesOf(text, lines)}
        />
      </WorkflowBar>
      <SectionTitle>{ref}</SectionTitle>
      <DrawnGraph
        text={text}
        primitives={primitives}
        selected={selected}
        onSelect={(key, found) => {
          setSelected(key);
          setBox(found);
        }}
      />
    </>
  );
}
