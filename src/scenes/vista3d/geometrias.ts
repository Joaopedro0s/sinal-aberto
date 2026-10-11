// Geometrias low-poly geradas em código para a cena 3D do cruzamento.
// Nenhum arquivo .glb, .obj ou textura externa — tudo é Three.js puro.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  InstancedMesh,
  Matrix4,
  SphereGeometry,
} from 'three';

import { criarCidade } from './cidade';

// ──────────────────────────────────────── Cores base
const COR_ASFALTO   = new Color(0x3b3f45);
const COR_CALCADA   = new Color(0x5a6470);
const COR_GRAMA     = new Color(0x3d6b45);
const COR_FAIXA     = new Color(0xeeeeee);
const COR_FAIXA_AMB = new Color(0xff6b6b); // faixa vermelha da ambulância

export const CORES_CARRO = [
  0xef5350, 0x42a5f5, 0xffca28, 0x66bb6a,
  0xab47bc, 0xff7043, 0x26c6da, 0x8d6e63,
];

// ──────────────────────────────────────── helpers
function mat(color: Color | number): MeshLambertMaterial {
  return new MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, color: Color | number): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), mat(color));
}

// ──────────────────────────────────────── Cenário
const MEIO = 1.3; // metade da largura da pista (em unidades 3D)

/**
 * Retorna o grupo raiz do cenário estático (chão, pistas, faixas, prédios, árvores).
 * Não inclui carros nem semáforos — esses são criados separadamente.
 */
export function criarCenario(): Object3D {
  const raiz = new Object3D();
  raiz.name = 'cenario';

  // ── Chão base (grama) — grande para chegar ao horizonte na vista em primeira pessoa
  const chao = box(240, 0.1, 240, COR_GRAMA);
  chao.position.y = -0.05;
  raiz.add(chao);

  // ── Pistas (Norte-Sul e Leste-Oeste)
  const pistaNS = box(MEIO * 2, 0.12, 240, COR_ASFALTO);
  raiz.add(pistaNS);
  const pistaLO = box(240, 0.12, MEIO * 2, COR_ASFALTO);
  raiz.add(pistaLO);

  // ── Linha central tracejada nas duas ruas (uma InstancedMesh só)
  const posTracos: [number, number, boolean][] = [];
  for (let d = MEIO + 0.6; d < 60; d += 0.8) {
    for (const s of [-1, 1]) {
      posTracos.push([0, s * d, true]);
      posTracos.push([s * d, 0, false]);
    }
  }
  const tracos = new InstancedMesh(new BoxGeometry(0.06, 0.14, 0.4), mat(0xf2f2f2), posTracos.length);
  const m = new Matrix4();
  posTracos.forEach(([x, z, vertical], i) => {
    m.makeRotationY(vertical ? 0 : Math.PI / 2).setPosition(x, 0.04, z); // topo em 0,11: acima do asfalto (0,10)
    tracos.setMatrixAt(i, m);
  });
  raiz.add(tracos);

  // ── Calçadas (com meio-fio um pouco mais alto que a pista)
  const calcadaLarg = 1.5;
  for (const s of [-1, 1]) {
    const ns = box(calcadaLarg, 0.12, 240, COR_CALCADA);
    ns.position.set(s * (MEIO + calcadaLarg / 2), 0.03, 0);
    raiz.add(ns);
    const lo = box(240, 0.12, calcadaLarg, COR_CALCADA);
    lo.position.set(0, 0.03, s * (MEIO + calcadaLarg / 2));
    raiz.add(lo);
  }
  // O asfalto do cruzamento fica por cima das calçadas que se cruzam no meio
  const cruzamento = box(MEIO * 2, 0.2, MEIO * 2, COR_ASFALTO);
  cruzamento.position.y = 0.0;
  raiz.add(cruzamento);
  for (const s of [-1, 1]) {
    const pn = box(MEIO * 2, 0.2, 200, COR_ASFALTO);
    pn.position.set(0, 0, s * 100 + s * MEIO);
    raiz.add(pn);
    const pl = box(200, 0.2, MEIO * 2, COR_ASFALTO);
    pl.position.set(s * 100 + s * MEIO, 0, 0);
    raiz.add(pl);
  }

  // ── Faixas de pedestre (Norte-Sul e Leste-Oeste)
  const faixaY = 0.08;
  for (let i = -2; i <= 2; i++) {
    // faixa Norte
    const fn = box(0.18, faixaY, 0.7, COR_FAIXA);
    fn.position.set(MEIO * (i / 2) * 0.85, 0.075, -MEIO - 0.45);
    raiz.add(fn);
    // faixa Leste
    const fl = box(0.7, faixaY, 0.18, COR_FAIXA);
    fl.position.set(MEIO + 0.45, 0.075, MEIO * (i / 2) * 0.85);
    raiz.add(fl);
  }

  // ── Linha de retenção (para a fila)
  const lr1 = box(MEIO * 2, faixaY, 0.06, 0xffffff);
  lr1.position.set(0, 0.075, -MEIO - 1.1);
  raiz.add(lr1);
  const lr2 = box(0.06, faixaY, MEIO * 2, 0xffffff);
  lr2.position.set(MEIO + 1.1, 0.075, 0);
  raiz.add(lr2);

  // Prédios, árvores e postes ficam em cidade.ts (instanciados).
  raiz.add(criarCidade());

  return raiz;
}

