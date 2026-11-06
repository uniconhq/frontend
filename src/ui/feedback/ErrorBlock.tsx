import { Code, Stack } from '@mantine/core';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { BodyText } from '@/ui/BodyText';
import { toApiError } from '@/api/problem';
import { describeError } from '@/api/describe-error';

/**
 * What a page shows when something failed: `heading`, what it was doing
 * ("Couldn't load" unless said), over the server's sentence. Inside the
 * shell, never a full-page replacement, so the person keeps their navigation
 * and their drafts. The code underneath is for a support message.
 *
 * `compact` is the heading and the sentence alone, for a menu or a dialog
 * that has no room for a code or a retry.
 */
export function ErrorBlock({
  error,
  onRetry,
  compact = false,
  heading = 'Couldn’t load',
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  heading?: string;
}) {
  const apiError = toApiError(error);
  const { title, message } = describeError(apiError, heading);

  if (compact) {
    return (
      <>
        <BodyText tone="secondary">{title}</BodyText>
        <BodyText tone="secondary">{message}</BodyText>
      </>
    );
  }

  return (
    <Stack gap="xs" align="flex-start" py="lg">
      <SectionTitle>{title}</SectionTitle>
      <BodyText>{message}</BodyText>
      <Code c="var(--unicon-text-secondary)" bg="transparent">
        {apiError.code}
        {apiError.status > 0 ? ` · ${String(apiError.status)}` : ''}
      </Code>
      {onRetry !== undefined && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Stack>
  );
}
