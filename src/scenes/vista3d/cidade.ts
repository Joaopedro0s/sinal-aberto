// Cidade em volta do cruzamento para a vista em primeira pessoa.
// Tudo é gerado em código e desenhado com InstancedMesh: cada tipo de objeto
// (prédio, janela, tronco, copa, poste) vira UMA chamada de desenho, o que mantém
// o celular leve mesmo com dezenas de prédios.

import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
} from 'three';

/** Onde o jogador fica: na calçada da esquina sudoeste, olhando para o cruzamento. */
export const POS_JOGADOR = { x: -2.1, z: 2.1 };

/** Borda externa da calçada (metade da pista + largura da calçada). */
const BORDA = 2.8;

/** Gerador pseudoaleatório com semente: a cidade é sempre igual (testes e prints estáveis). */
function rng(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Predio {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  cor: number;
}

const CORES_PREDIO = [0x8d99a6, 0x6f7d8c, 0xb0a99f, 0x9e8f80, 0x7b8794, 0xc2b8a3, 0x5f6b78];

function planejarPredios(): Predio[] {
  const r = rng(42);
  const lista: Predio[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Fileira ao longo da rua Norte-Sul (fachada virada para a rua)
      for (let d = 4.2; d < 42; d += 3.4) {
        const w = 2.2 + r() * 1.2;
        const dd = 2.6 + r() * 0.5;
        lista.push({ x: sx * (BORDA + 0.4 + w / 2), z: sz * d, w, h: 2.2 + r() * 5.5, d: dd, cor: CORES_PREDIO[Math.floor(r() * CORES_PREDIO.length)] });
      }
      // Fileira ao longo da rua Leste-Oeste (começa mais longe para não encostar na outra)
      for (let d = 7.6; d < 42; d += 3.4) {
        const w = 2.6 + r() * 0.5;
        const dd = 2.2 + r() * 1.2;
        lista.push({ x: sx * d, z: sz * (BORDA + 0.4 + dd / 2), w, h: 2.2 + r() * 5.5, d: dd, cor: CORES_PREDIO[Math.floor(r() * CORES_PREDIO.length)] });
      }
    }
  }
  return lista;
}

