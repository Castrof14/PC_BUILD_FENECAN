/**
 * Bateria de testes que TODA implementacao de OrderRepository deve passar.
 *
 * Quem criar o DatabaseOrderRepository chama esta funcao com uma fabrica que
 * devolve um repositorio vazio (ex.: banco de teste limpo):
 *
 *   runOrderRepositoryContract('DatabaseOrderRepository', async () => new DatabaseOrderRepository(...));
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrderRepository } from '../../src/application/ports/index.js';
import { changeOrderStatus, createOrder, type Order } from '../../src/domain/index.js';

const COMPONENTS = {
  cpu: 'ryzen-5-5600',
  gpu: 'rtx-4060',
  ram: '16gb',
  storage: 'nvme-1tb',
  motherboard: 'b550',
  psu: '650w',
  case: 'mid-tower',
};

function order(id: string, minute: number): Order {
  return createOrder({ id, components: COMPONENTS }, new Date(Date.UTC(2026, 8, 26, 10, minute)));
}

export function runOrderRepositoryContract(
  name: string,
  createEmptyRepository: () => Promise<OrderRepository>,
): void {
  describe(`contrato OrderRepository: ${name}`, () => {
    it('salva e busca pelo id', async () => {
      const repo = await createEmptyRepository();
      const saved = order('PED-001', 0);
      await repo.save(saved);
      assert.deepEqual(await repo.findById('PED-001'), saved);
    });

    it('devolve null / false para id inexistente', async () => {
      const repo = await createEmptyRepository();
      assert.equal(await repo.findById('NAO-EXISTE'), null);
      assert.equal(await repo.exists('NAO-EXISTE'), false);
    });

    it('exists reflete o que foi salvo', async () => {
      const repo = await createEmptyRepository();
      await repo.save(order('PED-001', 0));
      assert.equal(await repo.exists('PED-001'), true);
    });

    it('save com o mesmo id substitui a O.S.', async () => {
      const repo = await createEmptyRepository();
      const pending = order('PED-001', 0);
      await repo.save(pending);
      const accepted = changeOrderStatus(pending, 'ACCEPTED', new Date(Date.UTC(2026, 8, 26, 11)));
      await repo.save(accepted);

      assert.deepEqual(await repo.findById('PED-001'), accepted);
      assert.equal((await repo.findAll()).length, 1);
    });

    it('findAll lista da mais antiga para a mais nova', async () => {
      const repo = await createEmptyRepository();
      await repo.save(order('PED-003', 2));
      await repo.save(order('PED-001', 0));
      await repo.save(order('PED-002', 1));
      assert.deepEqual((await repo.findAll()).map((o) => o.id), ['PED-001', 'PED-002', 'PED-003']);
    });

    it('findAll desempata pelo id quando createdAt e igual', async () => {
      const repo = await createEmptyRepository();
      await repo.save(order('PED-B', 0));
      await repo.save(order('PED-A', 0));
      assert.deepEqual((await repo.findAll()).map((o) => o.id), ['PED-A', 'PED-B']);
    });

    it('findAll filtra por um ou varios status', async () => {
      const repo = await createEmptyRepository();
      const later = new Date(Date.UTC(2026, 8, 26, 12));
      await repo.save(order('PED-001', 0));
      await repo.save(changeOrderStatus(order('PED-002', 1), 'ACCEPTED', later));
      await repo.save(changeOrderStatus(order('PED-003', 2), 'CANCELLED', later));

      assert.deepEqual((await repo.findAll({ status: 'ACCEPTED' })).map((o) => o.id), ['PED-002']);
      assert.deepEqual(
        (await repo.findAll({ status: ['PENDING', 'CANCELLED'] })).map((o) => o.id),
        ['PED-001', 'PED-003'],
      );
      assert.deepEqual(await repo.findAll({ status: [] }), []);
    });

    it('findAll em repositorio vazio devolve lista vazia', async () => {
      const repo = await createEmptyRepository();
      assert.deepEqual(await repo.findAll(), []);
    });

    it('preserva todos os campos da O.S.', async () => {
      const repo = await createEmptyRepository();
      const saved = order('PED-001', 0);
      await repo.save(saved);
      const [listed] = await repo.findAll();
      assert.deepEqual(listed, saved);
    });
  });
}
