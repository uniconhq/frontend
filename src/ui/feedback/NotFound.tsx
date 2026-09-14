import { Anchor, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { t } from '@/lib/t';

export function NotFound() {
  return (
    <Stack gap="xs" align="flex-start" py="xl">
      <Title order={1}>404</Title>
      <Text size="sm" c="var(--unicon-text-body)">
        {t('There is nothing at this address.')}
      </Text>
      <Anchor component={Link} to="/" size="sm">
        {t('Browse contests')}
      </Anchor>
    </Stack>
  );
}
