// Desenha o cruzamento visto de cima e os carros, lendo o estado da Simulacao.
// Não decide regra nenhuma: só mostra o que o core calculou.
// Toda a arte é feita com formas geométricas (sem imagens de terceiros).

import Phaser from 'phaser';
import { sirene } from '../audio';
import type { Via } from '../core/ast';
import { VIAS } from '../core/ast';
import type { Carro, Simulacao } from '../core/simulacao';

export const LARGURA = 400;
export const ALTURA = 320;
const CX = 170;
const CY = 200;
const MEIO = 26; // metade da largura da pista
const ESPACO = 34; // distância entre carros na fila
const COMPRIMENTO = 30;
const LARGURA_CARRO = 22;

const CORES_CARRO = [0xef5350, 0x42a5f5, 0xffca28, 0x66bb6a, 0xab47bc, 0xff7043, 0x26c6da, 0x8d6e63];

export const ESTILO_TEXTO: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  fontSize: '13px',
  color: '#ffffff',
  fontStyle: 'bold',
  resolution: 2,
};

interface VisualCarro {
  objeto: Phaser.GameObjects.Container;
  via: Via;
  luz?: Phaser.GameObjects.Rectangle;
}

/** Posição (centro) de um carro na fila ou atravessando. */
/** Distância da frente do carro parado até a borda do cruzamento (antes da faixa). */
const RECUO = 23;
/** Quanto o carro anda enquanto atravessa: da linha de retenção até sair do outro lado. */
const TRAVESSIA = 2 * MEIO + COMPRIMENTO + 2 * RECUO;

function posicao(c: Carro, indiceFila: number): { x: number; y: number } {
  if (c.via === 'Norte') {
    const parado = CY - MEIO - RECUO - COMPRIMENTO / 2;
    const y = c.estado === 'cruzando' ? parado + c.progresso * TRAVESSIA : parado - indiceFila * ESPACO;
    return { x: CX, y };
  }
  const parado = CX + MEIO + RECUO + COMPRIMENTO / 2;
  const x = c.estado === 'cruzando' ? parado - c.progresso * TRAVESSIA : parado + indiceFila * ESPACO;
  return { x, y: CY };
}

function pontoDeEntrada(via: Via): { x: number; y: number } {
  return via === 'Norte' ? { x: CX, y: -COMPRIMENTO } : { x: LARGURA + COMPRIMENTO, y: CY };
}

