// Nitidez das telas 2D (menu, seleção de fases, cruzamento 2D, fim de fase).
//
// O mundo 2D continua sendo desenhado em coordenadas de LARGURA × ALTURA (400 × 320),
// mas o canvas do Phaser passa a ter ESCALA vezes mais pixels e a câmera de cada cena
// dá um zoom de ESCALA. Antes, a imagem de 400 × 320 era ampliada pelo navegador para
// caber no palco (~1000 px de largura no computador) e ficava borrada.

import Phaser from 'phaser';
import { ALTURA, LARGURA } from './vistaCruzamento';

/** Quantas vezes mais pixels o canvas 2D tem. 3× cobre telas de computador e celulares. */
export const ESCALA = 3;

/** Configura o zoom da câmera de uma cena para o mundo 400 × 320 ocupar o canvas grande. */
export function ajustarCamera(cena: Phaser.Scene): void {
  cena.cameras.main.setZoom(ESCALA).centerOn(LARGURA / 2, ALTURA / 2);
}

/**
 * Liga o ajuste em todas as cenas (inclusive quando uma cena é reiniciada) e faz todo
 * texto do Phaser ser rasterizado na mesma resolução do canvas, para não ficar borrado.
 */
export function ativarNitidez(jogo: Phaser.Game): void {
  const fabrica = Phaser.GameObjects.GameObjectFactory.prototype;
  const textoOriginal = fabrica.text;
  fabrica.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, texto, estilo) {
    return textoOriginal.call(this, x, y, texto, { ...estilo, resolution: ESCALA });
  };
  for (const cena of jogo.scene.scenes) {
    cena.events.on(Phaser.Scenes.Events.CREATE, () => ajustarCamera(cena));
  }
}
