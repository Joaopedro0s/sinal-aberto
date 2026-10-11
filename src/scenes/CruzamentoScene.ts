// Cena da fase: liga a Mesa de Programação (DOM) à simulação (core) e à vista (Phaser ou Three.js).
// A cena só orquestra e desenha: quem decide batida, vitória e estrelas é o core.

import Phaser from 'phaser';
import type { Fase } from '../core/fases';
import { gerarJs } from '../core/gerarJs';
import { avaliarFase, descreverObjetivo } from '../core/objetivos';
import { ErroPrograma, montarPrograma, type Linha } from '../core/programa';
import { Simulacao, TICKS_POR_SEGUNDO } from '../core/simulacao';
import { contexto, trocarPainel } from '../contexto';
import { registrarEstrelas, salvarProgresso } from '../progresso';
import { publicarEstado } from '../testeHook';
import * as sons from '../audio';
import { abrirJanela, el } from '../ui/dom';
import { EditorCodigo } from '../ui/editorCodigo';
import { Mesa } from '../ui/mesa';
import type { AcoesPainel, EstadoPainel, PainelFase } from '../ui/painelFase';
import { Tutorial } from '../ui/tutorial';
import { VistaCruzamento } from './vistaCruzamento';
import { Vista3D } from './vista3d/Vista3D';
import { MonitorFPS } from './vista3d/detectorWebGL';

const VELOCIDADES = [1, 2, 4];
/** Limite de ticks por frame, para um celular lento não travar. */
const MAX_TICKS_POR_FRAME = 200;

export class CruzamentoScene extends Phaser.Scene {
  private fase!: Fase;
  private vista!: VistaCruzamento;        // renderizador 2D (sempre instanciado como fallback)
  private vista3D: Vista3D | null = null; // renderizador 3D (null quando fallback ativo)
  private monitorFPS: MonitorFPS | null = null;
  private mesa!: PainelFase;
  private sim!: Simulacao;
  private estado: EstadoPainel = 'editando';
  private acumulado = 0;
  private tutorial: Tutorial | null = null;

  constructor() {
    super('Cruzamento');
  }

  init(dados: { faseId: number }): void {
    this.fase = contexto().fases.find((f) => f.id === dados.faseId) ?? contexto().fases[0];
    this.estado = 'editando';
    this.acumulado = 0;
  }

  create(): void {
    const ctx = contexto();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    // 2D Phaser sempre criado como fallback / modo de tela inicial
    this.vista = new VistaCruzamento(this, {
      painel: true,
      ambulancia: (this.fase.transito.ambulancias?.length ?? 0) > 0,
    });

    if (ctx.modo3D) {
      this.ativar3D();
    }

    if (this.fase.transito.clima === 'chuva') {
      this.criarChuva();
    }

    this.novaSimulacao([]);

    const acoes: AcoesPainel = {
      iniciar: () => this.iniciar(),
      passo: () => this.passo(),
      reiniciar: () => this.reiniciar(),
      verJs: () => this.verJs(),
      velocidade: () => this.trocarVelocidade(),
      voltar: () => {
        this.desligar3D();
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SelecaoFases'));
      },
      editou: () => this.reiniciar(),
    };
    this.mesa =
      this.fase.tipo === 'codigo'
        ? new EditorCodigo(this.fase, acoes, ctx.velocidade)
        : new Mesa(this.fase, acoes, ctx.velocidade);
    trocarPainel(this.mesa.raiz);
    this.publicar();

    abrirJanela(`Fase ${this.fase.id}: ${this.fase.titulo}`, [el('p', { testid: 'dica' }, this.fase.dica)], {
      textoBotao: 'Começar',
      testidBotao: 'btn-comecar',
      testid: 'janela-dica',
      aoFechar: () => this.tentarTutorial(),
    });
  }

  private tentarTutorial(): void {
    const p = contexto().progresso;
    if (this.fase.id === 1 && !p.tutorialOmitido) {
      this.tutorial = new Tutorial([
        { texto: 'Olá! Eu sou o Sinaleiro. Vou te ensinar a controlar o trânsito!' },
        { texto: 'Sua missão é deixar todos os carros passarem sem bater.', alvo: 'gaveta' },
        { texto: 'Toque (ou arraste) o bloco verde abrirSinal("Norte") para colocá-lo no seu algoritmo.', alvo: 'algoritmo', gatilho: () => this.mesa.linhas.length > 0 },
        { texto: 'Agora toque em INICIAR TRÁFEGO para ver o que acontece!', alvo: 'btn-iniciar', gatilho: () => this.estado === 'rodando' },
        { texto: 'Muito bem! Você está no controle.', gatilho: () => !this.sim?.ativa }
      ], () => {
        p.tutorialOmitido = true;
        salvarProgresso(p);
        this.tutorial = null;
      });
    }
  }

