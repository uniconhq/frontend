import { Fragment } from 'react';
import classes from './formula.module.css';

/** A slot of a block, such as `test`, set apart from the words around it. */
export function Slot({ name }: { name: string }) {
  return <code className={classes.slot}>{name}</code>;
}

/** A block's words as forge writes them, each `slot` set apart. */
export function BlockWords({ words }: { words: string }) {
  return words
    .split('`')
    .map((part, index) => (
      <Fragment key={index}>{index % 2 === 1 ? <Slot name={part} /> : part}</Fragment>
    ));
}
