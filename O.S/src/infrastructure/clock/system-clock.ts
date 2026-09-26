import type { Clock } from '../../application/ports/index.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
