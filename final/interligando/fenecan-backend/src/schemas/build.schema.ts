import { z } from "zod";
import type { NewBuild, ValidationDetail } from "../types/build.js";

/** Campo obrigatório: string não vazia, com mensagem de erro em português. */
const requiredString = (field: string) =>
  z
    .string({ error: `${field} é obrigatório` })
    .trim()
    .min(1, `${field} não pode ser vazio`);

/**
 * Valida a configuração enviada pelo celular.
 *
 * Por enquanto apenas o formato é validado (todos os campos são strings).
 * A lista fechada de componentes e a checagem de compatibilidade
 * (socket, VRM, wattagem da fonte, etc.) entram em uma etapa posterior,
 * sem alterar este contrato.
 *
 * Os valores são preservados exatamente como chegaram, maiúsculas,
 * minúsculas e acentos incluídos: o ID do componente é o que a Unity
 * reconhece (`ryzen-5-5600`, `16gb`, `650w`...).
 */
export const buildSchema = z.object({
  cpu: requiredString("cpu"),
  gpu: requiredString("gpu"),
  ram: requiredString("ram"),
  storage: requiredString("storage"),
  motherboard: requiredString("motherboard"),
  psu: requiredString("psu"),
  case: requiredString("case"),
  /** Opcional: identificação do visitante, vinda do módulo de fila original. */
  visitante: z
    .string({ error: "visitante deve ser texto" })
    .trim()
    .min(1, "visitante não pode ser vazio")
    .max(100, "visitante deve ter no máximo 100 caracteres")
    .optional(),
});

/** Corpo aceito em `POST /build`, já validado. */
export type BuildRequest = z.infer<typeof buildSchema>;

/** Garante que a entrada validada satisfaz o contrato de `NewBuild`. */
export function toNewBuild(body: BuildRequest): NewBuild {
  return {
    cpu: body.cpu,
    gpu: body.gpu,
    ram: body.ram,
    storage: body.storage,
    motherboard: body.motherboard,
    psu: body.psu,
    case: body.case,
    visitante: body.visitante ?? null,
  };
}

/**
 * Converte os issues do Zod no formato de `details` da resposta de erro,
 * sem expor informações internas (stack traces, tipos do Zod, etc).
 */
export function toValidationDetails(error: z.ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));
}
