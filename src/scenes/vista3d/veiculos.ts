// Frota da vista 3D: vários tipos de veículo (sedã, hatch, SUV, furgão e moto), todos
// gerados em código. Cada tipo tem as suas InstancedMesh (lataria, vidros, pneus,
// cromados, faróis e lanternas): poucos desenhos por quadro, mesmo com a rua cheia.
//
// A simulação não sabe nada disso: o tipo de cada carro é sorteado pelo id dele, sempre
// igual (o mesmo carro tem o mesmo modelo ao reiniciar a fase).

import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { em, fundir } from './geometrias';
import { texturaMancha } from './texturas';

export type TipoVeiculo = 'sedan' | 'hatch' | 'suv' | 'furgao' | 'moto';
const TIPOS: TipoVeiculo[] = ['sedan', 'hatch', 'suv', 'furgao', 'moto'];

/** Cores parecidas com as da frota real (muito branco, prata, preto e cinza). */
const CORES_CARRO = [0xf4f4f2, 0xb9bec4, 0x23262b, 0xb71c1c, 0x1d4e89, 0x6e737a, 0xf4f4f2, 0xd8c7a0, 0x2e6b3a, 0xb9bec4];
const CORES_FURGAO = [0xf6f6f4, 0xf6f6f4, 0xe7e9eb, 0xffcc00, 0x1d4e89];
const CORES_MOTO = [0xc62828, 0x111316, 0x1565c0, 0xf4f4f2, 0xff6f00];

/** Sorteio fixo pelo id: ~38% sedã, 24% hatch, 16% SUV, 12% furgão, 10% moto. */
export function tipoDoCarro(id: number): TipoVeiculo {
  const h = (Math.imul(id + 1, 2654435761) >>> 0) % 100;
  if (h < 38) return 'sedan';
  if (h < 62) return 'hatch';
  if (h < 78) return 'suv';
  if (h < 90) return 'furgao';
  return 'moto';
}

function corDoVeiculo(tipo: TipoVeiculo, id: number): Color {
  const lista = tipo === 'furgao' ? CORES_FURGAO : tipo === 'moto' ? CORES_MOTO : CORES_CARRO;
  return new Color(lista[(id * 7 + 3) % lista.length]);
}

interface Pecas {
  pintura: BufferGeometry;
  vidro: BufferGeometry;
  escuro: BufferGeometry;
  cromado: BufferGeometry;
  farois: BufferGeometry;
  lanternas: BufferGeometry;
  /** Até onde vai a frente do veículo (para o facho dos faróis à noite). */
  frente: number;
}

/** Cabine de vidro: o teto é mais estreito, e para-brisa e vigia são inclinados. */
function cabine(w: number, h: number, d: number, y: number, z: number, recuoFrente: number, recuoTras: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.86);
      p.setZ(i, p.getZ(i) > 0 ? p.getZ(i) - recuoFrente : p.getZ(i) + recuoTras);
    }
  }
  g.computeVertexNormals();
  return em(g, 0, y, z);
}

function rodas(x: number, zs: number[], r: number, larg = 0.075): { pneus: BufferGeometry[]; calotas: BufferGeometry[] } {
  const pneus: BufferGeometry[] = [];
  const calotas: BufferGeometry[] = [];
  for (const sx of [-x, x]) {
    for (const z of zs) {
      pneus.push(em(new CylinderGeometry(r, r, larg, 12), sx, r, z, Math.PI / 2));
      calotas.push(em(new CylinderGeometry(r * 0.57, r * 0.57, larg + 0.005, 8), sx, r, z, Math.PI / 2));
    }
  }
  return { pneus, calotas };
}

/** Faróis (+ placas) e lanternas de um carro de largura `w`, com frente/traseira em ±`z`. */
function luzes(w: number, z: number, y: number): { farois: BufferGeometry; lanternas: BufferGeometry } {
  const x = w / 2 - 0.085;
  return {
    farois: fundir([
      em(new BoxGeometry(0.11, 0.045, 0.012), -x, y, z),
      em(new BoxGeometry(0.11, 0.045, 0.012), x, y, z),
      em(new BoxGeometry(0.14, 0.04, 0.006), 0, 0.1, z + 0.022),
      em(new BoxGeometry(0.14, 0.04, 0.006), 0, 0.1, -z - 0.022),
    ]),
    lanternas: fundir([em(new BoxGeometry(0.12, 0.05, 0.012), -x, y + 0.005, -z), em(new BoxGeometry(0.12, 0.05, 0.012), x, y + 0.005, -z)]),
  };
}

