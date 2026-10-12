// Detecta suporte a WebGL e monitora FPS para decidir entre renderização 3D e 2D.
// Nenhuma dependência de Phaser ou Three.js: pode ser importado antes de ambos.

export function suportaWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}

/**
 * Mede o FPS médio de uma janela de `janelaMs` ms, ignorando os primeiros `aquecimentoMs`
 * (nos primeiros instantes o aparelho ainda está preparando a cena e o FPS é sempre baixo).
 * No fim chama `aoMedir(fps)`; quem usa decide o que fazer com o valor.
 */
export class MonitorFPS {
  private frames = 0;
  private inicio = 0;
  private readonly criado = performance.now();
  private encerrado = false;
  private raf = 0;

  constructor(
    private readonly janelaMs: number,
    private readonly aoMedir: (fps: number) => void,
    private readonly aquecimentoMs = 1000,
  ) {
    this.raf = requestAnimationFrame(() => this.medir());
  }

  private medir(): void {
    if (this.encerrado) return;
    const agora = performance.now();
    if (agora - this.criado < this.aquecimentoMs) {
      this.raf = requestAnimationFrame(() => this.medir());
      return;
    }
    if (this.inicio === 0) this.inicio = agora;
    this.frames++;
    const decorrido = agora - this.inicio;
    if (decorrido >= this.janelaMs) {
      this.encerrar();
      this.aoMedir((this.frames / decorrido) * 1000);
      return;
    }
    this.raf = requestAnimationFrame(() => this.medir());
  }

  encerrar(): void {
    this.encerrado = true;
    cancelAnimationFrame(this.raf);
  }
}

/**
 * Qualidade do 3D escolhida nesta sessão do navegador. Assim o teste de FPS não se repete
 * a cada fase: se o aparelho não aguentou, as próximas fases já abrem do jeito certo
 * (em vez de abrir em 3D e trocar para 2D depois de alguns segundos, toda vez).
 */
export type Qualidade3D = 'normal' | 'economico' | 'desligado';
const CHAVE_QUALIDADE = 'sinalAberto.qualidade3d';
let qualidadeEmMemoria: Qualidade3D = 'normal';

export function qualidade3D(): Qualidade3D {
  try {
    const v = sessionStorage.getItem(CHAVE_QUALIDADE);
    if (v === 'economico' || v === 'desligado' || v === 'normal') return v;
  } catch {
    /* sem sessionStorage: usa a memória */
  }
  return qualidadeEmMemoria;
}

export function lembrarQualidade3D(q: Qualidade3D): void {
  qualidadeEmMemoria = q;
  try {
    sessionStorage.setItem(CHAVE_QUALIDADE, q);
  } catch {
    /* ignora */
  }
}
