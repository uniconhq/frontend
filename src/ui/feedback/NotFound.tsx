import { Anchor, Stack } from '@mantine/core';
import { Link } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { t } from '@/lib/t';

export function NotFound() {
  return (
    <Stack gap="xs" align="flex-start" py="xl">
      <PageTitle>404</PageTitle>
      <BodyText>{t('There is nothing at this address.')}</BodyText>
      <Anchor component={Link} to="/" size="sm">
        {t('Browse contests')}
      </Anchor>
    </Stack>
  );
}
