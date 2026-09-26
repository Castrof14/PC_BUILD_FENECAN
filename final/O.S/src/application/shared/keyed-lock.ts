/**
 * Serializa operacoes com a mesma chave dentro deste processo.
 *
 * Evita que duas atualizacoes simultaneas da mesma O.S. leiam o mesmo status
 * e ambas sejam aceitas (ex.: PENDING -> ACCEPTED e PENDING -> CANCELLED).
 * Vale so para um processo; com varios processos e um banco, o
 * DatabaseOrderRepository precisa garantir isso (transacao / constraint).
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
