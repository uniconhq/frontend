/**
 * Who may see a contest, in the words its organisers choose them by. Who
 * may enter it is a separate question, How people enter.
 */
export const VISIBILITY_CHOICES = [
  { value: 'everyone', label: 'Anyone, signed in or not' },
  { value: 'signed-in', label: 'Anyone signed in' },
  { value: 'hidden', label: 'Only its entrants and organisers' },
];

/** Who sees the contest once it is open, as a sentence. */
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
