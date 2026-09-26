/**
 * Gera IDs para O.S. que chegam sem um ID proprio.
 *
 * Quem usa o gerador deve conferir no repositorio se o ID ja existe: um
 * gerador em memoria recomeca do zero quando o processo reinicia. Um banco
 * real pode fornecer sua propria implementacao (ex.: baseada em sequence).
 */
export interface OrderIdGenerator {
  next(): Promise<string>;
}
