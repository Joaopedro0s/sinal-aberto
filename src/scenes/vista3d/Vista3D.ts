// Vista3D: renderiza o cruzamento com Three.js lendo o estado da Simulacao.
// Não altera nada em src/core. Tem a mesma interface pública que VistaCruzamento
// para que CruzamentoScene possa trocar entre as duas sem mudar mais nada.
//
// Duas câmeras:
//  - "primeira": o jogador é o guarda de trânsito na calçada da esquina, na altura
//    dos olhos, vendo os carros chegarem, pararem e cruzarem na frente dele.
//    Dá para olhar em volta arrastando o dedo/mouse ou com as setas do teclado.
//  - "cima": a visão de drone que mostra o cruzamento inteiro (para planejar).
// Em qualquer uma, um placar em cada via mostra quantos carros estão esperando;
// se a via sair da tela, o placar gruda na borda com uma seta apontando para ela.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { Via } from '../../core/ast';
import { VIAS } from '../../core/ast';
import { sirene } from '../../audio';
import type { Carro, Simulacao } from '../../core/simulacao';
import { COR_HORIZONTE, POS_JOGADOR, criarCeu } from './cidade';
import {
  COR_LUZ,
  Y_ASFALTO,
  corDoCarro,
  criarCenario,
  criarMeshAmbulancia,
  criarSemaforo,
  gerarPecasCarro,
  type Semaforo,
} from './geometrias';

// ──────────────────────────────── constantes de layout (unidades 3D; carro ≈ 1 unidade)
const MEIO = 1.3;
/** Distância da linha de retenção ao centro do cruzamento */
const RECUO = 1.5;
/** Distância entre carros consecutivos na fila */
const ESPACO_FILA = 1.65; // carro tem 0,95 de comprimento: deixa ~0,7 de vão entre eles
/** Altura em que os carros andam (topo do asfalto). */
const Y_CARRO = Y_ASFALTO;
/** Altura da calçada (onde ficam os semáforos). */
const Y_CALCADA = 0.14;
/** De onde vem o sol: oeste, à tarde. As sombras dos carros caem de lado, à vista do guarda. */
const DIRECAO_SOL = { x: -10, y: 14, z: 5 };
/** De onde um carro novo "vem dirigindo" (atrás do fim da fila). */
const DISTANCIA_CHEGADA = 22;
/** Quanto tempo um carro que já cruzou continua visível seguindo em frente. */
const MS_SAINDO = 2500;
const VELOCIDADE_SAIDA = 3.2; // unidades por segundo

const MAX_CARROS = 48;
/** Metade do lado da área que precisa aparecer inteira na vista de cima. */
const RAIO_VISIVEL = 7;

/** Olhos do jogador: em pé num pequeno posto de guarda (~3 m), para enxergar as filas. */
const OLHOS = 0.85;
/** Direção inicial do olhar: para nordeste, entre as duas filas que chegam. */
const YAW_INICIAL = Math.atan2(2.6 - POS_JOGADOR.x, POS_JOGADOR.z + 2.6);
const PITCH_INICIAL = -0.15;
const LIMITE_YAW = 1.1; // ±63° a partir do olhar inicial
const LIMITE_PITCH = 0.35;

export type ModoVista = 'primeira' | 'cima';
const CHAVE_MODO = 'sinalAberto.vista3d';

function lerModo(): ModoVista {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'cima' ? 'cima' : 'primeira';
  } catch {
    return 'primeira';
  }
}
function salvarModo(m: ModoVista): void {
  try {
    localStorage.setItem(CHAVE_MODO, m);
  } catch {
    /* sem armazenamento: só não lembra a escolha */
  }
}

interface VisualCarro {
  id: number;
  via: Via;
  ambulancia: boolean;
  posAtual: Vector3;
  meshAmb: Object3D | null;
  instancia: number | null;
  parado: boolean;
  /** Preenchido quando o carro já saiu da simulação e está indo embora. */
  saindoDesde: number | null;
}

/** Direção em que os carros de cada via andam. */
const DIRECAO: Record<Via, Vector3> = {
  Norte: new Vector3(0, 0, 1), // vêm do norte (z negativo) e vão para o sul
  Leste: new Vector3(-1, 0, 0), // vêm do leste (x positivo) e vão para o oeste
};
/** Rotação do modelo para a frente do carro (+z no modelo) apontar para DIRECAO. */
const ROTACAO: Record<Via, number> = { Norte: 0, Leste: -Math.PI / 2 };