function sedan(): Pecas {
  const r = rodas(0.245, [-0.31, 0.31], 0.088);
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.55, 0.165, 0.95, 2, 0.055), 0, 0.152, 0),
      em(new RoundedBoxGeometry(0.4, 0.035, 0.37, 2, 0.015), 0, 0.392, -0.056),
      em(new BoxGeometry(0.05, 0.035, 0.05), -0.29, 0.255, 0.13),
      em(new BoxGeometry(0.05, 0.035, 0.05), 0.29, 0.255, 0.13),
    ]),
    vidro: cabine(0.47, 0.15, 0.52, 0.305, -0.04, 0.09, 0.07),
    escuro: fundir([
      ...r.pneus,
      em(new BoxGeometry(0.565, 0.055, 0.06), 0, 0.1, 0.465),
      em(new BoxGeometry(0.565, 0.055, 0.06), 0, 0.1, -0.465),
      em(new BoxGeometry(0.26, 0.04, 0.012), 0, 0.17, 0.476),
    ]),
    cromado: fundir(r.calotas),
    ...luzes(0.55, 0.474, 0.175),
    frente: 0.48,
  };
}

function hatch(): Pecas {
  const r = rodas(0.24, [-0.27, 0.27], 0.085);
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.54, 0.17, 0.82, 2, 0.055), 0, 0.155, 0),
      em(new RoundedBoxGeometry(0.4, 0.035, 0.4, 2, 0.015), 0, 0.402, -0.09),
      em(new BoxGeometry(0.05, 0.035, 0.05), -0.285, 0.26, 0.12),
      em(new BoxGeometry(0.05, 0.035, 0.05), 0.285, 0.26, 0.12),
    ]),
    // Traseira quase reta (vigia em pé), típica de hatch
    vidro: cabine(0.46, 0.16, 0.56, 0.315, -0.09, 0.12, 0.02),
    escuro: fundir([
      ...r.pneus,
      em(new BoxGeometry(0.555, 0.055, 0.06), 0, 0.1, 0.4),
      em(new BoxGeometry(0.555, 0.055, 0.06), 0, 0.1, -0.4),
      em(new BoxGeometry(0.22, 0.04, 0.012), 0, 0.17, 0.411),
    ]),
    cromado: fundir(r.calotas),
    ...luzes(0.54, 0.41, 0.18),
    frente: 0.42,
  };
}

function suv(): Pecas {
  const r = rodas(0.26, [-0.33, 0.33], 0.1, 0.085);
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.59, 0.21, 1.0, 2, 0.06), 0, 0.2, 0),
      em(new RoundedBoxGeometry(0.46, 0.035, 0.55, 2, 0.015), 0, 0.485, -0.07),
      em(new BoxGeometry(0.05, 0.04, 0.05), -0.31, 0.33, 0.17),
      em(new BoxGeometry(0.05, 0.04, 0.05), 0.31, 0.33, 0.17),
    ]),
    vidro: cabine(0.52, 0.17, 0.68, 0.39, -0.06, 0.1, 0.03),
    escuro: fundir([
      ...r.pneus,
      // Para-choques, grade, molduras dos para-lamas e bagageiro no teto
      em(new BoxGeometry(0.6, 0.07, 0.07), 0, 0.12, 0.49),
      em(new BoxGeometry(0.6, 0.07, 0.07), 0, 0.12, -0.49),
      em(new BoxGeometry(0.3, 0.06, 0.012), 0, 0.23, 0.501),
      em(new BoxGeometry(0.03, 0.03, 0.5), -0.2, 0.515, -0.07),
      em(new BoxGeometry(0.03, 0.03, 0.5), 0.2, 0.515, -0.07),
      em(new BoxGeometry(0.61, 0.03, 0.9), 0, 0.105, 0),
    ]),
    cromado: fundir(r.calotas),
    ...luzes(0.59, 0.5, 0.235),
    frente: 0.52,
  };
}

