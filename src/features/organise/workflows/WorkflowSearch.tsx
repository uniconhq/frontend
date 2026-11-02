import { useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import type { WorkflowItem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Modal } from '@/ui/Modal';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { naturally } from '../task/build-data';
import classes from './workflows.module.css';

type Scope = 'mine' | 'orgs' | 'public' | undefined;

function Result({
  item,
  onChoose,
  choosing,
}: {
  choosing: boolean;
  item: WorkflowItem;
  onChoose: (ref: string, item: WorkflowItem) => void;
}) {
  const versions = [...item.versions].sort(naturally).reverse();
  const [version, setVersion] = useState(
    () => versions.find((each) => !item.yanked?.[each]) ?? '',
  );
  const name = `${item.owner}/${item.name}`;
  return (
    <Card>
      <div className={classes.stack}>
        <BodyText>
          <strong>{name}</strong>
        </BodyText>
        <BodyText tone="secondary">{item.description ?? ''}</BodyText>
        <Select
          label={`Version of ${name}`}
          value={version}
          onChange={setVersion}
          placeholder={version === '' ? 'No version for new tasks' : undefined}
          options={versions.map((each) => ({
            value: each,
            label: item.yanked?.[each] ? `${each} · Not for new tasks` : each,
            disabled: Boolean(item.yanked?.[each]),
          }))}
        />
        <Button
          disabled={choosing || version === '' || Boolean(item.yanked?.[version])}
          onClick={() => onChoose(`${name}@${version}`, item)}
          label={`Choose ${name}`}
        >
          Choose
        </Button>
      </div>
    </Card>
  );
}

/** Forgejo's visible workflows, paged without dropping short keyword pages. */
export function WorkflowSearch({
  onClose,
  onChoose,
  exclude,
  problem,
  choosing = false,
}: {
  choosing?: boolean;
  exclude?: string;
  problem?: string | null;
  onClose: () => void;
  onChoose: (ref: string, item: WorkflowItem) => void;
}) {
  const [text, setText] = useState('');
  const [q] = useDebouncedValue(text, 300);
  const [scope, setScope] = useState<Scope>(undefined);
  const results = useInfiniteQuery({
    queryKey: ['workflow-search', q, scope],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await apiClient.GET('/api/v1/workflow-search', {
        params: { query: { q, scope, page: pageParam } },
      });
      if (data === undefined)
        throw new Error('The workflow search returned no answer.');
      return data;
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const items = new Map(
    results.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => `${item.owner}/${item.name}` !== exclude)
      .map((item) => [`${item.owner}/${item.name}`, item]),
  );
  return (
    <Modal opened onClose={onClose} title="Find a workflow" wide>
      <div className={classes.stack}>
        <TextInput
          label="Search workflows"
          value={text}
          onChange={setText}
          maxLength={256}
        />
        <div role="group" aria-label="Search scope" className={classes.barActions}>
          {(
            [
              ['All visible', undefined],
              ['Mine', 'mine'],
              ['My orgs', 'orgs'],
              ['Public', 'public'],
            ] as const
          ).map(([label, value]) => (
            <Button
              key={label}
              variant="secondary"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {problem && <p role="alert">{problem}</p>}
        {results.isPending && <BodyText>Finding workflows…</BodyText>}
        {results.isError && (
          <ErrorBlock
            error={toApiError(results.error)}
            onRetry={() => void results.refetch()}
          />
        )}
        {[...items].map(([name, item]) => (
          <Result key={name} item={item} onChoose={onChoose} choosing={choosing} />
        ))}
        {results.isSuccess && items.size === 0 && (
          <BodyText>No workflows match.</BodyText>
        )}
        {results.hasNextPage && (
          <Button
            variant="secondary"
            loading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            More
          </Button>
        )}
      </div>
    </Modal>
  );
}