function posAlvo(c: Carro, indiceFila: number): Vector3 {
  const parada = MEIO + RECUO;
  const travessia = MEIO * 2 + RECUO * 2 + 1;
  const percorrido = c.estado === 'cruzando' ? c.progresso * travessia : -indiceFila * ESPACO_FILA;
  // Ponto de parada da via + deslocamento na direção em que ela anda
  const base = c.via === 'Norte' ? new Vector3(0, Y_CARRO, -parada) : new Vector3(parada, Y_CARRO, 0);
  return base.addScaledVector(DIRECAO[c.via], percorrido);
}

// ─────────────────────────────── classe principal
export class Vista3D {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private modo: ModoVista = lerModo();

  private sim: Simulacao | null = null;
  private readonly carros = new Map<number, VisualCarro>();
  private readonly instanciasLivres: number[] = [];
  private readonly matrizTmp = new Matrix4();
  private readonly escondido = new Matrix4().makeTranslation(999, -999, 999);

  /** Lataria (cor de cada carro) e lanternas (acendem ao frear). */
  private readonly corpos: InstancedMesh;
  private readonly lanternas: InstancedMesh;
  /** Todas as peças do carro (lataria, vidros, pneus, cromados, faróis, lanternas). */
  private readonly pecas: InstancedMesh[];
  private readonly corFreio = new Color(0xff2a1a);
  private readonly corLanterna = new Color(0x6a1010);
  private readonly sol: DirectionalLight;

  private readonly luzes: Record<Via, Semaforo['luzes']> = {} as Record<Via, Semaforo['luzes']>;
  private piscar = 0;
  private ultimoQuadro = performance.now();

  // Câmera
  private readonly camAlvoPos = new Vector3();
  private readonly camAlvoOlhar = new Vector3();
  private readonly camOlharAtual = new Vector3();
  private readonly camBaseCima = new Vector3(0, 10, 9);
  private yaw = YAW_INICIAL;
  private pitch = PITCH_INICIAL;
  private arrastando: { x: number; y: number } | null = null;
  private tremor = 0;

  // Interface sobreposta (placares e botão de vista)
  private readonly camada: HTMLDivElement;
  private readonly placares: Record<Via, HTMLDivElement> = {} as Record<Via, HTMLDivElement>;
  private readonly btnVista: HTMLButtonElement;
  private readonly contagem: Record<Via, number> = { Norte: 0, Leste: 0 };

  private quadro = 0;
  private destruida = false;
  /** Modo econômico ligado pelo monitor de FPS (resolução 1×, sem nevoeiro). */
  private economico = false;
  private observador: ResizeObserver | null = null;
  private readonly aoTeclar = (e: KeyboardEvent): void => this.teclado(e);