export class VistaCruzamento {
  private sim: Simulacao | null = null;
  private readonly carros = new Map<number, VisualCarro>();
  private readonly sinais: Record<Via, { fundo: Phaser.GameObjects.Rectangle; texto: Phaser.GameObjects.Text }>;
  private readonly painel: Phaser.GameObjects.Text;
  private readonly painelFundo: Phaser.GameObjects.Rectangle;
  private readonly alerta: Phaser.GameObjects.Rectangle;
  private piscar = 0;
  private velocidade = 1;

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly opcoes: { painel: boolean; ambulancia: boolean } = { painel: true, ambulancia: false },
  ) {
    this.desenharCenario();
    this.alerta = cena.add.rectangle(CX, CY, 2 * MEIO + 8, 2 * MEIO + 8, 0xff1744, 0).setStrokeStyle(4, 0xff1744, 0);
    this.sinais = {
      Norte: this.criarSinal(CX - MEIO - 62, CY - MEIO - 22),
      Leste: this.criarSinal(CX + MEIO + 58, CY + MEIO + 20),
    };
    this.painelFundo = cena.add.rectangle(6, 6, 10, 10, 0x000000, 0.6).setOrigin(0, 0).setDepth(20);
    this.painel = cena.add.text(14, 12, '', { ...ESTILO_TEXTO, lineSpacing: 3 }).setDepth(21);
    this.painel.setVisible(opcoes.painel);
    this.painelFundo.setVisible(opcoes.painel);
  }

  definirSimulacao(sim: Simulacao): void {
    this.sim = sim;
    for (const v of this.carros.values()) v.objeto.destroy();
    this.carros.clear();
    this.alerta.setFillStyle(0xff1744, 0).setStrokeStyle(4, 0xff1744, 0);
    this.cena.tweens.killTweensOf(this.alerta);
    // Carros que já começam na fila aparecem no lugar, sem animação de chegada.
    this.sincronizar(1);
  }

  /** Chamar a cada frame. */
  atualizar(deltaMs: number, velocidade: number): void {
    if (!this.sim) return;
    this.piscar += deltaMs;
    this.velocidade = velocidade;
    const k = 1 - Math.exp((-deltaMs / 1000) * 9 * Math.max(1, velocidade));
    this.sincronizar(k);
    this.atualizarSinais();
    if (this.opcoes.painel) this.atualizarPainel();
  }

  /** Efeito visual da batida: cruzamento piscando em vermelho e tela tremendo. */
  mostrarBatida(): void {
    this.alerta.setFillStyle(0xff1744, 0.35).setStrokeStyle(4, 0xff1744, 1);
    this.cena.tweens.add({ targets: this.alerta, alpha: { from: 1, to: 0.3 }, yoyo: true, repeat: -1, duration: 300 });
    this.cena.cameras.main.shake(350, 0.012);
  }

  // ------------------------------------------------------------ interno

  private sincronizar(k: number): void {
    const sim = this.sim!;
    const vistos = new Set<number>();
    for (const via of VIAS) {
      sim.fila(via).forEach((c, i) => this.moverCarro(c, i, k, vistos));
    }
    for (const c of sim.carros()) if (c.estado === 'cruzando') this.moverCarro(c, 0, k, vistos);

    for (const [id, v] of this.carros) {
      if (vistos.has(id)) continue;
      // Saiu do cruzamento: segue reto até sumir da tela.
      this.carros.delete(id);
      const destino = v.via === 'Norte' ? { y: ALTURA + COMPRIMENTO } : { x: -COMPRIMENTO };
      this.cena.tweens.add({
        targets: v.objeto,
        ...destino,
        // Acompanha a velocidade da simulação, senão carros que já passaram parecem bater.
        duration: 600 / Math.max(1, this.velocidade),
        ease: 'Quad.easeIn',
        onComplete: () => v.objeto.destroy(),
      });
    }
  }

  private moverCarro(c: Carro, indice: number, k: number, vistos: Set<number>): void {
    vistos.add(c.id);
    const alvo = posicao(c, indice);
    let v = this.carros.get(c.id);
    if (!v) {
      const inicio = k >= 1 ? alvo : pontoDeEntrada(c.via);
      v = this.criarCarro(c, inicio.x, inicio.y);
      this.carros.set(c.id, v);
    }
    v.objeto.x += (alvo.x - v.objeto.x) * k;
    v.objeto.y += (alvo.y - v.objeto.y) * k;
    if (v.luz) {
      const fase = Math.floor(this.piscar / 220) % 2 === 0;
      v.luz.setFillStyle(fase ? 0xff1744 : 0x2979ff);
    }
  }

  private criarCarro(c: Carro, x: number, y: number): VisualCarro {
    const vertical = c.via === 'Norte';
    const w = vertical ? LARGURA_CARRO : COMPRIMENTO;
    const h = vertical ? COMPRIMENTO : LARGURA_CARRO;
    const g = this.cena.add.graphics();
    const cor = c.ambulancia ? 0xffffff : CORES_CARRO[c.id % CORES_CARRO.length];
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w, h, 6);
    g.fillStyle(cor, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    // Para-brisa na frente (Norte desce, Leste vai para a esquerda).
    g.fillStyle(0x1b2a33, 0.85);
    if (vertical) g.fillRoundedRect(-w / 2 + 3, h / 2 - 11, w - 6, 7, 2);
    else g.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, 7, h - 6, 2);
    const filhos: Phaser.GameObjects.GameObject[] = [g];
    let luz: Phaser.GameObjects.Rectangle | undefined;
    if (c.ambulancia) {
      sirene();
      g.fillStyle(0xe53935, 1);
      if (vertical) g.fillRect(-w / 2, -3, w, 6);
      else g.fillRect(-3, -h / 2, 6, h);
      g.lineStyle(1, 0x9e9e9e, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
      luz = this.cena.add.rectangle(0, 0, vertical ? 12 : 5, vertical ? 5 : 12, 0xff1744);
      filhos.push(luz);
    }
    const objeto = this.cena.add.container(x, y, filhos).setDepth(5);
    return { objeto, via: c.via, luz };
  }

  private criarSinal(x: number, y: number) {
    const fundo = this.cena.add.rectangle(x, y, 112, 26, 0xc62828).setStrokeStyle(2, 0xffffff, 0.9).setDepth(15);
    const texto = this.cena.add.text(x, y, '', { ...ESTILO_TEXTO, fontSize: '12px' }).setOrigin(0.5).setDepth(16);
    return { fundo, texto };
  }

  private atualizarSinais(): void {
    for (const via of VIAS) {
      const aberto = this.sim!.sinais[via].aberto;
      const s = this.sinais[via];
      s.fundo.setFillStyle(aberto ? 0x2e7d32 : 0xc62828);
      // Não depende só da cor: símbolo e palavra também mudam.
      s.texto.setText(`${via}: ${aberto ? '▲ ABERTO' : '■ FECHADO'}`);
    }
  }

  private atualizarPainel(): void {
    const sim = this.sim!;
    const n = (via: Via) => {
      const q = sim.fila(via).length;
      return `${via}: ${q} ${q === 1 ? 'carro' : 'carros'}`;
    };
    const linhas = [n('Norte'), n('Leste')];
    if (this.opcoes.ambulancia) {
      linhas.push(`Ambulância: ${sim.lerSensor('ambulanciaLeste') ? 'SIM' : 'não'}`);
    }
    for (const [nome, valor] of Object.entries(sim.variaveisDoJogador())) {
      linhas.push(`${nome} = ${typeof valor === 'number' ? Math.round(valor * 10) / 10 : valor}`);
    }
    linhas.push(`Tempo: ${Math.floor(sim.segundos)} / ${sim.duracaoTicks / 10} s`);
    const texto = linhas.join('\n');
    if (this.painel.text !== texto) {
      this.painel.setText(texto);
      this.painelFundo.setSize(this.painel.width + 16, this.painel.height + 12);
    }
  }

  private desenharCenario(): void {
    const g = this.cena.add.graphics().setDepth(0);
    // O cenário vai muito além do mundo 400 × 320: em telas com outra proporção a câmera
    // mostra a continuação da cidade (ruas, quarteirões, árvores) em vez de faixas vazias.
    // Meio mundo para cada lado basta para qualquer formato de tela (até ~2:1).
    const X0 = -LARGURA / 2;
    const Y0 = -ALTURA / 2;
    const X1 = LARGURA * 1.5;
    const Y1 = ALTURA * 1.5;

    // Grama
    g.fillStyle(0x3d6b45, 1).fillRect(X0, Y0, X1 - X0, Y1 - Y0);

    // Quarteirões extras ao redor (gerados sempre iguais), fora da área original
    const r = (n: number): number => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    let n = 1;
    // Poucas formas simples: o Phaser redesenha este gráfico a cada quadro.
    for (let bx = X0 + 16; bx < X1; bx += 130) {
      for (let by = Y0 + 16; by < Y1; by += 120) {
        n++;
        const w = 60 + r(n) * 40;
        const h = 50 + r(n + 0.5) * 35;
        const dentroDoMundo = bx + w > -10 && bx < LARGURA + 10 && by + h > -10 && by < ALTURA + 10;
        const naRua = (bx < CX + MEIO + 12 && bx + w > CX - MEIO - 12) || (by < CY + MEIO + 12 && by + h > CY - MEIO - 12);
        if (dentroDoMundo || naRua) continue;
        if (r(n + 0.25) < 0.3) {
          g.fillStyle(0x2e5535, 1).fillCircle(bx + w / 2, by + h / 2, 14);
          continue;
        }
        g.fillStyle(0x56606a, 1).fillRect(bx, by, w, h);
        g.fillStyle(0x6f7c86, 1).fillRect(bx + 8, by + 8, w * 0.35, h * 0.3);
      }
    }

    // Quarteirões e árvores originais (dentro do mundo)
    g.fillStyle(0x56606a, 1);
    g.fillRoundedRect(CX + MEIO + 14, 10, 70, 60, 6).fillRoundedRect(CX + MEIO + 96, 14, 96, 84, 6);
    g.fillRoundedRect(CX + MEIO + 14, CY + MEIO + 40, 64, ALTURA - CY - MEIO - 46, 6);
    g.fillRoundedRect(CX + MEIO + 92, CY + MEIO + 14, 108, ALTURA - CY - MEIO - 20, 6);
    g.fillStyle(0x6f7c86, 1);
    g.fillRect(CX + MEIO + 22, 18, 22, 16).fillRect(CX + MEIO + 106, 24, 30, 22).fillRect(CX + MEIO + 146, 56, 30, 22);
    g.fillStyle(0x2e5535, 1);
    for (const [x, y] of [
      [26, CY + MEIO + 30],
      [70, CY + MEIO + 70],
      [116, CY + MEIO + 34],
      [40, ALTURA - 20],
    ]) {
      g.fillCircle(x, y, 14);
    }

    // Pistas (até o fim do cenário estendido).
    g.fillStyle(0x3b3f45, 1);
    g.fillRect(CX - MEIO, Y0, 2 * MEIO, Y1 - Y0);
    g.fillRect(X0, CY - MEIO, X1 - X0, 2 * MEIO);
    // Calçadas.
    g.lineStyle(3, 0xb0b7bd, 1);
    g.strokeRect(CX - MEIO - 2, Y0, 2 * MEIO + 4, CY - MEIO + 2 - Y0);
    g.strokeRect(CX - MEIO - 2, CY + MEIO, 2 * MEIO + 4, Y1 - CY - MEIO);
    g.strokeRect(X0, CY - MEIO - 2, CX - MEIO + 2 - X0, 2 * MEIO + 4);
    g.strokeRect(CX + MEIO, CY - MEIO - 2, X1 - CX - MEIO, 2 * MEIO + 4);
    g.fillStyle(0x3b3f45, 1).fillRect(CX - MEIO, CY - MEIO, 2 * MEIO, 2 * MEIO);

    // Faixas de pedestre e linhas de retenção.
    g.fillStyle(0xeeeeee, 0.9);
    for (let i = 0; i < 5; i++) {
      g.fillRect(CX - MEIO + 4 + i * 10, CY - MEIO - 14, 6, 10);
      g.fillRect(CX + MEIO + 4, CY - MEIO + 4 + i * 10, 10, 6);
    }
    g.fillStyle(0xffffff, 1);
    g.fillRect(CX - MEIO, CY - MEIO - 20, 2 * MEIO, 3);
    g.fillRect(CX + MEIO + 18, CY - MEIO, 3, 2 * MEIO);

    // Setas mostrando o sentido de cada via.
    g.fillStyle(0xffffff, 0.35);
    g.fillTriangle(CX - 8, 30, CX + 8, 30, CX, 44);
    g.fillTriangle(LARGURA - 30, CY - 8, LARGURA - 30, CY + 8, LARGURA - 44, CY);
  }
}
