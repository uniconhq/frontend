import type { ReactNode } from 'react';
import { Header } from './Header';
import classes from './AppShell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={classes.shell}>
      <a href="#main" className={classes.skip}>
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className={classes.content}>
        {children}
      </main>
    </div>
  );
}