export function criarCidade(): Object3D {
  const raiz = new Object3D();
  raiz.name = 'cidade';
  const m = new Matrix4();
  const predios = planejarPredios();
  const r = rng(7);

  // ── Prédios
  const corpos = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xffffff }), predios.length);
  predios.forEach((p, i) => {
    m.makeScale(p.w, p.h, p.d).setPosition(p.x, p.h / 2, p.z);
    corpos.setMatrixAt(i, m);
    corpos.setColorAt(i, new Color(p.cor));
  });
  // Prédios e janelas ficam num grupo próprio: a vista de cima "achata" esse grupo
  // para os prédios não esconderem as filas.
  const grupoPredios = new Object3D();
  grupoPredios.name = 'predios';
  grupoPredios.add(corpos);
  raiz.add(grupoPredios);

  // ── Janelas (nas 4 fachadas), algumas acesas
  const janelas: { x: number; y: number; z: number; rotY: number; acesa: boolean }[] = [];
  for (const p of predios) {
    const andares = Math.max(1, Math.floor((p.h - 0.6) / 0.75));
    for (let a = 0; a < andares; a++) {
      const y = 0.7 + a * 0.75;
      for (let c = -p.w / 2 + 0.45; c <= p.w / 2 - 0.35; c += 0.6) {
        janelas.push({ x: p.x + c, y, z: p.z + p.d / 2 + 0.01, rotY: 0, acesa: r() < 0.25 });
        janelas.push({ x: p.x + c, y, z: p.z - p.d / 2 - 0.01, rotY: 0, acesa: r() < 0.25 });
      }
      for (let c = -p.d / 2 + 0.45; c <= p.d / 2 - 0.35; c += 0.6) {
        janelas.push({ x: p.x + p.w / 2 + 0.01, y, z: p.z + c, rotY: Math.PI / 2, acesa: r() < 0.25 });
        janelas.push({ x: p.x - p.w / 2 - 0.01, y, z: p.z + c, rotY: Math.PI / 2, acesa: r() < 0.25 });
      }
    }
  }
  const malhaJanela = new InstancedMesh(new BoxGeometry(0.3, 0.36, 0.02), new MeshBasicMaterial({ color: 0xffffff }), janelas.length);
  const corAcesa = new Color(0xffe08a);
  const corApagada = new Color(0x3d5a73);
  janelas.forEach((j, i) => {
    m.makeRotationY(j.rotY).setPosition(j.x, j.y, j.z);
    malhaJanela.setMatrixAt(i, m);
    malhaJanela.setColorAt(i, j.acesa ? corAcesa : corApagada);
  });
  grupoPredios.add(malhaJanela);

  // ── Árvores e postes nas calçadas
  const arvores: [number, number][] = [];
  const postes: [number, number][] = [];
  for (let d = 4.5; d < 40; d += 4.2) {
    for (const s of [-1, 1]) {
      arvores.push([s * (BORDA - 0.35), d * (s === 1 ? 1 : -1)]);
      arvores.push([d * (s === 1 ? -1 : 1), s * (BORDA - 0.35)]);
      postes.push([-s * (BORDA - 0.25), d * s + 2.1]);
      postes.push([d * s + 2.1, -s * (BORDA - 0.25)]);
    }
  }
  // Não coloca nada em cima do ponto onde o jogador fica (esquina sudoeste).
  const longeDoJogador = ([x, z]: [number, number]): boolean => Math.hypot(x - POS_JOGADOR.x, z - POS_JOGADOR.z) > 1.6;
  arvores.splice(0, arvores.length, ...arvores.filter(longeDoJogador));
  postes.splice(0, postes.length, ...postes.filter(longeDoJogador));

  const troncos = new InstancedMesh(new CylinderGeometry(0.05, 0.07, 0.6, 5), new MeshLambertMaterial({ color: 0x5d3a1a }), arvores.length);
  const copas = new InstancedMesh(new ConeGeometry(0.38, 0.9, 6), new MeshLambertMaterial({ color: 0xffffff }), arvores.length);
  arvores.forEach(([x, z], i) => {
    const esc = 0.85 + r() * 0.4;
    m.makeScale(esc, esc, esc).setPosition(x, 0.3 * esc, z);
    troncos.setMatrixAt(i, m);
    m.makeScale(esc, esc, esc).setPosition(x, 0.95 * esc, z);
    copas.setMatrixAt(i, m);
    copas.setColorAt(i, new Color(r() < 0.5 ? 0x2e6b3a : 0x3f7f45));
  });
  raiz.add(troncos, copas);

  const hastes = new InstancedMesh(new CylinderGeometry(0.025, 0.03, 1.5, 5), new MeshLambertMaterial({ color: 0x6b7178 }), postes.length);
  const luminarias = new InstancedMesh(new BoxGeometry(0.16, 0.05, 0.1), new MeshBasicMaterial({ color: 0xfff3c4 }), postes.length);
  postes.forEach(([x, z], i) => {
    m.makeTranslation(x, 0.75, z);
    hastes.setMatrixAt(i, m);
    m.makeTranslation(x, 1.5, z);
    luminarias.setMatrixAt(i, m);
  });
  raiz.add(hastes, luminarias);

  // ── Posto do guarda: plataforma onde o jogador fica em pé
  const posto = new Mesh(new CylinderGeometry(0.42, 0.48, 0.3, 10), new MeshLambertMaterial({ color: 0xf2c94c }));
  posto.position.set(POS_JOGADOR.x, 0.24, POS_JOGADOR.z);
  raiz.add(posto);
  const faixaPosto = new Mesh(new CylinderGeometry(0.43, 0.43, 0.06, 10), new MeshLambertMaterial({ color: 0x222222 }));
  faixaPosto.position.set(POS_JOGADOR.x, 0.3, POS_JOGADOR.z);
  raiz.add(faixaPosto);

  return raiz;
}

/** Cor do horizonte: o nevoeiro usa a mesma cor para a cidade "sumir" no céu. */
export const COR_HORIZONTE = 0xcfe3ef;

/** Domo de céu com degradê (azul em cima, claro no horizonte). */
export function criarCeu(): Mesh {
  const geo = new SphereGeometry(120, 24, 12);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const topo = new Color(0x4f93cf);
  const horizonte = new Color(COR_HORIZONTE);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 120));
    c.copy(horizonte).lerp(topo, Math.pow(t, 0.6));
    cores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(cores, 3));
  const ceu = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
  ceu.name = 'ceu';
  ceu.renderOrder = -1;
  return ceu;
}
