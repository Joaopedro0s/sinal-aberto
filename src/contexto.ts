// Dados compartilhados entre as cenas (criados uma vez no main.ts).

import type { Fase } from './core/fases';
import type { Progresso } from './progresso';

export interface Contexto {
  fases: Fase[];
  progresso: Progresso;
  /** Parte de baixo da tela (DOM): menus e Mesa de Programação. */
  painel: HTMLElement;
  /** Parte de cima da tela (DOM): canvas do Phaser ou Three.js. */
  palco: HTMLElement;
  /** Texto da versão, lido do version.json. */
  versao: string;
  /** Velocidade da simulação (1, 2 ou 4; nos testes pode ser maior). */
  velocidade: number;
  modoTeste: boolean;
  /** true = usar renderizador Three.js 3D; false = Phaser 2D. */
  modo3D: boolean;
}

let atual: Contexto | null = null;

export function definirContexto(c: Contexto): void {
  atual = c;
}

export function contexto(): Contexto {
  if (!atual) throw new Error('Contexto do jogo ainda não foi criado.');
  return atual;
}

/** Troca o conteúdo do painel de baixo. */
export function trocarPainel(...filhos: Node[]): void {
  const { painel } = contexto();
  painel.replaceChildren(...filhos);
  painel.scrollTop = 0;
  // Na tela de título o painel vira uma camada por cima do cruzamento em tela cheia.
  const menu = filhos.some((f) => f instanceof HTMLElement && f.classList.contains('tela-menu'));
  painel.parentElement?.classList.toggle('modo-menu', menu);
}
