# Sinal Aberto – O Controlador de Trânsito

Jogo educativo de lógica de programação para celular, feito para o concurso Framework Arcade.
Você programa os semáforos de um cruzamento tocando em blocos, solta o trânsito e vê os carros
fluírem ou baterem, em 3D, em primeira pessoa, como o guarda de trânsito da esquina. São 8 fases, cada uma
com um conceito: sequência, `if`, `if/else` com OU, variáveis, leitura e conserto de um código JavaScript de
verdade, escalabilidade (horário de pico), condições adversas (chuva) e otimização (menos blocos). Quanto mais
difícil a fase, mais tarde fica na cidade: dia, fim de tarde, chuva e noite.

O documento de design completo está em [`docs/gdd.md`](docs/gdd.md).

## Como jogar

1. Toque em **Jogar** e escolha a fase (as fases se liberam em ordem).
2. Leia a dica e toque nos blocos para montar o seu algoritmo, linha por linha.
3. Toque em **▶ INICIAR TRÁFEGO**. O algoritmo repete sem parar enquanto a fase dura.
4. Se der batida, a linha com problema fica vermelha e o jogo diz o que fazer. Corrija e tente de novo.
5. Use **🔍 PASSO A PASSO** para ver uma linha de cada vez e **{ } Ver em JavaScript** para ver o seu algoritmo como código.
6. Cumpra os objetivos para ganhar até 3 estrelas (3 estrelas = usar até o número ideal de linhas).

Na fase 5, o controlador já vem escrito em JavaScript com um erro: toque nas partes destacadas para trocá-las até o trânsito fluir.

Na vista 3D, arraste o dedo (ou use as setas) para olhar em volta e toque em **Vista de cima** (ou tecle V) para ver o
cruzamento inteiro. Em aparelhos sem placa de vídeo ou lentos demais, o jogo usa a vista 2D automaticamente.

### Offline

- **Pelo `build.zip`:** baixe o `build.zip` da release, extraia e abra o `index.html` com dois cliques. Tudo (jogo, Phaser,
  estilos e fases) está dentro desse único arquivo; não precisa de internet nem de servidor.
- **Pelo site:** depois do primeiro acesso, um Service Worker guarda a versão que você abriu, e ela volta a abrir sem internet.
  Ele cuida só da pasta da própria release (`/hml/` ou `/releases/<sha>/`), sempre tenta a rede primeiro (para pegar
  atualizações) e nunca guarda o carregador da raiz nem o `rollout.json`, então o canário e o rollback continuam funcionando.

## Como rodar o projeto

Requisitos: Node.js 22 ou mais novo.

