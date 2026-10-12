import { describe, expect, it } from 'vitest';
import type { ValueMeaning } from '@/api/types';
import {
  foldWords,
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
  fold: 'max',
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

describe('what a fold over the tests is (M63)', () => {
  it('reads the most of a time as the longest, of anything else lower-is-better as the most', () => {
    expect(foldWords(TIME)).toBe('the longest');
    expect(foldWords({ ...TIME, unit: 'KB' })).toBe('the most');
    expect(foldWords({ ...TIME, better: 'higher', unit: null })).toBe('the highest');
  });

  it('reads a sum as the total and a mean as the average, and nothing unfolded', () => {
    expect(foldWords({ ...TIME, fold: 'sum' })).toBe('the total');
    expect(foldWords({ ...TIME, fold: 'mean' })).toBe('the average');
    expect(foldWords({ ...TIME, fold: null })).toBeNull();
  });

  it('ranks lowest or highest first as the value says is better', () => {
    expect(valueFirst(TIME)).toBe('lowest first');
    expect(valueFirst({ better: 'higher' })).toBe('highest first');
    expect(valueFirst(undefined)).toBe('best first');
  });
});
