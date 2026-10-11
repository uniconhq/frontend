import { Stack } from '@mantine/core';
import { PageTitle } from '@/ui/PageTitle';
import { PageLink } from '@/ui/PageLink';
import { BodyText } from '@/ui/BodyText';

export function NotFound() {
  return (
    <Stack gap="xs" align="flex-start" py="xl">
      <PageTitle>Page not found</PageTitle>
      <BodyText>There is nothing at this address.</BodyText>
      <PageLink to="/">Browse contests</PageLink>
    </Stack>
  );
}
