import { Badge, useMantineTheme, useComputedColorScheme } from '@mantine/core';
import type { VerdictName } from '@/theme/theme';

/**
 * The wrapper pattern: application code imports VerdictBadge, never Badge, so a
 * breaking Mantine major is confined to this folder.
 *
 * Squared rather than a pill so verdicts stack into an even column, monospace
 * label, and the colour pair read from theme.other.verdict. The label always
 * ships with the colour: a verdict must never be carried by colour alone.
 */

const LABEL: Record<VerdictName, string> = {
  accepted: 'ACCEPTED',
  rejected: 'WRONG ANSWER',
  running: 'RUNNING',
  limit: 'TIME LIMIT',
  error: 'COMPILE ERR',
  queued: 'QUEUED',
};

export function VerdictBadge({ verdict }: { verdict: VerdictName }) {
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('dark');
  const [bg, fg] = theme.other.verdict[verdict][scheme];

  return (
    <Badge
      radius="xs"
      styles={{
        root: { backgroundColor: bg, color: fg, textTransform: 'none' },
        label: {
          fontFamily: theme.fontFamilyMonospace,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0,
        },
      }}
    >
      {LABEL[verdict]}
    </Badge>
  );
}
