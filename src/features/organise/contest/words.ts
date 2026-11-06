/** Who may see the contest. Who may enter is separate, under How people enter. */
export const VISIBILITY_CHOICES = [
  { value: 'everyone', label: 'Anyone, signed in or not' },
  { value: 'signed-in', label: 'Anyone signed in' },
  { value: 'hidden', label: 'Only its entrants and organisers' },
];

export function teamsSentence(values: {
  most: string;
  fewest: string;
  locks: string;
}): string {
  if (values.most === '' || values.most === '1') return 'Everyone enters alone';
  const fewest = values.fewest === '' ? '1' : values.fewest;
  const size =
    fewest === '1'
      ? `up to ${values.most} people`
      : fewest === values.most
        ? `exactly ${values.most} people`
        : `${fewest} to ${values.most} people`;
  const fixed =
    values.locks === 'first_submission'
      ? 'fixed at a team’s first submission'
      : 'fixed when the contest starts';
  return `Teams of ${size}, ${fixed}`;
}

export function visibilitySentence(visibility: string): string {
  switch (visibility) {
    case 'everyone':
      return 'Anyone can see it, signed in or not.';
    case 'hidden':
      return 'Only its entrants and organisers can see it.';
    default:
      return 'Anyone signed in can see it.';
  }
}