// ──────────────────────────────────────── Semáforo
export function criarSemaforo(): Object3D {
  const grupo = new Object3D();
  // poste
  const poste = new Mesh(
    new CylinderGeometry(0.06, 0.06, 1.4, 6),
    mat(0x888888),
  );
  poste.position.y = 0.7;
  grupo.add(poste);
  // caixa do semáforo
  const caixa = box(0.22, 0.5, 0.18, 0x222222);
  caixa.position.y = 1.55;
  grupo.add(caixa);
  // lâmpada (sphere pequena)
  // Lâmpada com material "básico": brilha igual de dia, sem depender da luz da cena.
  const lamp = new Mesh(new SphereGeometry(0.1, 10, 8), new MeshBasicMaterial({ color: 0xff3030 }));
  lamp.name = 'lampada';
  lamp.position.y = 1.55;
  lamp.position.z = 0.11;
  grupo.add(lamp);
  // Mesma luz na parte de trás (mesmo material: muda de cor junto), para o guarda
  // na esquina enxergar o sinal das duas vias.
  const lampTras = new Mesh(lamp.geometry, lamp.material);
  lampTras.position.set(0, 1.55, -0.11);
  grupo.add(lampTras);
  return grupo;
}

// ──────────────────────────────────────── Carro (geometria base para InstancedMesh)
/** Geometria de um carro visto de perspectiva inclinada — low-poly box + para-brisa. */
export function gerarGeometriaCarro(): BufferGeometry {
  // carroceria principal
  const geo = new BoxGeometry(0.55, 0.22, 0.95);
  // Levanta ligeiramente para ficar acima do chão
  const pos = geo.attributes.position as Float32BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + 0.11);
  }
  pos.needsUpdate = true;
  return geo;
}

/** Junta várias caixas pequenas numa geometria só (para faróis e lanternas instanciados). */
function caixas(lista: [number, number, number, number, number, number][]): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [cx, cy, cz, w, h, d] of lista) {
    const g = new BoxGeometry(w, h, d);
    const p = g.attributes.position as Float32BufferAttribute;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i) + cx, p.getY(i) + cy, p.getZ(i) + cz);
    for (const i of g.index!.array) idx.push(base + i);
    g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Faróis: dois retângulos claros na frente do carro (+z). */
export function gerarGeometriaFarois(): BufferGeometry {
  return caixas([
    [-0.18, 0.17, 0.48, 0.12, 0.06, 0.02],
    [0.18, 0.17, 0.48, 0.12, 0.06, 0.02],
  ]);
}

/** Lanternas traseiras (−z): a cor de cada instância muda para "freio" quando o carro está parado. */
export function gerarGeometriaLanternas(): BufferGeometry {
  return caixas([
    [-0.19, 0.18, -0.48, 0.12, 0.06, 0.02],
    [0.19, 0.18, -0.48, 0.12, 0.06, 0.02],
  ]);
}

/** Geometria do teto/cabine do carro. */
export function gerarGeometriaTeto(): BufferGeometry {
  const geo = new BoxGeometry(0.42, 0.18, 0.48);
  const pos = geo.attributes.position as Float32BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + 0.33);
  }
  pos.needsUpdate = true;
  return geo;
}

// ──────────────────────────────────────── Ambulância (mesh individual)
export function criarMeshAmbulancia(vertical: boolean): Object3D {
  const grupo = new Object3D();
  // carroceria branca
  const corpo = new Mesh(new BoxGeometry(0.58, 0.28, 1.1), mat(0xffffff));
  corpo.position.y = 0.14;
  grupo.add(corpo);
  // faixa vermelha
  const faixa = new Mesh(new BoxGeometry(0.59, 0.09, 1.11), mat(COR_FAIXA_AMB));
  faixa.position.y = 0.14;
  grupo.add(faixa);
  // teto elevado
  const teto = new Mesh(new BoxGeometry(0.5, 0.22, 0.9), mat(0xf5f5f5));
  teto.position.y = 0.41;
  grupo.add(teto);
  // luz giratória (Mesh vermelho/azul alternado pelo código da cena)
  const luz = new Mesh(new BoxGeometry(0.22, 0.1, 0.22), mat(0xff1744));
  luz.name = 'luz';
  luz.position.y = 0.56;
  grupo.add(luz);
  // cruz vermelha no teto
  const hCruz = new Mesh(new BoxGeometry(0.28, 0.01, 0.08), mat(0xcc0000));
  hCruz.position.set(0, 0.53, 0);
  grupo.add(hCruz);
  const vCruz = new Mesh(new BoxGeometry(0.08, 0.01, 0.28), mat(0xcc0000));
  vCruz.position.set(0, 0.53, 0);
  grupo.add(vCruz);
  // rotação para a via
  if (!vertical) grupo.rotation.y = Math.PI / 2;
  return grupo;
}
