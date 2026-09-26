import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KeyedLock } from '../../src/application/shared/keyed-lock.js';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('KeyedLock', () => {
  it('executa tarefas da mesma chave uma de cada vez, na ordem', async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:inicio`);
      await tick();
      log.push(`${name}:fim`);
    };
    await Promise.all([lock.run('A', task('1')), lock.run('A', task('2'))]);
    assert.deepEqual(log, ['1:inicio', '1:fim', '2:inicio', '2:fim']);
  });

  it('nao bloqueia chaves diferentes', async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:inicio`);
      await tick();
      log.push(`${name}:fim`);
    };
    await Promise.all([lock.run('A', task('A')), lock.run('B', task('B'))]);
    assert.deepEqual(log.slice(0, 2).sort(), ['A:inicio', 'B:inicio']);
  });

  it('continua funcionando depois que uma tarefa falha', async () => {
    const lock = new KeyedLock();
    const failed = lock.run('A', async () => {
      throw new Error('falhou');
    });
    const next = lock.run('A', async () => 'ok');
    await assert.rejects(failed, /falhou/);
    assert.equal(await next, 'ok');
  });
});