function furgao(): Pecas {
  const r = rodas(0.26, [-0.4, 0.38], 0.1, 0.085);
  // Para-brisa inclinado na frente do baú
  const parabrisa = new BoxGeometry(0.52, 0.2, 0.02);
  parabrisa.rotateX(-0.45);
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.6, 0.5, 0.98, 2, 0.05), 0, 0.33, -0.1),
      em(new RoundedBoxGeometry(0.6, 0.22, 0.24, 2, 0.05), 0, 0.19, 0.48),
      em(new BoxGeometry(0.05, 0.05, 0.05), -0.32, 0.42, 0.36),
      em(new BoxGeometry(0.05, 0.05, 0.05), 0.32, 0.42, 0.36),
    ]),
    vidro: fundir([
      em(parabrisa, 0, 0.42, 0.42),
      // Janelas laterais da cabine
      em(new BoxGeometry(0.605, 0.13, 0.24), 0, 0.45, 0.27),
    ]),
    escuro: fundir([
      ...r.pneus,
      em(new BoxGeometry(0.61, 0.06, 0.06), 0, 0.11, 0.6),
      em(new BoxGeometry(0.61, 0.06, 0.06), 0, 0.11, -0.6),
      em(new BoxGeometry(0.3, 0.05, 0.012), 0, 0.2, 0.603),
      // Friso lateral e a porta de correr
      em(new BoxGeometry(0.605, 0.025, 0.95), 0, 0.17, -0.12),
      em(new BoxGeometry(0.605, 0.3, 0.008), 0, 0.33, -0.05),
    ]),
    cromado: fundir(r.calotas),
    ...luzes(0.6, 0.6, 0.22),
    frente: 0.62,
  };
}

function moto(): Pecas {
  const pneus = [em(new CylinderGeometry(0.075, 0.075, 0.04, 12), 0, 0.075, 0.2, Math.PI / 2), em(new CylinderGeometry(0.075, 0.075, 0.04, 12), 0, 0.075, -0.2, Math.PI / 2)];
  // Piloto inclinado para a frente, de jaqueta escura e capacete da cor da moto
  const tronco = new BoxGeometry(0.15, 0.17, 0.09);
  tronco.rotateX(0.35);
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.09, 0.08, 0.2, 2, 0.02), 0, 0.2, 0.07), // tanque
      em(new BoxGeometry(0.08, 0.05, 0.16), 0, 0.17, -0.14), // rabeta
      em(new SphereGeometry(0.052, 10, 8), 0, 0.47, 0.0), // capacete
    ]),
    vidro: fundir([em(new BoxGeometry(0.07, 0.028, 0.03), 0, 0.47, 0.04)]), // viseira
    escuro: fundir([
      ...pneus,
      em(new BoxGeometry(0.08, 0.035, 0.16), 0, 0.235, -0.07), // banco
      em(tronco, 0, 0.36, -0.04),
      // Pernas e braços
      em(new BoxGeometry(0.035, 0.035, 0.16), -0.06, 0.26, 0.02),
      em(new BoxGeometry(0.035, 0.035, 0.16), 0.06, 0.26, 0.02),
      em(new BoxGeometry(0.035, 0.12, 0.035), -0.06, 0.19, 0.09),
      em(new BoxGeometry(0.035, 0.12, 0.035), 0.06, 0.19, 0.09),
      em(new BoxGeometry(0.03, 0.03, 0.14), -0.09, 0.36, 0.1),
      em(new BoxGeometry(0.03, 0.03, 0.14), 0.09, 0.36, 0.1),
    ]),
    cromado: fundir([
      em(new BoxGeometry(0.2, 0.015, 0.015), 0, 0.33, 0.17), // guidão
      em(new CylinderGeometry(0.008, 0.008, 0.22, 6).rotateX(-0.35), 0, 0.2, 0.19), // garfo
      em(new CylinderGeometry(0.015, 0.015, 0.16, 6).rotateX(Math.PI / 2), 0.05, 0.1, -0.12), // escapamento
    ]),
    farois: fundir([em(new BoxGeometry(0.05, 0.04, 0.015), 0, 0.27, 0.215)]),
    lanternas: fundir([em(new BoxGeometry(0.05, 0.03, 0.012), 0, 0.2, -0.225)]),
    frente: 0.23,
  };
}

const GERADORES: Record<TipoVeiculo, () => Pecas> = { sedan, hatch, suv, furgao, moto };

interface Grupo {
  pecas: InstancedMesh[];
  pintura: InstancedMesh;
  lanternas: InstancedMesh;
  livres: number[];
  usadas: Set<number>;
}

/** Até quantos veículos de cada tipo podem estar na tela ao mesmo tempo. */
const MAX_POR_TIPO = 32;

export interface Vaga {
  tipo: TipoVeiculo;
  indice: number;
}

/** Gerencia as InstancedMesh de todos os tipos e as vagas (instâncias) livres. */
export class Frota {
  private readonly grupos = {} as Record<TipoVeiculo, Grupo>;
  private readonly escondido = new Matrix4().makeTranslation(999, -999, 999);
  private readonly corFreio = new Color(0xff2a1a);
  private readonly corLanterna = new Color(0x6a1010);
  private fachos = false;

