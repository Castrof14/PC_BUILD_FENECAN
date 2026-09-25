import type { Build } from "../types/build.js";
import type { BuildRepository } from "./build.repository.js";

/**
 * Armazenamento temporário em memória, usado apenas no MVP.
 *
 * Os dados se perdem quando o servidor reinicia — isso é intencional.
 * A troca por PostgreSQL/Prisma será feita implementando `BuildRepository`.
 */
export class InMemoryBuildRepository implements BuildRepository {
  private readonly store = new Map<string, Build>();
  private sequence = 0;

  save(build: Build): Build {
    this.store.set(build.buildId, build);
    return build;
  }

  findById(buildId: string): Build | undefined {
    return this.store.get(buildId);
  }

  /** Sequência simples e legível: BUILD-001, BUILD-002, ... */
  generateBuildId(): string {
    this.sequence += 1;
    return `BUILD-${String(this.sequence).padStart(3, "0")}`;
  }
}