  shutdown(): void {
    this.desligar3D();
    if (this.tutorial) {
      this.tutorial.concluir();
    }
  }

  private criarChuva(): void {
    const emissor = this.add.particles(0, -50, 'carro', {
      frame: [0], // usa frame existente só como forma branca pequena se colocar tint/alpha
      x: { min: 0, max: this.scale.width },
      y: { min: -50, max: -10 },
      lifespan: 1500,
      speedY: { min: 400, max: 600 },
      speedX: { min: -50, max: 50 },
      scaleY: { min: 4, max: 8 },
      scaleX: 0.1,
      alpha: { start: 0.4, end: 0 },
      quantity: 4,
      blendMode: 'ADD',
      tint: 0x88ccff
    });
    emissor.setDepth(100); // Acima de tudo do Phaser, mas o DOM do Phaser fica no z-index
  }

  update(_tempo: number, delta: number): void {
    const v = contexto().velocidade;
    if (this.estado === 'rodando' || this.estado === 'esperando') {
      this.acumulado += (delta / 1000) * TICKS_POR_SEGUNDO * v;
      let ticks = Math.min(Math.floor(this.acumulado), MAX_TICKS_POR_FRAME);
      this.acumulado = Math.min(this.acumulado - ticks, 1);
      while (ticks-- > 0 && this.sim.ativa) {
        if (this.estado === 'esperando' && this.sim.espera === 0) break;
        this.sim.avancar();
      }
      if (this.estado === 'rodando') this.mesa.destacarLinha(this.sim.ultimaLinha);
      if (!this.sim.ativa) {
        this.terminou();
      } else if (this.estado === 'esperando' && this.sim.espera === 0) {
        this.mudarEstado('passo');
      }
    }
    if (this.vista3D) this.vista3D.atualizar(delta, v);
    else this.vista.atualizar(delta, v);
  }

  // ------------------------------------------------------------ ações da Mesa

  private iniciar(): void {
    if (this.estado === 'passo' || this.estado === 'esperando') {
      this.sim.modoPasso = false;
      this.mudarEstado('rodando');
      return;
    }
    if (!this.prepararSimulacao()) return;
    this.mudarEstado('rodando');
  }

  private passo(): void {
    if (this.estado === 'rodando') {
      // Pausa: a partir daqui, uma linha por toque.
      this.sim.modoPasso = true;
      this.mudarEstado(this.sim.espera > 0 ? 'esperando' : 'passo');
      return;
    }
    if (this.estado === 'editando' || this.estado === 'acabou') {
      if (!this.prepararSimulacao()) return;
      this.sim.modoPasso = true;
      this.mudarEstado('passo');
      this.mesa.mostrarMensagem('info', 'Passo a passo: cada toque executa uma linha. A linha azul é a que acabou de rodar.');
    }
    if (this.sim.espera > 0) return;
    const linha = this.sim.executarLinha();
    this.mesa.destacarLinha(linha);
    if (!this.sim.ativa) this.terminou();
    else if (this.sim.espera > 0) this.mudarEstado('esperando');
  }

  private reiniciar(): void {
    this.novaSimulacao([]);
    this.mudarEstado('editando');
    this.mesa.destacarLinha(null);
    this.mesa.limparMensagem();
    this.mesa.marcarObjetivos(null);
  }

  private verJs(): void {
    let conteudo: HTMLElement;
    try {
      conteudo = el('pre', { classe: 'codigo', testid: 'codigo-js' }, gerarJs(montarPrograma(this.mesa.linhas)));
    } catch (e) {
      conteudo = el('p', {}, `Ainda não dá para mostrar: ${(e as Error).message}`);
    }
    abrirJanela(
      'Seu algoritmo em JavaScript',
      [
        el('p', {}, 'Os blocos que você montou viram este código. É JavaScript de verdade, a linguagem da web.'),
        conteudo,
      ],
      { testid: 'janela-js' },
    );
  }

  private trocarVelocidade(): void {
    const ctx = contexto();
    const i = VELOCIDADES.indexOf(ctx.velocidade);
    ctx.velocidade = VELOCIDADES[(i + 1) % VELOCIDADES.length];
    this.mesa.mostrarVelocidade(ctx.velocidade);
  }

  // ------------------------------------------------------------ interno

  private novaSimulacao(linhas: Linha[]): void {
    this.sim = new Simulacao(this.fase.transito, montarPrograma(linhas));
    this.acumulado = 0;
    this.vista.definirSimulacao(this.sim);
    if (this.vista3D) this.vista3D.definirSimulacao(this.sim);
  }

