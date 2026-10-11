// Trânsito de enfeite para o menu e a seleção de fases: a solução da fase 1 rodando sem parar.

import type Phaser from 'phaser';
import { montarPrograma } from '../core/programa';
import { Simulacao, TICKS_POR_SEGUNDO } from '../core/simulacao';
import { contexto } from '../contexto';
import { ESTILO_TEXTO, LARGURA, VistaCruzamento } from './vistaCruzamento';

export class Demo {
  private readonly vista: VistaCruzamento;
  private sim!: Simulacao;
  private acumulado = 0;

  constructor(cena: Phaser.Scene, titulo: string, subtitulo: string) {
    this.vista = new VistaCruzamento(cena, { painel: false, ambulancia: false });
    this.reiniciar();
    cena.add.rectangle(LARGURA / 2, 44, LARGURA * 5, 74, 0x000000, 0.55).setDepth(30); // faixa vai de borda a borda em qualquer tela
    cena.add
      .text(LARGURA / 2, 34, titulo, { ...ESTILO_TEXTO, fontSize: '30px', color: '#ffd54f' })
      .setOrigin(0.5)
      .setDepth(31);
    cena.add.text(LARGURA / 2, 64, subtitulo, { ...ESTILO_TEXTO, fontSize: '14px' }).setOrigin(0.5).setDepth(31);
  }

  private reiniciar(): void {
    const fase = contexto().fases[0];
    this.sim = new Simulacao({ ...fase.transito, duracao: 120 }, montarPrograma(fase.solucao));
    this.vista.definirSimulacao(this.sim);
  }

  atualizar(deltaMs: number): void {
    this.acumulado += (deltaMs / 1000) * TICKS_POR_SEGUNDO;
    while (this.acumulado >= 1) {
      this.acumulado--;
      this.sim.avancar();
    }
    if (!this.sim.ativa) this.reiniciar();
    this.vista.atualizar(deltaMs, 1);
  }
}
