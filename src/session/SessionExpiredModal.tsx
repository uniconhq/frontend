import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { Modal } from '@/ui/Modal';
import { Button } from '@/ui/Button';
import { BodyText } from '@/ui/BodyText';
import { isSessionExpired, subscribe } from './expired';
import { currentPath, loginHref } from './login-href';
import classes from './SessionExpiredModal.module.css';

/** Not dismissable; the page underneath stays mounted so typed work survives. */
export function SessionExpiredModal() {
  const location = useLocation();
  const expired = useSyncExternalStore(subscribe, isSessionExpired, () => false);

  return (
    <Modal
      opened={expired}
      onClose={() => {}}
      title="Your session ended"
      dismissable={false}
    >
      <BodyText size="md">
        This page and anything you have typed are still here. Sign in again to save it.
      </BodyText>
      <div className={classes.actions}>
        <Button href={loginHref(currentPath(location))}>Sign in again</Button>
      </div>
    </Modal>
  );
}
