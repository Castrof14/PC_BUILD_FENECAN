import type { Build } from "../types/build.js";

/**
 * Contrato de persistência de builds.
 *
 * A implementação atual é em memória (Map). Quando o banco de dados entrar,
 * basta criar outra classe que implemente esta interface e injetá-la em
 * `buildApp()` — nenhuma rota ou service precisa mudar.
 */
export interface BuildRepository {
  /** Persiste a build e devolve o registro salvo. */
  save(build: Build): Build;
  /** Busca uma build pelo id, ou `undefined` se não existir. */
  findById(buildId: string): Build | undefined;
  /** Gera o próximo Build ID único (ex.: `BUILD-001`). */
  generateBuildId(): string;
}
