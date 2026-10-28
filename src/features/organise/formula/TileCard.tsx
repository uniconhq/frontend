import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpCard } from '@/ui/HelpCard';
import type { Insert, Inserter } from './target';
import classes from './formula.module.css';

function belowFormula(anchor: HTMLElement | null): number {
  const formula = anchor
    ?.closest('[data-formula-card]')
    ?.querySelector('[role="textbox"][contenteditable]');
  return Math.max(12, (formula?.getBoundingClientRect().bottom ?? 0) + 8);
}

/** A tile inserts; its explanation never takes the formula's focus. */
export function TileCard({
  name,
  shape,
  tone,
  insert,
  onInsert,
  children,
}: {
  name: string;
  shape: string;
  tone?: string;
  insert: Insert;
  onInsert: Inserter;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [ceiling, setCeiling] = useState(0);
  const show = () => {
    setCeiling(belowFormula(anchor.current));
    setOpen(true);
  };
  const cancel = () => clearTimeout(timer.current);
  const close = () => {
    cancel();
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearTimeout(timer.current);
        setOpen(false);
      }
    };
    const place = () => setCeiling(belowFormula(anchor.current));
    document.addEventListener('keydown', escape, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <HelpCard
      opened={open}
      ceiling={ceiling}
      onClose={close}
      onMouseEnter={cancel}
      onMouseLeave={close}
      id={id}
      className={classes.tileCard}
      target={
        <div
          className={classes.tile}
          ref={anchor}
          onMouseEnter={() => {
            cancel();
            timer.current = setTimeout(show, 300);
          }}
          onMouseLeave={() => {
            cancel();
            timer.current = setTimeout(() => setOpen(false), 80);
          }}
          onBlur={close}
          onKeyDown={(event) => {
            if (open && (event.key === 'PageDown' || event.key === 'PageUp')) {
              const card = document.getElementById(id);
              if (card !== null) {
                event.preventDefault();
                card.scrollBy({
                  top: card.clientHeight * (event.key === 'PageDown' ? 1 : -1),
                });
              }
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <button
            type="button"
            className={classes.paletteItem}
            aria-label={`${name} ${shape}`}
            aria-describedby={open ? id : undefined}
            onFocus={() => {
              cancel();
              show();
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              close();
              onInsert(insert);
            }}
          >
            <span className={`${classes.tileName} ${tone ?? ''}`}>{name}</span>
            <span className={classes.paletteLine}>{shape}</span>
          </button>
          <button
            type="button"
            className={classes.tileInfo}
            aria-label={`About ${name}`}
            aria-describedby={open ? id : undefined}
            onClick={() => {
              cancel();
              if (open) close();
              else show();
            }}
          >
            ⓘ
          </button>
        </div>
      }
    >
      <strong>{name}</strong>
      <div>{shape}</div>
      {children}
    </HelpCard>
  );
}
