import { useState } from 'react';
import { $api } from '@/api/query';
import type { WorkflowItem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Stack } from '@/ui/layout';
import { WorkflowSearch } from '../workflows/WorkflowSearch';
import { refParts } from './build-data';

/** A saved pin remains visible even after its owner stops new use. */
export function WorkflowPicker({
  value,
  items,
  onChange,
  disabled = false,
}: {
  value: string;
  items: WorkflowItem[];
  onChange: (ref: string) => void;
  disabled?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const parts = refParts(value);
  const listed = items.find(
    (each) => each.owner === parts?.owner && each.name === parts.name,
  );
  const page = $api.useQuery(
    'get',
    '/api/v1/workflows/{owner}/{name}',
    {
      params: { path: { owner: parts?.owner ?? '', name: parts?.name ?? '' } },
    },
    { enabled: parts !== null && listed === undefined, retry: false },
  );
  const item = listed ?? page.data;
  const mark = parts === null ? undefined : item?.yanked?.[parts.version];
  return (
    <Stack gap={8} align="flex-start">
      <BodyText>{value || 'No workflow chosen'}</BodyText>
      {item?.description && <BodyText tone="secondary">{item.description}</BodyText>}
      {mark && <BodyText>Not for new tasks. {mark.reason}</BodyText>}
      {page.isError && <BodyText>This workflow could not be read.</BodyText>}
      <Button variant="secondary" disabled={disabled} onClick={() => setOpened(true)}>
        Choose a workflow
      </Button>
      {opened && (
        <WorkflowSearch
          onClose={() => setOpened(false)}
          onChoose={(ref) => {
            onChange(ref);
            setOpened(false);
          }}
        />
      )}
    </Stack>
  );
}
