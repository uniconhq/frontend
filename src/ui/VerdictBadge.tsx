import { Badge, useMantineTheme, useComputedColorScheme } from '@mantine/core';
import { lookOf, type Verdict } from './verdicts';

/**
 * Squared so verdicts stack into an even column; the label always ships with
 * the colour. An unknown verdict shows under its own name in the neutral pair.
 */
export function VerdictBadge({ verdict }: { verdict: Verdict | (string & {}) }) {
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('dark');
  const look = lookOf(verdict);
  const [bg, fg] = theme.other.verdict[look.colors][scheme];

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
      {look.label}
    </Badge>
  );
}
