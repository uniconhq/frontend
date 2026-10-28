import { Group } from '@mantine/core';
import { Chip } from './Chip';
import { InfoTip } from './InfoTip';
import { PageLink } from './PageLink';

/** The organisers page explains who can change these readable fields. */
export function ReadOnly({ to, organisers }: { to: string; organisers: string }) {
  return (
    <Group gap={4}>
      <Chip>Read only</Chip>
      <InfoTip about="Read only">
        Your role here doesn’t change this. See who can on{' '}
        <PageLink to={to}>{organisers}</PageLink>.
      </InfoTip>
    </Group>
  );
}
