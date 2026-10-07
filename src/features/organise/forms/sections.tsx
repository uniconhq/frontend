import { useState, type ReactNode } from 'react';
import { useMe } from '@/session';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import type { Place } from '../files/place';
import { holdsAt } from '../roles';
import shared from '../organise.module.css';
import { ContestSettings } from './ContestSettings';

/**
 * A part of the page that reads its file when it is opened, not as the page
 * loads, so the version it saves against is the one the organiser started
 * from. Closing it drops what was not saved. `children` is told whether the
 * person is an admin where the file is, counting a broader scope, since the
 * admin's keys are read-only to anyone else.
 */
export function OpenSection({
  title,
  place,
  openLabel,
  children,
}: {
  title: string;
  place: Place;
  openLabel: (admin: boolean) => string;
  children: (admin: boolean) => ReactNode;
}) {
  const admin = holdsAt(useMe().roles, place, 'admin');
  const [open, setOpen] = useState(false);
  return (
    <div className={shared.stack}>
      <SectionTitle>{title}</SectionTitle>
      <div className={shared.actions}>
        <Button variant="secondary" onClick={() => setOpen(!open)}>
          {open ? 'Close' : openLabel(admin)}
        </Button>
      </div>
      {open && children(admin)}
    </div>
  );
}

export function ContestSettingsSection({ place }: { place: Place }) {
  return (
    <OpenSection title="Settings" place={place} openLabel={() => 'Edit the settings'}>
      {(admin) => <ContestSettings place={place} admin={admin} />}
    </OpenSection>
  );
}
