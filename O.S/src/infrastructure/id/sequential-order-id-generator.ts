import type { OrderIdGenerator } from '../../application/ports/index.js';

export interface SequentialOrderIdGeneratorOptions {
  /** Padrao: `PED` */
  prefix?: string;
  /** Quantidade minima de digitos. Padrao: 3 (`PED-001`). */
  digits?: number;
  /** Primeiro numero gerado. Padrao: 1. */
  start?: number;
}

/** Gera `PED-001`, `PED-002`, ... O contador vive em memoria. */
export class SequentialOrderIdGenerator implements OrderIdGenerator {
  private readonly prefix: string;
  private readonly digits: number;
  private counter: number;

  constructor(options: SequentialOrderIdGeneratorOptions = {}) {
    this.prefix = options.prefix ?? 'PED';
    this.digits = options.digits ?? 3;
    this.counter = options.start ?? 1;
    if (!Number.isInteger(this.counter) || this.counter < 0) {
      throw new RangeError(`start deve ser um inteiro >= 0. Recebido: ${this.counter}`);
    }
  }

  async next(): Promise<string> {
    const value = this.counter;
    this.counter += 1;
    return `${this.prefix}-${String(value).padStart(this.digits, '0')}`;
  }
}
