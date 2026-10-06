import { Anchor, Stack } from '@mantine/core';
import { Link } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';

export function NotFound() {
  return (
    <Stack gap="xs" align="flex-start" py="xl">
      <PageTitle>404</PageTitle>
      <BodyText>There is nothing at this address.</BodyText>
      <Anchor component={Link} to="/" size="sm">
        Browse contests
      </Anchor>
    </Stack>
  );
}
