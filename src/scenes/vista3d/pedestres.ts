// Pedestres da vista 3D: gente passeando nas calçadas e gente atravessando nas faixas.
//
// Regra das faixas (igual à rua de verdade): quem atravessa a rua Norte–Sul só vai quando
// o sinal do Norte está fechado e não tem carro do Norte passando; o mesmo para a rua
// Leste–Oeste. Se o sinal abrir no meio da travessia, a pessoa apressa o passo.
// É só enfeite: a simulação (e a pontuação) não muda nada por causa deles.

import { CapsuleGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, type Object3D, SphereGeometry } from 'three';

import type { Via } from '../../core/ast';
import { POS_JOGADOR } from './cidade';

const MEIO = 1.3;
const Y_ASFALTO = 0.1;
const Y_CALCADA = 0.14;
/** Ponta de cada faixa de pedestre (na calçada, logo depois do meio-fio). */
const PONTA = 1.55;

/** Velocidades em unidades por segundo (1 unidade ≈ 4,4 m). */
const PASSO_NORMAL = 0.6;
const PASSO_PRESSA = 1.6;

const CAMISAS = [0xd32f2f, 0x1976d2, 0xfbc02d, 0x388e3c, 0xf5f5f5, 0x7b1fa2, 0xff7043, 0x455a64, 0x00897b, 0xec407a];
const CALCAS = [0x263238, 0x1a237e, 0x3e2723, 0x37474f, 0x5d4037, 0x212121];
const PELES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423];

interface Faixa {
  via: Via;
  /** A faixa fica num x fixo (atravessa ao longo de z) ou num z fixo (atravessa ao longo de x). */
  fixo: 'x' | 'z';
  valor: number;
}
// Faixas ao norte/sul cruzam a rua Norte–Sul; a leste/oeste cruzam a rua Leste–Oeste.
const FAIXAS: Faixa[] = [
  { via: 'Norte', fixo: 'z', valor: -(MEIO + 0.45) },
  { via: 'Norte', fixo: 'z', valor: MEIO + 0.45 },
  { via: 'Leste', fixo: 'x', valor: MEIO + 0.45 },
  { via: 'Leste', fixo: 'x', valor: -(MEIO + 0.45) },
];

interface Pessoa {
  x: number;
  z: number;
  dir: number;
  vel: number;
  passo: number;
  andando: boolean;
  // Passeio: vai e volta num trecho de calçada
  trecho?: { ax: number; az: number; bx: number; bz: number; indo: boolean };
  // Travessia: espera numa ponta da faixa e atravessa quando dá
  faixa?: { indice: number; lado: 1 | -1; desvio: number; recuo: number; atravessando: boolean; espera: number };
}

