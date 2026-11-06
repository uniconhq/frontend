import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageTitle } from '@/ui/PageTitle';
import { Group, Stack } from '@/ui/layout';
import { CreateAccountLink, currentPath, loginHref } from '@/session';

/** The way in, back to this page: sign in, and create an account where open. */
export function SignInButtons() {
  const location = useLocation();
  return (
    <Group gap="sm">
      <Button href={loginHref(currentPath(location))}>Sign in</Button>
      <CreateAccountLink />
    </Group>
  );
}

/**
 * What a visitor meets on a contest or a task that is not public: it may be
 * one they see with an account, or it may not be there, and the page cannot
 * say which without telling a visitor what exists.
 */
export function SignInPrompt({ title, back }: { title: string; back?: ReactNode }) {
  return (
    <Stack gap="md">
      {back}
      <PageTitle>{title}</PageTitle>
      <BodyText>
        Only people who are signed in can see this page, if it exists. Sign in to see
        it.
      </BodyText>
      <SignInButtons />
    </Stack>
  );
}