```bash
npm ci            # instala as dependências
npm run dev       # servidor de desenvolvimento (http://localhost:5173)
npm run build     # valida as fases e gera dist/index.html + dist/version.json
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor local com recarga automática |
| `npm run build` | Roda os testes de integração das fases (`prebuild`) e gera o build em arquivo único, o `version.json` e o `sw.js` |
| `npm test` | Testes de unidade e integração (Vitest) |
| `npm run test:ci` | Testes com cobertura (mínimo 70% em `src/core/`) e relatório JUnit |
| `npm run test:e2e` | Testes ponta a ponta (Playwright). Use `BASE_URL` para apontar para outro endereço |
| `npm run lint` | ESLint |
| `npm run gdd:pdf` | Gera `docs/GDD.pdf` a partir do `docs/gdd.md` (requer Pandoc) |

Exemplo de E2E contra um build local:

```bash
npm run build && npx vite preview --port 4173
BASE_URL=http://localhost:4173/ npm run test:e2e
```

Para os testes, `?teste=1` na URL expõe `window.__sinalAberto` (tela, fase, status, colisões) e `&vel=N`
acelera a simulação. Sem esse parâmetro nada disso existe.

Outros parâmetros úteis na URL:

| Parâmetro | O que faz |
| --- | --- |
| `?modo2d=1` | Usa só a vista 2D |
| `?3d=sempre` | Mantém o 3D mesmo sem placa de vídeo ou com FPS baixo (para testes e prints) |
| `?ambiente=noite` | Troca o visual 3D de qualquer fase: `dia`, `entardecer`, `chuva` ou `noite` |

## Stack e arquitetura

- **Phaser 3 + Three.js + TypeScript + Vite**, com `vite-plugin-singlefile` (build em um único `index.html`) e caminhos relativos (`base: './'`), porque o jogo roda em `/hml/` e em `/releases/<sha>/` no GitHub Pages.
- **`src/core/`**: lógica pura, sem Phaser e sem DOM, toda testada:
  - `ast.ts` (tipos), `programa.ts` (linhas da Mesa para AST), `interpretador.ts` (executa a AST, sem `eval`);
  - `simulacao.ts` (trânsito determinístico), `rng.ts` (aleatório com semente), `objetivos.ts` (vitória e estrelas);
  - `gerarJs.ts` (AST para JavaScript), `fases.ts` (carrega e valida `fases.json`).
- **`src/scenes/`**: cenas do Phaser (Boot, Menu, Seleção de fases, Cruzamento, Fim de fase). Elas só desenham o estado que o core calcula.
- **`src/scenes/vista3d/`**: o cruzamento em 3D (Three.js), que lê o mesmo estado da simulação:
  - `Vista3D.ts` (câmeras, placares, semáforos e carros), `cidade.ts` e `geometrias.ts` (cenário), `texturas.ts` (texturas desenhadas em canvas);
  - `veiculos.ts` (sedã, hatch, SUV, furgão e moto instanciados), `pedestres.ts`, `chuva3d.ts` e `ambiente.ts` (dia, fim de tarde, chuva e noite por fase);
  - `detectorWebGL.ts` (detecção de WebGL e de desenho por software, monitor de FPS e modo econômico).
- **`src/ui/`**: Mesa de Programação e telas em HTML (acessível, tocável e com `data-testid` para o Playwright).
- **`src/content/fases.json`** + **`fases.schema.json`**: as 8 fases, validadas com Ajv. Um JSON inválido quebra os testes e o build.
- **`src/sw/`**: Service Worker (regras puras em `regras.ts`, testadas), compilado com esbuild para `dist/sw.js`.
- Arte 2D e 3D desenhada em código (modelos, texturas e céu) e sons sintetizados com Web Audio: nenhum asset de terceiros.

## Tamanho do build

| Arquivo | Tamanho |
| --- | --- |
| `dist/index.html` (tudo embutido) | cerca de 2,2 MB (cerca de 540 kB com gzip) |
| `dist/sw.js` | cerca de 1,3 kB |

O GDD original falava em menos de 1 MB, mas só o Phaser já ocupa cerca de 1,2 MB, e o Three.js soma mais uns 0,5 MB. O build continua bem abaixo do
limite de 5 MB (e o `build.zip`, do limite de 25 MB).

## O que o jogo guarda no navegador (LGPD)

O jogo não tem login, não usa servidor e não coleta nenhum dado pessoal. No `localStorage` do próprio navegador ficam só:

| Chave | Conteúdo |
| --- | --- |
| `sinalAberto.progresso.v1` | Melhor número de estrelas por fase, por exemplo `{"estrelas":{"1":3}}` |
| `sinalAberto.som.v1` | Se o som está ligado ou desligado |
| `jogo_versao` | Gravada pelo carregador da raiz do site: qual versão (SHA) foi sorteada para você no canário |

No site publicado, o Service Worker também guarda no Cache Storage do navegador uma cópia dos arquivos do jogo
(`index.html` e `version.json`) para abrir sem internet. Não há dados pessoais nisso.

Se o navegador bloquear o armazenamento (aba anônima, por exemplo), o jogo funciona normalmente, só não lembra o progresso.
Para apagar tudo, basta limpar os dados do site no navegador.

## Equipe, IA e licenças

- Equipe: [`SQUAD.md`](SQUAD.md)
- Uso de IA: [`AI-USAGE.md`](AI-USAGE.md)
- Componentes de terceiros: [`THIRD_PARTY.md`](THIRD_PARTY.md)
- Licença do projeto: [`LICENSE`](LICENSE)