function rng(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ponto de uma ponta da faixa (lado = −1 ou +1), com desvio lateral e recuo do meio-fio. */
function pontaDaFaixa(f: Faixa, lado: number, desvio: number, recuo = 0): [number, number] {
  const ao = lado * (PONTA + recuo);
  return f.fixo === 'z' ? [ao, f.valor + desvio] : [f.valor + desvio, ao];
}

export class Pedestres {
  private readonly pessoas: Pessoa[] = [];
  private readonly pernas: InstancedMesh;
  private readonly bracos: InstancedMesh;
  private readonly troncos: InstancedMesh;
  private readonly cabecas: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly base = new Matrix4();
  private readonly tmp = new Matrix4();

  constructor(cena: Object3D) {
    const r = rng(99);
    // ── Gente passeando nas calçadas (longe da esquina do guarda)
    const trechos: [number, number, number, number][] = [];
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        trechos.push([s * 1.95, t * 3.6, s * 1.95, t * 26]);
        trechos.push([t * 3.6, s * 1.95, t * 26, s * 1.95]);
      }
    }
    trechos.forEach(([ax, az, bx, bz], i) => {
      for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++) {
        const t = r();
        this.pessoas.push({
          x: ax + (bx - ax) * t,
          z: az + (bz - az) * t,
          dir: 0,
          vel: 0.26 + r() * 0.12,
          passo: r() * 6,
          andando: true,
          trecho: { ax, az, bx, bz, indo: r() < 0.5 },
        });
      }
    });
    // ── Gente esperando para atravessar nas faixas da frente (norte e leste), as que o
    // guarda vê. As faixas da esquina dele ficam livres: alguém parado ali taparia a vista.
    FAIXAS.forEach((f, indice) => {
      const [px, pz] = pontaDaFaixa(f, -1, 0);
      const [qx, qz] = pontaDaFaixa(f, 1, 0);
      const pertoDoGuarda = Math.min(Math.hypot(px - POS_JOGADOR.x, pz - POS_JOGADOR.z), Math.hypot(qx - POS_JOGADOR.x, qz - POS_JOGADOR.z)) < 1.2;
      if (pertoDoGuarda) return;
      // A esquina nordeste é de duas faixas: lá fica uma pessoa só de cada uma
      const nordeste: 1 | -1 = f.fixo === 'z' ? 1 : -1;
      for (const lado of [-nordeste as 1 | -1, -nordeste as 1 | -1, nordeste]) {
        const desvio = (r() - 0.5) * 0.45;
        const recuo = r() * 0.25;
        const [x, z] = pontaDaFaixa(f, lado, desvio, recuo);
        this.pessoas.push({ x, z, dir: 0, vel: PASSO_NORMAL, passo: 0, andando: false, faixa: { indice, lado, desvio, recuo, atravessando: false, espera: 500 + r() * 2500 } });
      }
    });

    const n = this.pessoas.length;
    const mat = (): MeshLambertMaterial => new MeshLambertMaterial({ color: 0xffffff });
    // Pernas e braços com o "pivô" (quadril/ombro) na origem, pendurados para baixo
    this.pernas = new InstancedMesh(new CylinderGeometry(0.017, 0.014, 0.18, 6).translate(0, -0.09, 0), mat(), n * 2);
    this.bracos = new InstancedMesh(new CylinderGeometry(0.012, 0.011, 0.14, 5).translate(0, -0.07, 0), mat(), n * 2);
    this.troncos = new InstancedMesh(new CapsuleGeometry(0.042, 0.07, 3, 8), mat(), n);
    this.cabecas = new InstancedMesh(new SphereGeometry(0.034, 10, 8), mat(), n);
    // Ombros um pouco mais largos que o quadril
    this.troncos.geometry.scale(1.15, 1, 0.8);

    const c = new Color();
    this.pessoas.forEach((_, i) => {
      const camisa = CAMISAS[Math.floor(r() * CAMISAS.length)];
      const calca = CALCAS[Math.floor(r() * CALCAS.length)];
      this.troncos.setColorAt(i, c.setHex(camisa));
      this.bracos.setColorAt(i * 2, c.setHex(camisa));
      this.bracos.setColorAt(i * 2 + 1, c.setHex(camisa));
      this.pernas.setColorAt(i * 2, c.setHex(calca));
      this.pernas.setColorAt(i * 2 + 1, c.setHex(calca));
      this.cabecas.setColorAt(i, c.setHex(PELES[Math.floor(r() * PELES.length)]));
    });
    for (const malha of [this.pernas, this.bracos, this.troncos, this.cabecas]) {
      malha.castShadow = true;
      malha.frustumCulled = false;
      cena.add(malha);
    }
    // Olham para o outro lado da faixa enquanto esperam
    for (const p of this.pessoas) if (p.faixa) this.virarParaOutroLado(p);
    this.desenhar();
  }

  /**
   * Avança `dtMs` (já multiplicado pela velocidade do jogo).
   * `livre[via]`: dá para atravessar a rua daquela via agora (sinal fechado e sem carro passando).
   */
  atualizar(dtMs: number, livre: Record<Via, boolean>): void {
    const dt = Math.min(0.25, dtMs / 1000);
    for (const p of this.pessoas) {
      if (p.trecho) this.passear(p, dt);
      else if (p.faixa) this.atravessar(p, dt, livre);
    }
    this.desenhar();
  }

  private passear(p: Pessoa, dt: number): void {
    const t = p.trecho!;
    const [tx, tz] = t.indo ? [t.bx, t.bz] : [t.ax, t.az];
    if (this.andarAte(p, tx, tz, p.vel * dt)) t.indo = !t.indo;
  }

  private atravessar(p: Pessoa, dt: number, livre: Record<Via, boolean>): void {
    const f = p.faixa!;
    const faixa = FAIXAS[f.indice];
    if (!f.atravessando) {
      p.andando = false;
      f.espera -= dt * 1000;
      if (f.espera <= 0 && livre[faixa.via]) {
        f.atravessando = true;
        p.vel = PASSO_NORMAL;
      }
      return;
    }
    // Sinal abriu no meio da travessia: apressa o passo até a calçada
    if (!livre[faixa.via]) p.vel = PASSO_PRESSA;
    const [tx, tz] = pontaDaFaixa(faixa, -f.lado, f.desvio, f.recuo);
    if (this.andarAte(p, tx, tz, p.vel * dt)) {
      f.lado = -f.lado as 1 | -1;
      f.atravessando = false;
      f.espera = 1500 + Math.random() * 4500;
      this.virarParaOutroLado(p);
    }
  }

  /** Anda em linha reta até (tx, tz). Devolve true quando chega. */
  private andarAte(p: Pessoa, tx: number, tz: number, dist: number): boolean {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    p.andando = true;
    p.dir = Math.atan2(dx, dz);
    if (d <= dist) {
      p.x = tx;
      p.z = tz;
      p.andando = false;
      return true;
    }
    p.x += (dx / d) * dist;
    p.z += (dz / d) * dist;
    p.passo += dist * 26;
    return false;
  }

  private virarParaOutroLado(p: Pessoa): void {
    const f = p.faixa!;
    const [tx, tz] = pontaDaFaixa(FAIXAS[f.indice], -f.lado, f.desvio, f.recuo);
    p.dir = Math.atan2(tx - p.x, tz - p.z);
  }

  private desenhar(): void {
    const { m, base, tmp } = this;
    this.pessoas.forEach((p, i) => {
      // Na pista o chão é mais baixo que na calçada (degrau do meio-fio)
      const naPista = Math.abs(p.x) < MEIO || Math.abs(p.z) < MEIO;
      const balanco = p.andando ? Math.sin(p.passo) * 0.55 : 0;
      const sobe = p.andando ? Math.abs(Math.cos(p.passo)) * 0.008 : 0;
      base.makeRotationY(p.dir).setPosition(p.x, (naPista ? Y_ASFALTO : Y_CALCADA) + sobe, p.z);

      for (const lado of [0, 1]) {
        const sinal = lado === 0 ? 1 : -1;
        m.copy(base).multiply(tmp.makeTranslation(sinal * 0.024, 0.18, 0)).multiply(tmp.makeRotationX(balanco * sinal));
        this.pernas.setMatrixAt(i * 2 + lado, m);
        m.copy(base).multiply(tmp.makeTranslation(sinal * 0.058, 0.31, 0)).multiply(tmp.makeRotationX(-balanco * sinal * 0.8));
        this.bracos.setMatrixAt(i * 2 + lado, m);
      }
      m.copy(base).multiply(tmp.makeTranslation(0, 0.255, 0));
      this.troncos.setMatrixAt(i, m);
      m.copy(base).multiply(tmp.makeTranslation(0, 0.375, 0));
      this.cabecas.setMatrixAt(i, m);
    });
    for (const malha of [this.pernas, this.bracos, this.troncos, this.cabecas]) malha.instanceMatrix.needsUpdate = true;
  }
}