  constructor(private readonly elementoPai: HTMLElement) {
    // Celular: telas de alta densidade já ficam nítidas a 1,5× e quase não precisam de
    // antialiasing; isso reduz bastante o trabalho da placa de vídeo do aparelho.
    const telaPequena = Math.min(window.innerWidth, window.innerHeight) < 820;
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new WebGLRenderer({ antialias: !(telaPequena && dpr >= 2), alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(dpr, telaPequena ? 1.5 : 2));
    // Cores de cinema (ACES) e sombras suaves do sol. O modo econômico desliga as sombras.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('vista3d');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';

    this.scene = new Scene();
    this.scene.background = new Color(COR_HORIZONTE);
    this.scene.add(criarCeu(DIRECAO_SOL));
    // Reflexos: um "estúdio" gerado em código dá brilho à lataria, aos vidros e às vitrines.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.camera = new PerspectiveCamera(60, 1, 0.05, 260);

    // ── Iluminação: luz do céu (azulada por cima, cor do chão por baixo) + sol de tarde
    this.scene.add(new HemisphereLight(0xcfe4ff, 0x6e6552, 1.1));
    const sol = new DirectionalLight(0xffeccc, 2.6);
    sol.position.set(DIRECAO_SOL.x, DIRECAO_SOL.y, DIRECAO_SOL.z);
    sol.castShadow = true;
    sol.shadow.mapSize.set(telaPequena ? 1024 : 2048, telaPequena ? 1024 : 2048);
    const cs = sol.shadow.camera;
    cs.left = -15;
    cs.right = 15;
    cs.top = 15;
    cs.bottom = -15;
    cs.near = 1;
    cs.far = 45;
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.02;
    this.scene.add(sol, sol.target);
    this.sol = sol;

    this.scene.add(criarCenario());

    // ── Semáforos: os dois ficam na esquina em frente ao guarda (nordeste), cada um
    // junto da linha de parada da sua via — o da esquerda é o Norte, o da direita o Leste.
    const semN = criarSemaforo();
    semN.grupo.position.set(MEIO + 0.6, Y_CALCADA, -MEIO - RECUO - 0.1);
    semN.grupo.rotation.y = Math.PI;
    this.scene.add(semN.grupo);
    this.luzes.Norte = semN.luzes;

    const semL = criarSemaforo();
    semL.grupo.position.set(MEIO + RECUO + 0.1, Y_CALCADA, -MEIO - 0.6);
    semL.grupo.rotation.y = Math.PI / 2;
    this.scene.add(semL.grupo);
    this.luzes.Leste = semL.luzes;

    // ── Carros (instanciados): lataria, vidros, pneus, cromados, faróis e lanternas de freio
    const geo = gerarPecasCarro();
    this.corpos = new InstancedMesh(geo.pintura, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.45 }), MAX_CARROS);
    const vidros = new InstancedMesh(geo.vidro, new MeshStandardMaterial({ color: 0x0c131b, roughness: 0.05, metalness: 0.9 }), MAX_CARROS);
    const escuro = new InstancedMesh(geo.escuro, new MeshStandardMaterial({ color: 0x17181b, roughness: 0.8 }), MAX_CARROS);
    const cromado = new InstancedMesh(geo.cromado, new MeshStandardMaterial({ color: 0xd4d8dc, roughness: 0.25, metalness: 1 }), MAX_CARROS);
    const farois = new InstancedMesh(geo.farois, new MeshBasicMaterial({ color: 0xfff8e8 }), MAX_CARROS);
    this.lanternas = new InstancedMesh(geo.lanternas, new MeshBasicMaterial({ color: 0xffffff }), MAX_CARROS);
    this.pecas = [this.corpos, vidros, escuro, cromado, farois, this.lanternas];
    for (const malha of this.pecas) {
      for (let i = 0; i < MAX_CARROS; i++) malha.setMatrixAt(i, this.escondido);
      malha.frustumCulled = false; // as instâncias andam pela cena inteira
      this.scene.add(malha);
    }
    this.corpos.castShadow = vidros.castShadow = escuro.castShadow = true;
    for (let i = 0; i < MAX_CARROS; i++) this.lanternas.setColorAt(i, this.corLanterna);
    for (let i = MAX_CARROS - 1; i >= 0; i--) this.instanciasLivres.push(i);

    // ── Interface sobreposta
    this.camada = document.createElement('div');
    this.camada.className = 'vista3d-camada';
    for (const via of VIAS) {
      const p = document.createElement('div');
      p.className = 'placar-via';
      p.dataset.testid = `placar-${via.toLowerCase()}`;
      this.placares[via] = p;
      this.camada.appendChild(p);
    }
    this.btnVista = document.createElement('button');
    this.btnVista.type = 'button';
    this.btnVista.className = 'btn-vista';
    this.btnVista.dataset.testid = 'btn-vista';
    this.btnVista.addEventListener('click', () => this.alternarModo());
    this.camada.appendChild(this.btnVista);

