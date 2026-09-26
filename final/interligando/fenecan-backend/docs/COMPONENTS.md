# Componentes da build

Este documento é o contrato entre o **app mobile**, o **backend** e a
**Unity** sobre *o que é um componente*.

---

## O que é o ID de um componente

Cada campo da build (`cpu`, `gpu`, `ram`, `storage`, `motherboard`, `psu`,
`case`) carrega o **ID do componente** — o identificador que o app usou para
escolher a peça, e que a Unity usa para encontrar o objeto 3D correspondente.

```
app escolhe "ryzen-5-5600"
     ↓  POST /build
backend valida e guarda, sem mexer
     ↓  BUILD_START (WebSocket)
Unity recebe "ryzen-5-5600" e procura o modelo
```

A regra que importa: **o valor que o app enviou é o valor que a Unity recebe.**

## Regra de ouro: o ID não é normalizado

O backend **não** converte, não padroniza e não reescreve o ID do componente.

| O app envia     | A Unity recebe  | Comentário                          |
| --------------- | --------------- | ----------------------------------- |
| `ryzen-5-5600`  | `ryzen-5-5600`  | minúsculas, como veio               |
| `Ryzen-5-5600`  | `Ryzen-5-5600`  | maiúsculas, como veio               |
| `16gb`          | `16gb`          | idem                                |
| `16GB`          | `16GB`          | idem                                |
| `650w`          | `650w`          | idem                                |
| `b550`          | `b550`          | idem                                |
| ` mid-tower `   | `mid-tower`     | só o espaço nas pontas é removido (`trim`) |

O que o backend faz é bem pouco sobre o texto:

- remove espaço no começo e no fim (`trim`);
- recusa string vazia ou ausente;
- recusa valor que não seja texto;
- limita `visitante` a 100 caracteres.

Nada de `toLowerCase()`, slug, tradução ou "correção". **A normalização, se
algum dia existir, tem que ser uma decisão do app (que gera os IDs), não do
backend** — senão a Unity recebe um ID que ela não conhece e não acha o
componente na cena.

## Por que importa

Se o backend "limpasse" os valores, a Unity receberia `ryzen 5 5600` e
`16 gb` e não encontraria nenhum componente. A validação de existência dos
IDs pertence a quem conhece o catálogo: hoje é a Unity que resolve o ID para
o objeto 3D. O backend valida **formato**, não **catálogo**.

---

## Validação atual

O schema Zod (`src/schemas/build.schema.ts`) valida só o formato:

| Campo         | Regra                                  |
| ------------- | -------------------------------------- |
| `cpu`         | texto, não vazio                       |
| `gpu`         | texto, não vazio                       |
| `ram`         | texto, não vazio                       |
| `storage`     | texto, não vazio                       |
| `motherboard` | texto, não vazio                       |
| `psu`         | texto, não vazio                       |
| `case`        | texto, não vazio                       |
| `visitante`   | opcional, texto, até 100 caracteres    |

Não existe ainda:

- lista fechada de componentes válidos;
- checagem de compatibilidade (socket da CPU x motherboard, VRM, wattagem da
  fonte x consumo, tamanho da fonte x placa de vídeo);
- verificação de se o ID existe no catálogo.

Essas regras entram depois sem quebrar o contrato atual: o app continua
mandando os mesmos sete campos, e a Unity continua recebendo os mesmos IDs.

---

## Como os IDs são guardados

A tabela `builds` tem uma coluna por componente (`cpu`, `gpu`, `ram`,
`storage`, `motherboard`, `psu`, `case`), todas `VARCHAR(100)`, com o valor
exato enviado. A coluna `configuracao` (JSON) é apenas uma cópia derivada
dessas colunas, mantida por compatibilidade com o módulo de fila original —
nunca é editada direto, para não existir segunda fonte de verdade.

O tamanho 100 caracteres dá folga para IDs longos, sem permitir lixo.

---

## Papéis no fluxo

| Quem           | O que faz com os componentes                                  |
| -------------- | ------------------------------------------------------------- |
| App mobile     | escolhe, gera o ID, envia em `POST /build`                    |
| Backend (API)  | valida o formato, salva, não altera                           |
| Backend (fila) | escolhe **qual** build vai agora, não mex nos componentes     |
| Backend (WS)   | repassa a configuração da build vencedora para a Unity        |
| Unity          | resolve cada ID no seu catálogo e monta o PC                 |

Nenhuma etapa do backend conhece o catálogo de componentes. Isso é
intencional: deixa o backend válido para qualquer lista de peças que a Unity
entender.
