import { BodyText } from '@/ui/BodyText';
import { REBUILDING } from './board-text';

/** A leaderboard table, rebuilt in a later phase. */
export function BoardTable() {
  return <BodyText>{REBUILDING}</BodyText>;
}
