// Tela cheia e nítida para as cenas 2D (menu, seleção de fases, cruzamento 2D, fim de fase).
//
// O mundo 2D continua sendo desenhado em coordenadas de LARGURA × ALTURA (400 × 320).
// O canvas do Phaser, porém, passa a ter EXATAMENTE o tamanho do palco (vezes a densidade
// de pixels da tela, até 2×), e a câmera de cada cena dá o zoom que faz o mundo caber
// inteiro no centro. O cenário é desenhado além da borda do mundo (ver vistaCruzamento),
// então a sobra da tela mostra a continuação da cidade em vez de faixas vazias.
//
// Antes: imagem fixa de 400 × 320 ampliada pelo navegador (borrada) e com faixas escuras.

import Phaser from 'phaser';
import { ALTURA, LARGURA } from './vistaCruzamento';

/** Densidade máxima de pixels usada no canvas 2D (2× já fica nítido em celular). */
const DENSIDADE_MAX = 2;

function densidade(): number {
  return Math.min(DENSIDADE_MAX, Math.max(1, window.devicePixelRatio || 1));
}

/** Tamanho (em pixels reais) que o canvas deve ter para preencher o palco. */
export function tamanhoDoCanvas(palco: HTMLElement): { largura: number; altura: number } {
  const d = densidade();
  return {
    largura: Math.max(LARGURA, Math.round((palco.clientWidth || LARGURA) * d)),
    altura: Math.max(ALTURA, Math.round((palco.clientHeight || ALTURA) * d)),
  };
}

/** Zoom e centro da câmera: o mundo 400 × 320 inteiro visível, centralizado. */
export function ajustarCamera(cena: Phaser.Scene): void {
  const { width, height } = cena.scale.gameSize;
  const zoom = Math.min(width / LARGURA, height / ALTURA);
  const camera = cena.cameras.main;
  camera.setSize(width, height);
  camera.setZoom(zoom).centerOn(LARGURA / 2, ALTURA / 2);
}

/**
 * Liga o ajuste em todas as cenas (inclusive quando uma cena é reiniciada), acompanha o
 * tamanho do palco e faz todo texto do Phaser ser rasterizado na resolução da tela.
 */
export function ativarTelaCheia(jogo: Phaser.Game, palco: HTMLElement): void {
  const fabrica = Phaser.GameObjects.GameObjectFactory.prototype;
  const textoOriginal = fabrica.text;
  fabrica.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, texto, estilo) {
    // A resolução vem do tamanho ATUAL do canvas (e não da câmera, que só é ajustada
    // depois que a cena termina de criar os textos): o texto já nasce na resolução da tela.
    const { width, height } = this.scene.scale.gameSize;
    const zoom = Math.min(width / LARGURA, height / ALTURA);
    return textoOriginal.call(this, x, y, texto, { ...estilo, resolution: Math.min(6, Math.ceil(zoom) + 1) }); // +1: margem para telas com escala do Windows (125%, 150%)
  };

  for (const cena of jogo.scene.scenes) {
    cena.events.on(Phaser.Scenes.Events.CREATE, () => ajustarCamera(cena));
  }

  const redimensionar = (): void => {
    const { largura, altura } = tamanhoDoCanvas(palco);
    const atual = jogo.scale.gameSize;
    if (atual.width === largura && atual.height === altura) return;
    jogo.scale.setGameSize(largura, altura);
    // Recalcula o encaixe do canvas no palco (o Phaser só faz isso sozinho quando a janela muda).
    jogo.scale.refresh();
    for (const cena of jogo.scene.getScenes(true)) ajustarCamera(cena);
  };
  new ResizeObserver(redimensionar).observe(palco);
  redimensionar();
}
