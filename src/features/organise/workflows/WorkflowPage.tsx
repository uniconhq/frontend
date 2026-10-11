import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { Primitive, WorkflowPage as Page } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { CodeEditor } from '@/ui/CodeEditor';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { WORKFLOWS_PATH, workflowPath } from '@/lib/organiser-paths';
import { useWorkflowParams } from '@/lib/route-params';
import { parseYaml } from '../forms/yaml-doc';
import { DefinitionErrors } from '../DefinitionErrors';
import { workflowOwners } from '../roles';
import { checkQuery } from './check';
import { Combine } from './Combine';
import { Editor } from './Editor';
import type { Box } from './layout';
import { DrawnGraph } from './DrawnGraph';
import { linesOf, type Selected } from './lines';
import { SharePanel } from './SharePanel';
import { latestVersion } from './versions';
import shared from '../organise.module.css';
import classes from './workflows.module.css';

/**
 * A workflow's page. For someone who may edit it, the editor over its draft;
 * for anyone else, and for any version asked for by `?version=`, the version
 * drawn the same way, read-only, with a copy into a workflow of one's own.
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
    <div className={classes.editor}>
      <PageTitle>
        {owner}/{name}
      </PageTitle>
      <div className={shared.actions}>
        <PageLink to={WORKFLOWS_PATH}>Every workflow you may read</PageLink>
      </div>
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
    </div>
  );
}

function Shown({
  page,
  primitives,
  asked,
}: {
  page: Page;
  primitives: Primitive[];
  asked: string | null;
}) {
  const versions = page.versions;
  return (
    <>
      <BodyText size="sm" tone="secondary">
        {page.visibility === 'public'
          ? 'Public: everyone reads it.'
          : page.visibility === 'shared'
            ? 'Shared with the people its owner lists.'
            : 'Private: only its owner reads it.'}{' '}
        {versions.length === 0 ? 'No version yet.' : 'Versions: '}
        {versions.map((version, at) => (
          <span key={version}>
            {at > 0 && ', '}
            <PageLink to={workflowPath(page.owner, page.name, version)}>
              {version}
            </PageLink>
          </span>
        ))}
        {asked !== null && page.editable && (
          <>
            {' · '}
            <PageLink to={workflowPath(page.owner, page.name)}>
              Back to the draft
            </PageLink>
          </>
        )}
      </BodyText>
      {page.editable && asked === null && page.draft !== null ? (
        <>
          <Editor
            key={`${page.owner}/${page.name}`}
            page={{ ...page, draft: page.draft }}
            primitives={primitives}
          />
          <CombineHere page={page} />
        </>
      ) : (
        <VersionView
          page={page}
          primitives={primitives}
          version={asked ?? latestVersion(versions) ?? null}
        />
      )}
    </>
  );
}

function VersionView({
  page,
  primitives,
  version,
}: {
  page: Page;
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
  if (read.state === 'loading') return <PageSkeleton rows={6} />;
  if (read.state === 'error')
    return (
      <Unopenable label={ref} onRetry={read.retry}>
        <BodyText>{read.error.detail ?? read.error.message}</BodyText>
      </Unopenable>
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
      <Unopenable label={ref}>
        {checked.data.length > 0 ? (
          <DefinitionErrors errors={checked.data} />
        ) : (
          'error' in parsed && <BodyText>{parsed.error}</BodyText>
        )}
      </Unopenable>
    );
  return (
    <>
      <SectionTitle>{ref}</SectionTitle>
      <Drawn text={read.data.content} primitives={primitives} />
      <div className={classes.work}>
        <Card>
          <CopyForm source={`${owner}/${name}@${version}`} />
        </Card>
        {page.editable && (
          <Card>
            <SharePanel page={page} />
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * A version the page cannot read, whatever the reason: the forge refused to
 * serve it, it does not parse, or the forge's check refuses it, as it refuses
 * a version in the format before 2026-10-07. A version passed every check
 * when it was made and never changes, so one the check refuses now is one
 * nothing can use; the forge's reason says why, and its owner makes a new
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
        <BodyText>This version cannot be opened. The forge says:</BodyText>
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
function Drawn({ text, primitives }: { text: string; primitives: Primitive[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [box, setBox] = useState<Box | undefined>(undefined);
  const lines: Selected | null =
    box === undefined
      ? null
      : box.kind === 'step' && box.step !== null
        ? { kind: 'step', index: box.step }
        : box.kind === 'inputs'
          ? { kind: 'inputs', ids: box.right }
          : box.kind === 'test'
            ? { kind: 'test', names: box.right }
            : { kind: 'report' };
  return (
    <div className={classes.work}>
      <DrawnGraph
        text={text}
        primitives={primitives}
        selected={selected}
        onSelect={(key, found) => {
          setSelected(key);
          setBox(found);
        }}
      />
      <CodeEditor
        label="workflow.yaml"
        value={text}
        readOnly
        language="yaml"
        rows={24}
        marked={linesOf(text, lines)}
      />
    </div>
  );
}

/** A copy of a version into a new private workflow of the person's own. */
function CopyForm({ source }: { source: string }) {
  const me = useMe();
  const owners = workflowOwners(me);
  const [owner, setOwner] = useState(owners[0] ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const copy = $api.useMutation('post', '/api/v1/workflow-copies');
  return (
    <form
      className={classes.stack}
      aria-label="Copy it"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        copy
          .mutateAsync({ body: { source, owner, name: name.trim() } })
          .then((made) => navigate(workflowPath(made.owner, made.name)))
          .catch((caught: unknown) => setError(toApiError(caught)));
      }}
    >
      <SectionTitle order={3}>Copy it</SectionTitle>
      <BodyText size="sm" tone="secondary">
        A new private workflow of your own from {source}, yours to edit and version.
      </BodyText>
      <Select
        label="Owner"
        value={owner}
        options={owners.map((each) => ({ value: each, label: each }))}
        onChange={setOwner}
      />
      <TextInput label="Name" value={name} onChange={setName} required />
      <div>
        <Button type="submit" loading={copy.isPending} disabled={name.trim() === ''}>
          Copy
        </Button>
      </div>
      {error !== null && <ErrorBlock error={error} compact />}
    </form>
  );
}

/** Combine, from a workflow's own page, its latest version chosen to start with. */
function CombineHere({ page }: { page: Page }) {
  const listed = queryView($api.useQuery('get', '/api/v1/workflows'));
  const latest = latestVersion(page.versions);
  if (listed.state !== 'ready') return null;
  return (
    <Card>
      <Combine
        items={listed.data}
        chosen={latest === undefined ? [] : [`${page.owner}/${page.name}@${latest}`]}
      />
    </Card>
  );
}
