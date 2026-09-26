import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { closeDatabase, pool } from "../database/database.js";
import type { BuildRepository } from "./build.repository.js";
import {
  BUILD_STATUSES,
  type Build,
  type BuildConfig,
  type BuildStatus,
  type NewBuild,
} from "../types/build.js";

/** Forma das linhas de `builds` no MySQL (datas vêm como Date). */
interface BuildRow extends RowDataPacket {
  id: number;
  build_id: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  motherboard: string;
  psu: string;
  case: string;
  status: BuildStatus;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const COLUMNS = "`id`, `build_id`, `cpu`, `gpu`, `ram`, `storage`, `motherboard`, `psu`, `case`, `status`, `created_at`, `updated_at`, `started_at`, `finished_at`";

/** `case` é palavra reservada no MySQL, então as colunas ficam entre crases. */
function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toBuild(row: BuildRow): Build {
  return {
    buildId: row.build_id,
    cpu: row.cpu,
    gpu: row.gpu,
    ram: row.ram,
    storage: row.storage,
    motherboard: row.motherboard,
    psu: row.psu,
    case: row.case,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
  };
}

function toConfig(input: NewBuild): BuildConfig {
  return {
    cpu: input.cpu,
    gpu: input.gpu,
    ram: input.ram,
    storage: input.storage,
    motherboard: input.motherboard,
    psu: input.psu,
    case: input.case,
  };
}

/** Lista de valores para o `IN (...)` das transições condicionais. */
function placeholders(statuses: readonly BuildStatus[]): string {
  return statuses.map(() => "?").join(", ");
}

export class MysqlBuildRepository implements BuildRepository {
  /**
   * Insere a build e deriva o `build_id` do próprio auto-increment.
   *
   * O id público (`BUILD-001`) sai do `id` da linha, então a unicidade
   * vem da primary key — não existe sequência concorrente para errar.
   * Por isso o `build_id` é preenchido em um segundo UPDATE, dentro da
   * mesma transação: ninguém enxerga a linha sem id.
   */
  async create(input: NewBuild): Promise<Build> {
    const connection = await pool.getConnection();
    const config = toConfig(input);

    try {
      await connection.beginTransaction();

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO builds
           (cpu, gpu, ram, storage, motherboard, psu, \`case\`, visitante, configuracao, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          config.cpu,
          config.gpu,
          config.ram,
          config.storage,
          config.motherboard,
          config.psu,
          config.case,
          input.visitante ?? null,
          JSON.stringify(config),
        ],
      );

      const buildId = `BUILD-${String(result.insertId).padStart(3, "0")}`;

      await connection.query(`UPDATE builds SET build_id = ? WHERE id = ?`, [
        buildId,
        result.insertId,
      ]);

      const [rows] = await connection.query<BuildRow[]>(
        `SELECT ${COLUMNS} FROM builds WHERE id = ?`,
        [result.insertId],
      );

      await connection.commit();

      return toBuild(rows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findById(buildId: string): Promise<Build | undefined> {
    const [rows] = await pool.query<BuildRow[]>(
      `SELECT ${COLUMNS} FROM builds WHERE build_id = ? LIMIT 1`,
      [buildId],
    );

    return rows[0] ? toBuild(rows[0]) : undefined;
  }

  /** FIFO: created_at ASC com id ASC como desempate (mesmo timestamp). */
  async findByStatus(status: BuildStatus): Promise<Build[]> {
    const [rows] = await pool.query<BuildRow[]>(
      `SELECT ${COLUMNS} FROM builds WHERE status = ? ORDER BY created_at ASC, id ASC`,
      [status],
    );

    return rows.map(toBuild);
  }

  async findBuilding(): Promise<Build | undefined> {
    const [rows] = await pool.query<BuildRow[]>(
      `SELECT ${COLUMNS} FROM builds WHERE status = 'BUILDING' ORDER BY created_at ASC, id ASC LIMIT 1`,
    );

    return rows[0] ? toBuild(rows[0]) : undefined;
  }

  /**
   * Reserva a próxima build da fila.
   *
   * Vem do módulo de fila original (`selecionarProximaMontagem`) e é o
   * que impede duas montagens simultâneas: dentro de UMA transação,
   * `FOR UPDATE` pergunta se já existe algo em execução e, se não,
   * `FOR UPDATE SKIP LOCKED` trava a linha mais antiga da fila. Duas
   * chamadas simultâneas não conseguem pegar a mesma build, e a segunda
   * encontra a fila travada e devolve `undefined`.
   */
  async claimNextBuild(): Promise<Build | undefined> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [building] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM builds WHERE status = 'BUILDING' LIMIT 1 FOR UPDATE`,
      );

      if (building.length > 0) {
        // Já existe uma build em execução: não libera outra.
        await connection.commit();
        return undefined;
      }

      const [rows] = await connection.query<BuildRow[]>(
        `SELECT ${COLUMNS} FROM builds
         WHERE status = 'WAITING'
         ORDER BY created_at ASC, id ASC
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );

      if (rows.length === 0) {
        // Fila vazia.
        await connection.commit();
        return undefined;
      }

      const next = rows[0];

      await connection.query(
        `UPDATE builds SET status = 'BUILDING', started_at = UTC_TIMESTAMP() WHERE id = ?`,
        [next.id],
      );

      const [updated] = await connection.query<BuildRow[]>(
        `SELECT ${COLUMNS} FROM builds WHERE id = ?`,
        [next.id],
      );

      await connection.commit();

      return toBuild(updated[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Transição condicional de status.
   *
   * O `WHERE status IN (...)` faz o papel de compare-and-swap: se a build
   * não estiver no estado esperado, `affectedRows` é 0 e nada muda.
   * `started_at`/`finished_at` são gravados na mesma hora da transição,
   * preservando o que o módulo de fila original chamava de
   * `iniciado_em`/`finalizado_em`.
   */
  async updateStatus(
    buildId: string,
    from: readonly BuildStatus[],
    to: BuildStatus,
  ): Promise<Build | undefined> {
    if (from.length === 0) {
      return undefined;
    }

    const timestampColumn =
      to === "BUILDING"
        ? "started_at = UTC_TIMESTAMP()"
        : to === "COMPLETED" || to === "ERROR"
          ? "finished_at = UTC_TIMESTAMP()"
          : "started_at = NULL";

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE builds
       SET status = ?, ${timestampColumn}
       WHERE build_id = ? AND status IN (${placeholders(from)})`,
      [to, buildId, ...from],
    );

    if (result.affectedRows === 0) {
      return undefined;
    }

    return this.findById(buildId);
  }

  async countByStatus(): Promise<Record<BuildStatus, number>> {
    const counts = Object.fromEntries(
      BUILD_STATUSES.map((status) => [status, 0]),
    ) as Record<BuildStatus, number>;

    const [rows] = await pool.query<
      (RowDataPacket & { status: BuildStatus; total: number })[]
    >(`SELECT status, COUNT(*) AS total FROM builds GROUP BY status`);

    for (const row of rows) {
      counts[row.status] = Number(row.total);
    }

    return counts;
  }

  /**
   * Posição do visitante na fila (1 = próxima a ser montada).
   *
   * Mesma conta do módulo de fila original (`posicaoNaFila`): quantas
   * builds `WAITING` foram criadas antes desta. Quem não está mais na
   * fila devolve 0.
   *
   * A comparação acontece em SQL, com o `created_at` cru do banco — as
   * datas em ISO do domínio servem para a API, mas não servem para
   * comparar com um DATETIME.
   */
  async positionInQueue(buildId: string): Promise<number | undefined> {
    const [rows] = await pool.query<BuildRow[]>(
      `SELECT ${COLUMNS} FROM builds WHERE build_id = ? LIMIT 1`,
      [buildId],
    );

    const build = rows[0];

    if (!build) {
      return undefined;
    }

    if (build.status !== "WAITING") {
      return 0;
    }

    const [counts] = await pool.query<
      (RowDataPacket & { posicao: number })[]
    >(
      `SELECT COUNT(*) AS posicao
       FROM builds
       WHERE status = 'WAITING'
         AND (created_at < ? OR (created_at = ? AND id <= ?))`,
      [build.created_at, build.created_at, build.id],
    );

    return Number(counts[0]?.posicao ?? 0);
  }

  async close(): Promise<void> {
    await closeDatabase();
  }
}
