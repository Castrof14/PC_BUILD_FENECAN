import type { BuildRepository } from "../repository/build.repository.js";
import type { Build, NewBuild } from "../types/build.js";

/**
 * Regras de negócio das builds.
 *
 * Não conhece Fastify nem HTTP: recebe `BuildConfig` já validada e devolve
 * entidades. A máquina de estados (`WAITING -> BUILDING -> COMPLETED/ERROR`)
 * mora na fila (`QueueService`), e não aqui.
 */
export class BuildService {
  constructor(private readonly repository: BuildRepository) {}

  /**
   * Cria uma nova build. O status inicial `WAITING` e o `BUILD-001` são
   * definidos pelo repositório, que é quem conhece o banco.
   */
  async createBuild(config: NewBuild): Promise<Build> {
    return this.repository.create(config);
  }

  /** Busca uma build pelo id. Retorna `undefined` quando não existe. */
  async getBuild(buildId: string): Promise<Build | undefined> {
    return this.repository.findById(buildId);
  }
}
