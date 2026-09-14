import type { ReactNode } from 'react';
import { t } from '@/lib/t';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import classes from './AppShell.module.css';

/**
 * Header across the top (48px), sidebar down the left (178px), content in the
 * rest. Separation is borders and surface steps; the design has no shadows
 * anywhere.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={classes.shell}>
      <a href="#main" className={classes.skip}>
        {t('Skip to content')}
      </a>
      <Header />
      <div className={classes.main}>
        <Sidebar />
        <main id="main" tabIndex={-1} className={classes.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
