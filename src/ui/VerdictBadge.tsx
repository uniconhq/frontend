import { Badge, useMantineTheme, useComputedColorScheme } from '@mantine/core';
import { lookOf, type Verdict } from './verdicts';

/**
 * The wrapper pattern: application code imports VerdictBadge, never Badge, so a
 * breaking Mantine major is confined to this folder.
 *
 * Squared rather than a pill so verdicts stack into an even column, monospace
 * label, and the colour pair read from theme.other.verdict. The label always
 * ships with the colour: a verdict must never be carried by colour alone.
 *
 * A verdict is an outcome the run gave, or where a grading stands while it has
 * none to show. The six colour pairs are the handoff's, so every outcome and
 * status takes one of them: passing, failing, a limit (and a partial pass,
 * which is between the two), a build or platform error, under way, and
 * waiting or neutral. `done` is neutral, because a grading whose outcome the
 * task keeps hidden says nothing about whether it passed.
 */

/**
 * One verdict. One the app does not know yet, from a runner newer than this
 * bundle, shows under its own name in the neutral pair rather than not at all.
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
