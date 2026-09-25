import type { Build, BuildConfig } from "../types/build.js";
import type { BuildRepository } from "../repository/build.repository.js";

/**
 * Regras de negócio das builds.
 *
 * Não conhece Fastify nem HTTP: recebe `BuildConfig` já validada e devolve
 * entidades. É o ponto natural para a futura máquina de estados
 * (WAITING -> BUILDING -> COMPLETED/ERROR) controlada pela fila.
 */
export class BuildService {
  constructor(private readonly repository: BuildRepository) {}

  /** Cria uma nova build com status inicial `WAITING`. */
  createBuild(config: BuildConfig): Build {
    const build: Build = {
      buildId: this.repository.generateBuildId(),
      ...config,
      status: "WAITING",
    };

    return this.repository.save(build);
  }

  /** Busca uma build pelo id. Retorna `undefined` quando não existe. */
  getBuild(buildId: string): Build | undefined {
    return this.repository.findById(buildId);
  }
}