  constructor(cena: Object3D) {
    const matPintura = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.45 });
    const matVidro = new MeshStandardMaterial({ color: 0x0c131b, roughness: 0.05, metalness: 0.9 });
    const matEscuro = new MeshLambertMaterial({ color: 0x17181b });
    const matCromado = new MeshStandardMaterial({ color: 0xd4d8dc, roughness: 0.25, metalness: 1 });
    const matFarol = new MeshBasicMaterial({ color: 0xfff8e8 });
    const matLanterna = new MeshBasicMaterial({ color: 0xffffff });
    // Facho dos faróis no chão (só aparece no fim de tarde, na chuva e à noite)
    const matFacho = new MeshBasicMaterial({ map: texturaMancha(), color: 0xfff1c8, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });

    for (const tipo of TIPOS) {
      const g = GERADORES[tipo]();
      const facho = new PlaneGeometry(tipo === 'moto' ? 0.45 : 0.85, 1.4);
      facho.rotateX(-Math.PI / 2);
      facho.translate(0, 0.006, g.frente + 0.75);
      const malhas = [
        new InstancedMesh(g.pintura, matPintura, MAX_POR_TIPO),
        new InstancedMesh(g.vidro, matVidro, MAX_POR_TIPO),
        new InstancedMesh(g.escuro, matEscuro, MAX_POR_TIPO),
        new InstancedMesh(g.cromado, matCromado, MAX_POR_TIPO),
        new InstancedMesh(g.farois, matFarol, MAX_POR_TIPO),
        new InstancedMesh(g.lanternas, matLanterna, MAX_POR_TIPO),
        new InstancedMesh(facho, matFacho, MAX_POR_TIPO),
      ];
      malhas.forEach((m, i) => {
        for (let k = 0; k < MAX_POR_TIPO; k++) m.setMatrixAt(k, this.escondido);
        m.frustumCulled = false; // as instâncias andam pela cena inteira
        m.castShadow = i <= 2;
        m.count = 0;
        m.visible = false;
        cena.add(m);
      });
      malhas[6].renderOrder = 1;
      for (let k = 0; k < MAX_POR_TIPO; k++) malhas[5].setColorAt(k, this.corLanterna);
      const livres: number[] = [];
      for (let k = MAX_POR_TIPO - 1; k >= 0; k--) livres.push(k);
      this.grupos[tipo] = { pecas: malhas, pintura: malhas[0], lanternas: malhas[5], livres, usadas: new Set() };
    }
  }

  /** Liga os fachos dos faróis no chão (fim de tarde, chuva e noite). */
  ligarFachos(ligar: boolean): void {
    this.fachos = ligar;
  }

  /** Reserva uma instância para o carro `id`. Devolve null se o tipo estiver lotado. */
  alocar(id: number): Vaga | null {
    const tipo = tipoDoCarro(id);
    const g = this.grupos[tipo];
    const indice = g.livres.pop();
    if (indice === undefined) return null;
    g.usadas.add(indice);
    g.pintura.setColorAt(indice, corDoVeiculo(tipo, id));
    if (g.pintura.instanceColor) g.pintura.instanceColor.needsUpdate = true;
    return { tipo, indice };
  }

  posicionar(v: Vaga, matriz: Matrix4, freando: boolean): void {
    const g = this.grupos[v.tipo];
    for (const m of g.pecas) m.setMatrixAt(v.indice, matriz);
    g.lanternas.setColorAt(v.indice, freando ? this.corFreio : this.corLanterna);
  }

  liberar(v: Vaga): void {
    const g = this.grupos[v.tipo];
    for (const m of g.pecas) m.setMatrixAt(v.indice, this.escondido);
    g.usadas.delete(v.indice);
    g.livres.push(v.indice);
    g.livres.sort((a, b) => b - a); // o próximo carro pega a menor livre
  }

  /** No fim de cada quadro: só desenha até a última instância em uso de cada tipo. */
  finalizarQuadro(): void {
    for (const tipo of TIPOS) {
      const g = this.grupos[tipo];
      let n = 0;
      for (const i of g.usadas) n = Math.max(n, i + 1);
      g.pecas.forEach((m, i) => {
        m.count = n;
        m.visible = n > 0 && (i < 6 || this.fachos);
        m.instanceMatrix.needsUpdate = true;
      });
      if (g.lanternas.instanceColor) g.lanternas.instanceColor.needsUpdate = true;
    }
  }
}
