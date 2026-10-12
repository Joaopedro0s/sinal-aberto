# Componentes de Terceiros e Licenças

Todas as dependências deste projeto têm licenças permissivas e compatíveis (MIT, BSD, Apache 2.0).
A lista completa, com dependências indiretas, está no SBOM (`reports/sbom.json`) gerado pela esteira de CI.

## Incluídos no jogo publicado

| Componente | Versão | Licença | Uso |
| --- | --- | --- | --- |
| [Phaser](https://phaser.io) | 3.90.0 | MIT | Motor 2D: canvas, animações (tweens) e partículas |
| [Three.js](https://threejs.org) | 0.170.0 | MIT | Motor 3D: cruzamento em primeira pessoa. Inclui os complementos `RoomEnvironment` (reflexos), `RoundedBoxGeometry` e `BufferGeometryUtils`, que vêm no mesmo pacote e têm a mesma licença |
| eventemitter3 (dependência do Phaser) | 5.0.4 | MIT | Eventos internos do Phaser |
| [Ajv](https://ajv.js.org) | 8.x | MIT | Validação do `fases.json` pelo schema |
| fast-deep-equal, json-schema-traverse, require-from-string (dependências do Ajv) | — | MIT | Usadas internamente pelo Ajv |
| fast-uri (dependência do Ajv) | 3.x | BSD-3-Clause | Usada internamente pelo Ajv |

## Modelos 3D e texturas

Nenhum modelo, textura ou imagem de terceiros. Carros, prédios, lojas, árvores, postes, semáforos e placas
são montados em código (`src/scenes/vista3d/`), e as texturas (asfalto, calçada, grama, placas de rua e
letreiros) são desenhadas em canvas na hora (`src/scenes/vista3d/texturas.ts`). O visual se inspira em
simuladores de loja/cidade em 3D, mas nada foi copiado deles.

## Usados só no desenvolvimento e nos testes (não vão para o jogo)

| Componente | Licença |
| --- | --- |
| Vite | MIT |
| vite-plugin-singlefile | MIT |
| esbuild (compila o Service Worker) | MIT |
| TypeScript | Apache-2.0 |
| Vitest e @vitest/coverage-v8 | MIT |
| Playwright (@playwright/test) | Apache-2.0 |
| ESLint e @eslint/js | MIT |
| typescript-eslint e @typescript-eslint/eslint-plugin | MIT |
| @typescript-eslint/parser | BSD-2-Clause |
| @types/node | MIT |

## Arte, som e textos

- Toda a arte do jogo (pistas, carros, ambulância, semáforos, estrelas, partículas) é desenhada pelo próprio código com formas geométricas do Phaser Graphics. Não há imagens, fontes ou ícones de terceiros.
- Todos os sons são sintetizados em tempo real com a Web Audio API. Não há arquivos de áudio.
- O jogo não usa marcas, logos ou personagens existentes. Os textos e as fases foram escritos pela equipe (com apoio de IA, ver `AI-USAGE.md`).