  /** Monta o programa da Mesa; se tiver erro de estrutura, avisa e aponta a linha. */
  private prepararSimulacao(): boolean {
    this.mesa.limparMensagem();
    this.mesa.marcarObjetivos(null);
    try {
      this.sim = new Simulacao(this.fase.transito, montarPrograma(this.mesa.linhas));
    } catch (e) {
      if (!(e instanceof ErroPrograma)) throw e;
      sons.erro();
      this.mesa.mostrarMensagem('erro', e.message);
      this.mesa.destacarLinha(e.linha, 'erro');
      return false;
    }
    this.acumulado = 0;
    this.vista.definirSimulacao(this.sim);
    if (this.vista3D) this.vista3D.definirSimulacao(this.sim);
    return true;
  }

  private mudarEstado(estado: EstadoPainel): void {
    this.estado = estado;
    this.mesa.definirEstado(estado);
    this.publicar();
  }

  private terminou(): void {
    this.mudarEstado('acabou');
    const sim = this.sim;
    if (sim.falha) {
      if (sim.falha.tipo === 'colisao') {
        if (this.vista3D) this.vista3D.mostrarBatida();
        else this.vista.mostrarBatida();
        sons.freio();
        sons.vibrar(250);
      } else {
        sons.erro();
      }
      this.mesa.destacarLinha(sim.falha.linha, 'erro');
      this.mesa.mostrarMensagem('erro', sim.falha.mensagem);
      this.publicar();
      return;
    }

    const resultado = avaliarFase(
      this.fase.objetivos,
      sim.status,
      sim.estatisticas(),
      this.mesa.linhas.length,
      this.fase.idealBlocos,
    );
    this.mesa.marcarObjetivos(resultado.objetivos);
    this.mesa.destacarLinha(null);

    if (resultado.venceu) {
      const ctx = contexto();
      ctx.progresso = registrarEstrelas(ctx.progresso, this.fase.id, resultado.estrelas);
      salvarProgresso(ctx.progresso);
      if (this.vista3D) this.vista3D.mostrarVitoria();
      sons.vitoria();
      sons.vibrar([50, 50, 50, 50, 50]);
      const dica =
        resultado.estrelas < 3 ? ` Dá para fazer com ${this.fase.idealBlocos} linhas e ganhar 3 estrelas.` : '';
      this.mesa.mostrarMensagem(
        'vitoria',
        `Trânsito fluindo! Você ganhou ${resultado.estrelas} de 3 estrelas.${dica}`,
        {
          texto: 'Continuar ➜',
          testid: 'btn-continuar',
          aoClicar: () => {
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () =>
              this.scene.start('FimFase', {
                faseId: this.fase.id,
                estrelas: resultado.estrelas,
                linhas: this.mesa.linhas,
              })
            );
          },
        },
      );
    } else {
      const faltou = resultado.objetivos
        .filter((o) => !o.cumprido)
        .map((o) => `${descreverObjetivo(o.objetivo)} (teve ${Math.round(o.valor * 10) / 10})`);
      sons.erro();
      const oQue = this.fase.tipo === 'codigo' ? 'o código' : 'o algoritmo';
      this.mesa.mostrarMensagem('erro', `Quase! Faltou: ${faltou.join('; ')}. Mude ${oQue} e tente de novo.`);
    }
    this.publicar();
  }

  private publicar(): void {
    publicarEstado({
      tela: 'cruzamento',
      fase: this.fase.id,
      status: this.estado === 'acabou' ? this.sim.status : this.estado,
      colisoes: this.sim.estatisticas().colisoes,
    });
  }

  private ativar3D(): void {
    const ctx = contexto();
    this.vista3D = new Vista3D(ctx.palco);
    // Torna o canvas do Phaser transparente e invisível à interação
    this.game.canvas.style.opacity = '0';
    this.game.canvas.style.pointerEvents = 'none';

    // Se cair para < 30 FPS nos primeiros 3 segundos, desliga o 3D e volta ao 2D.
    // `?3d=sempre` mantém o 3D mesmo assim (testes e prints em máquinas sem placa de vídeo).
    if (new URLSearchParams(location.search).get('3d') === 'sempre') return;
    this.monitorFPS = new MonitorFPS(3000, () => {
      console.warn('FPS muito baixo (< 30). Desligando 3D e usando fallback 2D para a cena.');
      this.desligar3D();
    });
  }

  private desligar3D(): void {
    if (this.monitorFPS) {
      this.monitorFPS.encerrar();
      this.monitorFPS = null;
    }
    if (this.vista3D) {
      this.vista3D.destruir();
      this.vista3D = null;
      // Volta o Phaser ao normal
      this.game.canvas.style.opacity = '1';
      this.game.canvas.style.pointerEvents = 'auto';
    }
  }
}
