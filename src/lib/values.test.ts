import { describe, expect, it } from 'vitest';
import type { ValueMeaning } from '@/api/types';
import {
  foldWord,
  inReportOrder,
  titleInSentence,
  valueFirst,
  valueTitle,
  withUnit,
} from './values';

const TIME: ValueMeaning = {
  name: 'time_ms',
  title: 'Run time',
  unit: 'ms',
  better: 'lower',
};

describe('a reported value in words (M58)', () => {
  it('goes by its title, and by its key until it has one', () => {
    expect(valueTitle('time_ms', TIME)).toBe('Run time');
    expect(valueTitle('time_ms', { ...TIME, title: null })).toBe('time_ms');
    expect(valueTitle('time_ms')).toBe('time_ms');
  });

  it('lowers its title inside a sentence, but not an abbreviation or a key', () => {
    expect(titleInSentence('time_ms', TIME)).toBe('run time');
    expect(titleInSentence('cpu', { ...TIME, title: 'CPU time' })).toBe('CPU time');
    expect(titleInSentence('Time_ms')).toBe('Time_ms');
  });

  it('lowers its first letter only where a lower-case letter follows, as the forge does', () => {
    expect(titleInSentence('r2', { ...TIME, title: 'R2 score' })).toBe('R2 score');
    expect(titleInSentence('peak', { ...TIME, title: 'P-value' })).toBe('P-value');
    expect(titleInSentence('size', { ...TIME, title: 'Éclat size' })).toBe(
      'éclat size',
    );
  });

  it('puts its unit after a number, and nothing where it has none', () => {
    expect(withUnit('28', TIME)).toBe('28 ms');
    expect(withUnit('28', { ...TIME, unit: null })).toBe('28');
  });

  it('keeps the workflow’s report order, unknown names after', () => {
    const meanings = [TIME, { ...TIME, name: 'memory_kb' }];
    expect(inReportOrder(['score', 'memory_kb', 'time_ms'], meanings)).toEqual([
      'time_ms',
      'memory_kb',
      'score',
    ]);
  });
});

describe('how a leaderboard combines a value across the tests', () => {
  it('reads max as the highest, sum as the total and mean as the average', () => {
    expect(foldWord('max')).toBe('highest');
    expect(foldWord('sum')).toBe('total');
    expect(foldWord('mean')).toBe('average');
    expect(foldWord(null)).toBeNull();
  });

  it('ranks lowest or highest first as the value says is better', () => {
    expect(valueFirst(TIME)).toBe('lowest first');
    expect(valueFirst({ better: 'higher' })).toBe('highest first');
    expect(valueFirst(undefined)).toBe('best first');
  });
});
