/** Fonte do horario atual. Permite testes deterministicos. */
export interface Clock {
  now(): Date;
}
