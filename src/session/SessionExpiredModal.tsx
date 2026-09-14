import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { Modal } from '@/ui/Modal';
import { LinkButton } from '@/ui/LinkButton';
import { BodyText } from '@/ui/BodyText';
import { t } from '@/lib/t';
import { isSessionExpired, subscribe } from './expired';
import { currentPath, loginHref } from './login-href';

/**
 * Rendered once, in the root layout. The page underneath stays mounted, so an
 * unsent clarification and every filter the person set are still there when
 * they come back, and the modal cannot be dismissed into a signed-out page
 * pretending to work.
 */
export function SessionExpiredModal() {
  const location = useLocation();
  const expired = useSyncExternalStore(subscribe, isSessionExpired, () => false);

  return (
    <Modal
      opened={expired}
      onClose={() => {}}
      title={t('Your session ended')}
      dismissable={false}
    >
      <BodyText size="md">
        {t(
          'This page and anything you have typed are still here. Sign in again to save it.',
        )}
      </BodyText>
      <div style={{ marginTop: 14 }}>
        <LinkButton href={loginHref(currentPath(location))}>
          {t('Sign in again')}
        </LinkButton>
      </div>
    </Modal>
  );
}
