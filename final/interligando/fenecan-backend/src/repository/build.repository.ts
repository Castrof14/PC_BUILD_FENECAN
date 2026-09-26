import type { Build, BuildStatus, NewBuild } from "../types/build.js";

/**
 * Contrato de persistência de builds.
 *
 * A interface original do módulo de API era síncrona (Map em memória).
 * Com o MySQL do módulo de fila, tudo virou Promise — as rotas já eram
 * `async`, então nenhuma delas precisou mudar de formato.
 *
 * Todas as operações de status são condicionais (`from` -> `to`): é isso
 * que garante a concorrência, porque o WHERE só bate em uma linha se ela
 * ainda estiver no estado esperado. Assim "concluir" uma build que já foi
 * concluída não sobrescreve nada, e dois eventos simultâneos não duplicam.
 */
export interface BuildRepository {
  /** Insere a build já entra na fila (`WAITING`) e devolve o registro salvo. */
  create(input: NewBuild): Promise<Build>;
  /** Busca uma build pelo id público (`BUILD-001`), ou `undefined` se não existir. */
  findById(buildId: string): Promise<Build | undefined>;
  /** Todas as builds em um status, na ordem de chegada (FIFO). */
  findByStatus(status: BuildStatus): Promise<Build[]>;
  /** A build em montagem agora, ou `undefined` se a fila estiver ociosa. */
  findBuilding(): Promise<Build | undefined>;
  /**
   * Reserva atomicamente a próxima build da fila e já a marca `BUILDING`.
   * Devolve `undefined` se já existe uma `BUILDING` ou se a fila está vazia.
   */
  claimNextBuild(): Promise<Build | undefined>;
  /**
   * Muda o status de `from` para `to`. Devolve a build atualizada, ou
   * `undefined` se ela não existe ou não estava em `from`.
   */
  updateStatus(
    buildId: string,
    from: readonly BuildStatus[],
    to: BuildStatus,
  ): Promise<Build | undefined>;
  /** Quantidade de builds por status (todas as chaves sempre presentes). */
  countByStatus(): Promise<Record<BuildStatus, number>>;
  /**
   * Posição na fila (1 = próxima). `0` para quem já saiu da fila e
   * `undefined` se a build não existir.
   */
  positionInQueue(buildId: string): Promise<number | undefined>;
  /** Encerra o pool de conexões. */
  close(): Promise<void>;
}