    // ── Olhar em volta (primeira pessoa)
    this.canvas.addEventListener('pointerdown', (e) => {
      this.arrastando = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.arrastando || this.modo !== 'primeira') return;
      const escala = 2.2 / Math.max(200, this.canvas.clientWidth);
      this.olhar((e.clientX - this.arrastando.x) * escala, (e.clientY - this.arrastando.y) * escala);
      this.arrastando = { x: e.clientX, y: e.clientY };
    });
    const soltar = (): void => {
      this.arrastando = null;
    };
    this.canvas.addEventListener('pointerup', soltar);
    this.canvas.addEventListener('pointercancel', soltar);
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Cruzamento em 3D. Setas do teclado olham em volta; V troca a vista.');
    this.canvas.addEventListener('keydown', this.aoTeclar);

    this.aplicarModo(false);
    this.observador = new ResizeObserver(() => this.ajustarTamanho());
    this.observador.observe(elementoPai);

    elementoPai.appendChild(this.canvas);
    elementoPai.appendChild(this.camada);
    this.loop();
  }

  // ─────────────────────────── API pública (mesma do VistaCruzamento)

  definirSimulacao(sim: Simulacao): void {
    this.sim = sim;
    for (const v of this.carros.values()) this.liberar(v);
    this.carros.clear();
  }

  /** Chamado pelo CruzamentoScene a cada frame (mesmo delta em ms que o Phaser usa). */
  atualizar(deltaMs: number, velocidade: number): void {
    if (!this.sim) return;
    this.piscar += deltaMs;
    const k = 1 - Math.exp((-deltaMs / 1000) * 6 * Math.max(1, velocidade));
    this.sincronizarCarros(k, deltaMs * Math.max(1, velocidade));
    this.atualizarSemaforos();
  }

  mostrarBatida(): void {
    this.tremor = 1;
  }

  mostrarVitoria(): void {
    // Na vista de cima, aproxima um pouco; em primeira pessoa, olha para cima (comemoração).
    if (this.modo === 'cima') this.camAlvoPos.copy(this.camBaseCima).multiplyScalar(0.85);
    else this.pitch = Math.min(LIMITE_PITCH, this.pitch + 0.18);
  }

  /**
   * Modo econômico, usado quando o aparelho não aguenta: resolução 1× e sem nevoeiro.
   * O jogo continua em 3D; só fica um pouco menos nítido.
   */
  reduzirQualidade(): void {
    this.economico = true;
    this.renderer.setPixelRatio(1);
    this.ajustarTamanho();
    this.scene.fog = null;
    // Sem sombras: a cena passa a ser desenhada uma vez por quadro, e não duas.
    this.renderer.shadowMap.enabled = false;
    this.sol.castShadow = false;
    this.scene.traverse((o) => {
      const mat = (o as Mesh).material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => (x.needsUpdate = true));
      else if (mat) mat.needsUpdate = true;
    });
  }

  destruir(): void {
    this.destruida = true;
    if (this.quadro !== 0) cancelAnimationFrame(this.quadro);
    this.observador?.disconnect();
    this.observador = null;
    this.canvas.removeEventListener('keydown', this.aoTeclar);
    this.renderer.dispose();
    this.canvas.remove();
    this.camada.remove();
  }

  // ─────────────────────────── câmera e modos

  private alternarModo(): void {
    this.modo = this.modo === 'primeira' ? 'cima' : 'primeira';
    salvarModo(this.modo);
    this.aplicarModo(true);
  }

  private aplicarModo(suave: boolean): void {
    const primeira = this.modo === 'primeira';
    this.btnVista.textContent = primeira ? 'Vista de cima' : '1ª pessoa';
    this.btnVista.setAttribute('aria-label', primeira ? 'Trocar para a vista de cima' : 'Trocar para a vista em primeira pessoa');
    // Nevoeiro só em primeira pessoa: esconde o fim da cidade no horizonte.
    this.scene.fog = primeira && !this.economico ? new Fog(COR_HORIZONTE, 14, 70) : null;
    const predios = this.scene.getObjectByName('predios');
    if (predios) predios.scale.y = primeira ? 1 : 0.3;
    this.yaw = YAW_INICIAL;
    this.pitch = PITCH_INICIAL;
    this.ajustarTamanho();
    if (primeira) this.calcularOlhar();
    if (!suave) {
      this.camera.position.copy(this.camAlvoPos);
      this.camOlharAtual.copy(this.camAlvoOlhar);
    }
  }

  private calcularOlhar(): void {
    this.camAlvoOlhar.set(
      this.camAlvoPos.x + Math.sin(this.yaw) * Math.cos(this.pitch),
      this.camAlvoPos.y + Math.sin(this.pitch),
      this.camAlvoPos.z - Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  private olhar(dYaw: number, dPitch: number): void {
    this.yaw = Math.max(YAW_INICIAL - LIMITE_YAW, Math.min(YAW_INICIAL + LIMITE_YAW, this.yaw + dYaw));
    this.pitch = Math.max(-LIMITE_PITCH, Math.min(LIMITE_PITCH, this.pitch - dPitch));
  }

  private teclado(e: KeyboardEvent): void {
    const passo = 0.08;
    if (e.key === 'v' || e.key === 'V') this.alternarModo();
    else if (this.modo !== 'primeira') return;
    else if (e.key === 'ArrowLeft') this.olhar(-passo, 0);
    else if (e.key === 'ArrowRight') this.olhar(passo, 0);
    else if (e.key === 'ArrowUp') this.olhar(0, -passo);
    else if (e.key === 'ArrowDown') this.olhar(0, passo);
    else return;
    e.preventDefault();
  }

  private ajustarTamanho(): void {
    const w = this.elementoPai.clientWidth || 400;
    const h = this.elementoPai.clientHeight || 280;
    this.renderer.setSize(w, h, false);
    const aspecto = w / h;
    this.camera.aspect = aspecto;

    if (this.modo === 'primeira') {
      // Campo de visão horizontal de ~75° (as duas filas cabem), mas sem passar de 62° na
      // vertical: em telas altas isso evitaria mostrar só asfalto na metade de baixo.
      const vfov = (2 * Math.atan(Math.tan((75 * Math.PI) / 360) / aspecto) * 180) / Math.PI;
      this.camera.fov = Math.max(45, Math.min(62, vfov));
      this.camAlvoPos.set(POS_JOGADOR.x, OLHOS, POS_JOGADOR.z);
    } else {
      this.camera.fov = 30;
      const tanV = Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
      const tanH = tanV * aspecto;
      const dist = RAIO_VISIVEL / Math.min(tanV, tanH) / 1.487; // |(0, 1.1, 1)| ≈ 1.487
      this.camBaseCima.set(0, dist * 1.1, dist);
      this.camAlvoPos.copy(this.camBaseCima);
      this.camAlvoOlhar.set(0, 0, 0);
    }
    this.camera.updateProjectionMatrix();
  }

  private loop(): void {
    if (this.destruida) return;
    this.quadro = requestAnimationFrame(() => this.loop());
    const agora = performance.now();
    const dt = Math.min(100, agora - this.ultimoQuadro);
    this.ultimoQuadro = agora;
    const suav = 1 - Math.exp(-dt / 180);

    if (this.modo === 'primeira') this.calcularOlhar();
    this.camera.position.lerp(this.camAlvoPos, suav);
    this.camOlharAtual.lerp(this.camAlvoOlhar, Math.min(1, suav * 2));

    if (this.tremor > 0) {
      const a = this.tremor * (this.modo === 'primeira' ? 0.05 : 0.18);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a * 0.5;
      this.tremor = Math.max(0, this.tremor - dt / 400);
    }
    this.camera.lookAt(this.camOlharAtual);
    this.renderer.render(this.scene, this.camera);
    this.atualizarPlacares();
  }

  // ─────────────────────────── placares das filas

  private readonly tmpProj = new Vector3();

  private atualizarPlacares(): void {
    const w = this.elementoPai.clientWidth;
    const h = this.elementoPai.clientHeight;
    const margemY = 22;
    for (const via of VIAS) {
      const el = this.placares[via];
      const n = this.contagem[via];
      const aberto = this.sim?.sinais[via].aberto ?? false;
      // Ponto acima da fila (um pouco atrás da linha de retenção)
      const meio = MEIO + RECUO + ESPACO_FILA * 1.5;
      if (via === 'Norte') this.tmpProj.set(0, 0.9, -meio);
      else this.tmpProj.set(meio, 0.9, 0);
      this.tmpProj.project(this.camera);
      let x = ((this.tmpProj.x + 1) / 2) * w;
      let y = ((1 - this.tmpProj.y) / 2) * h;
      const atras = this.tmpProj.z > 1;
      if (atras) {
        x = w - x;
        y = h - margemY;
      }
      // O placar inteiro precisa caber na tela: a margem lateral é metade da largura dele.
      const margemX = el.offsetWidth / 2 + 6;
      let seta = '';
      if (atras || x < margemX || x > w - margemX || y < margemY || y > h - margemY) {
        if (x < margemX) seta = '◀ ';
        else if (x > w - margemX) seta = '▶ ';
        else seta = y < margemY ? '▲ ' : '▼ ';
        x = Math.max(margemX, Math.min(w - margemX, x));
        y = Math.max(margemY, Math.min(h - margemY, y));
      }
      const texto = `${seta}${via}: ${n} ${n === 1 ? 'carro' : 'carros'}`;
      if (el.textContent !== texto) el.textContent = texto;
      el.classList.toggle('aberto', aberto);
      el.classList.toggle('cheia', n >= 6);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
    }
  }

  // ─────────────────────────── carros

  private sincronizarCarros(k: number, dtSim: number): void {
    const sim = this.sim!;
    const vistos = new Set<number>();
    for (const via of VIAS) {
      const fila = sim.fila(via);
      this.contagem[via] = fila.length;
      fila.forEach((c, i) => this.moverCarro(c, i, k, vistos));
    }
    for (const c of sim.carros()) {
      if (c.estado === 'cruzando') this.moverCarro(c, 0, k, vistos);
    }

    // Quem saiu da simulação continua andando em frente por um tempo e depois some.
    for (const [id, v] of this.carros) {
      if (vistos.has(id)) continue;
      if (v.saindoDesde === null) v.saindoDesde = this.piscar;
      v.parado = false;
      v.posAtual.addScaledVector(DIRECAO[v.via], (VELOCIDADE_SAIDA * dtSim) / 1000);
      if (this.piscar - v.saindoDesde > MS_SAINDO) {
        this.liberar(v);
        this.carros.delete(id);
      } else {
        this.posicionar(v);
      }
    }
    // Só desenha até a última instância em uso (as livres ficariam escondidas, mas custam).
    let usadas = 0;
    for (const v of this.carros.values()) if (v.instancia !== null) usadas = Math.max(usadas, v.instancia + 1);
    for (const malha of this.pecas) {
      malha.count = usadas;
      malha.instanceMatrix.needsUpdate = true;
    }
    if (this.lanternas.instanceColor) this.lanternas.instanceColor.needsUpdate = true;
  }

  private moverCarro(c: Carro, indice: number, k: number, vistos: Set<number>): void {
    vistos.add(c.id);
    const alvo = posAlvo(c, indice);
    let v = this.carros.get(c.id);
    if (!v) {
      // Carro novo vem dirigindo de longe, em vez de surgir do nada na fila.
      const inicio = alvo.clone().addScaledVector(DIRECAO[c.via], -DISTANCIA_CHEGADA);
      v = this.criarVisualCarro(c, inicio);
      this.carros.set(c.id, v);
    }
    const antes = v.posAtual.clone();
    v.posAtual.lerp(alvo, c.estado === 'cruzando' ? Math.min(1, k * 2) : k * 0.5);
    v.parado = c.estado !== 'cruzando' && antes.distanceTo(v.posAtual) < 0.004;
    this.posicionar(v);
  }

  private posicionar(v: VisualCarro): void {
    if (v.meshAmb) {
      v.meshAmb.position.copy(v.posAtual);
      const luz = v.meshAmb.getObjectByName('luz') as THREE_Mesh | undefined;
      if (luz) {
        const fase = Math.floor(this.piscar / 220) % 2 === 0;
        (luz.material as MeshBasicMaterial).color.setHex(fase ? 0xff1744 : 0x2979ff);
      }
      return;
    }
    if (v.instancia === null) return;
    this.matrizTmp.makeRotationY(ROTACAO[v.via]).setPosition(v.posAtual);
    for (const malha of this.pecas) malha.setMatrixAt(v.instancia, this.matrizTmp);
    this.lanternas.setColorAt(v.instancia, v.parado ? this.corFreio : this.corLanterna);
  }

  private criarVisualCarro(c: Carro, posInicial: Vector3): VisualCarro {
    const base = { id: c.id, via: c.via, posAtual: posInicial, parado: false, saindoDesde: null };
    if (c.ambulancia) {
      sirene();
      const mesh = criarMeshAmbulancia(c.via === 'Norte');
      mesh.position.copy(posInicial);
      this.scene.add(mesh);
      return { ...base, ambulancia: true, meshAmb: mesh, instancia: null };
    }
    // Reaproveita instâncias de carros que já foram embora (antes o limite era 30 por fase).
    const idx = this.instanciasLivres.pop() ?? null;
    if (idx !== null) {
      this.corpos.setColorAt(idx, corDoCarro(c.id));
      if (this.corpos.instanceColor) this.corpos.instanceColor.needsUpdate = true;
    }
    return { ...base, ambulancia: false, meshAmb: null, instancia: idx };
  }

  private liberar(v: VisualCarro): void {
    if (v.meshAmb) {
      v.meshAmb.removeFromParent();
    } else if (v.instancia !== null) {
      for (const malha of this.pecas) {
        malha.setMatrixAt(v.instancia, this.escondido);
        malha.instanceMatrix.needsUpdate = true;
      }
      this.instanciasLivres.push(v.instancia);
      this.instanciasLivres.sort((x, y) => y - x); // o próximo carro pega a menor livre
    }
  }

  private atualizarSemaforos(): void {
    const sim = this.sim!;
    for (const via of VIAS) {
      const aberto = sim.sinais[via].aberto;
      const l = this.luzes[via];
      l.vermelho.color.setHex(aberto ? COR_LUZ.vermelho.apagada : COR_LUZ.vermelho.acesa);
      l.verde.color.setHex(aberto ? COR_LUZ.verde.acesa : COR_LUZ.verde.apagada);
    }
  }
}

type THREE_Mesh = import('three').Mesh;
