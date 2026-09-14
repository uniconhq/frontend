import { Button, Code, Stack, Text } from '@mantine/core';
import { SectionTitle } from '@/ui/SectionTitle';
import { toApiError } from '@/api/problem';
import { describeError } from '@/api/describe-error';
import { t } from '@/lib/t';

/**
 * What a page shows when its data would not load. Inside the shell, never a
 * full-page replacement, so the person keeps their navigation and their drafts.
 * The words come from describeError; the code underneath is for a support
 * message, not for reading.
 */
export function ErrorBlock({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const apiError = toApiError(error);
  const { title, message } = describeError(apiError);

  return (
    <Stack gap="xs" align="flex-start" py="lg">
      <SectionTitle>{title}</SectionTitle>
      <Text size="sm" c="var(--unicon-text-body)">
        {message}
      </Text>
      <Code c="var(--unicon-text-secondary)" bg="transparent">
        {apiError.code}
        {apiError.status > 0 ? ` · ${String(apiError.status)}` : ''}
      </Code>
      {onRetry !== undefined && (
        <Button size="xs" variant="default" onClick={onRetry}>
          {t('Try again')}
        </Button>
      )}
    </Stack>
  );
}
