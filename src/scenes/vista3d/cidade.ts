// Cidade em volta do cruzamento para a vista em primeira pessoa.
// Tudo é gerado em código e desenhado com InstancedMesh (ou geometrias fundidas): cada tipo
// de objeto (prédio, janela, toldo, letreiro, árvore, poste…) vira UMA chamada de desenho,
// o que mantém o celular leve mesmo com dezenas de prédios e lojas.

import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  type Material,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { LOJAS, texturaLetreiros } from './texturas';

/** Onde o jogador fica: na calçada da esquina sudoeste, olhando para o cruzamento. */
export const POS_JOGADOR = { x: -2.1, z: 2.1 };

/** Referência das calçadas (árvores e postes ficam um pouco para dentro disso). */
const BORDA = 2.8;
/** Onde começam as fachadas dos prédios. */
const FACHADA = BORDA + 0.4;
const Y_CALCADA = 0.14;

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
  /** Direção da fachada que dá para a rua (normal da parede). */
  fx: number;
  fz: number;
  loja: number;
}

/** Fachadas em tons de reboco pintado, como num bairro comercial. */
const CORES_PREDIO = [0xe8dcc4, 0xc9826b, 0x9fb7c9, 0xe6b8a2, 0xb7b1a6, 0xf1ede4, 0x8fa58c, 0xd8c08f, 0x7d8a99];
const CORES_TOLDO = [0xc62828, 0x1565c0, 0x2e7d32, 0xef6c00, 0x6a1b9a, 0x00838f, 0x37474f];

function planejarPredios(): Predio[] {
  const r = rng(42);
  const lista: Predio[] = [];
  const cor = (): number => CORES_PREDIO[Math.floor(r() * CORES_PREDIO.length)];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Fileira ao longo da rua Norte-Sul (fachada virada para a rua)
      for (let d = 4.2; d < 42; d += 3.4) {
        const w = 2.2 + r() * 1.2;
        const dd = 2.6 + r() * 0.5;
        lista.push({ x: sx * (FACHADA + w / 2), z: sz * d, w, h: 2.2 + r() * 5.5, d: dd, cor: cor(), fx: -sx, fz: 0, loja: Math.floor(r() * LOJAS.length) });
      }
      // Fileira ao longo da rua Leste-Oeste (começa mais longe para não encostar na outra)
      for (let d = 7.6; d < 42; d += 3.4) {
        const w = 2.6 + r() * 0.5;
        const dd = 2.2 + r() * 1.2;
        lista.push({ x: sx * d, z: sz * (FACHADA + dd / 2), w, h: 2.2 + r() * 5.5, d: dd, cor: cor(), fx: 0, fz: -sz, loja: Math.floor(r() * LOJAS.length) });
      }
    }
  }
  return lista;
}

/** Cria uma InstancedMesh já com sombra configurada. */
function instancias(geo: BufferGeometry, mat: Material, qtd: number, projeta = true, recebe = false): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, qtd));
  m.count = qtd;
  m.castShadow = projeta;
  m.receiveShadow = recebe;
  return m;
}

export function criarCidade(): Object3D {
  const raiz = new Object3D();
  raiz.name = 'cidade';
  const m = new Matrix4();
  const tmp = new Object3D();
  const predios = planejarPredios();
  const r = rng(7);
  const cor = new Color();

  // Prédios, janelas e tudo que fica nas fachadas ficam num grupo próprio: a vista de cima
  // "achata" esse grupo para os prédios não esconderem as filas.
  const grupoPredios = new Object3D();
  grupoPredios.name = 'predios';
  raiz.add(grupoPredios);

  // ── Corpo dos prédios e platibanda (a borda saliente no alto)
  const reboco = new MeshLambertMaterial({ color: 0xffffff });
  const corpos = instancias(new BoxGeometry(1, 1, 1), reboco, predios.length, true, true);
  const platibandas = instancias(new BoxGeometry(1, 1, 1), reboco, predios.length, true, false);
  predios.forEach((p, i) => {
    m.makeScale(p.w, p.h, p.d).setPosition(p.x, p.h / 2, p.z);
    corpos.setMatrixAt(i, m);
    corpos.setColorAt(i, cor.setHex(p.cor));
    m.makeScale(p.w + 0.08, 0.1, p.d + 0.08).setPosition(p.x, p.h + 0.02, p.z);
    platibandas.setMatrixAt(i, m);
    platibandas.setColorAt(i, cor.setHex(p.cor).multiplyScalar(0.78));
  });
  grupoPredios.add(corpos, platibandas);

  // ── Janelas a partir do 1º andar, algumas com a luz acesa. Só nas paredes que dão
  // para a rua ou para os lados: os fundos dos prédios nunca aparecem (economiza ~¼).
  const janelas: { x: number; y: number; z: number; rotY: number; acesa: boolean; cor: number }[] = [];
  for (const p of predios) {
    const andares = Math.max(1, Math.floor((p.h - 1.0) / 0.62));
    const faces: [number, number][] = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]).filter(([nx, nz]) => nx * p.fx + nz * p.fz >= 0);
    for (let a = 0; a < andares; a++) {
      const y = 1.2 + a * 0.62;
      if (y > p.h - 0.3) break;
      for (const [nx, nz] of faces) {
        const larg = nx === 0 ? p.w : p.d;
        for (let c = -larg / 2 + 0.4; c <= larg / 2 - 0.3; c += 0.55) {
          janelas.push({
            x: p.x + (nx === 0 ? c : nx * (p.w / 2 + 0.006)),
            y,
            z: p.z + (nz === 0 ? c : nz * (p.d / 2 + 0.006)),
            rotY: Math.atan2(nx, nz),
            acesa: r() < 0.12,
            cor: p.cor,
          });
        }
      }
    }
  }
  // Moldura (um tom mais claro que a parede) + vidro escuro e espelhado (reflete o céu).
  // Planos de 2 triângulos cada. A moldura com pouco contraste evita o "chiado" de longe.
  const molduras = instancias(new PlaneGeometry(0.34, 0.4), new MeshLambertMaterial({ color: 0xffffff }), janelas.length, false);
  const vidros = instancias(new PlaneGeometry(0.27, 0.33).translate(0, 0, 0.006), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.75 }), janelas.length, false);
  const corAcesa = new Color(0xffe2a0);
  const corApagada = new Color(0x34506a);
  const branco = new Color(0xffffff);
  janelas.forEach((j, i) => {
    m.makeRotationY(j.rotY).setPosition(j.x, j.y, j.z);
    molduras.setMatrixAt(i, m);
    molduras.setColorAt(i, cor.setHex(j.cor).lerp(branco, 0.45));
    vidros.setMatrixAt(i, m);
    vidros.setColorAt(i, j.acesa ? corAcesa : corApagada);
  });
  grupoPredios.add(molduras, vidros);

  // ── Lojas no térreo: vitrine, toldo colorido e letreiro com o nome
  const vitrines = instancias(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x1b2a36, roughness: 0.06, metalness: 0.85 }), predios.length, false);
  const portas = instancias(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.5 }), predios.length, false);
  const toldos = instancias(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xffffff }), predios.length, true);
  const placasLojas: BufferGeometry[] = [];
  predios.forEach((p, i) => {
    const largFachada = p.fx !== 0 ? p.d : p.w;
    const rot = Math.atan2(p.fx, p.fz); // gira o "+z" local para a direção da fachada
    // Ponto no meio da fachada, rente à parede
    const px = p.x + p.fx * (p.w / 2);
    const pz = p.z + p.fz * (p.d / 2);
    const colocar = (alvo: InstancedMesh, w: number, h: number, d: number, y: number, fora: number, inclina = 0): void => {
      tmp.position.set(px + p.fx * fora, y, pz + p.fz * fora);
      tmp.rotation.set(0, rot, 0);
      tmp.rotateX(inclina);
      tmp.scale.set(w, h, d);
      tmp.updateMatrix();
      alvo.setMatrixAt(i, tmp.matrix);
    };
    colocar(vitrines, largFachada * 0.62, 0.42, 0.03, Y_CALCADA + 0.25, 0.01);
    // A porta fica num canto da vitrine
    tmp.position.set(px + p.fx * 0.012, Y_CALCADA + 0.23, pz + p.fz * 0.012);
    tmp.rotation.set(0, rot, 0);
    tmp.translateX(largFachada * 0.36);
    tmp.scale.set(largFachada * 0.16, 0.46, 0.035);
    tmp.updateMatrix();
    portas.setMatrixAt(i, tmp.matrix);
    colocar(toldos, largFachada * 0.82, 0.03, 0.3, Y_CALCADA + 0.56, 0.14, 0.28);
    toldos.setColorAt(i, cor.setHex(CORES_TOLDO[(p.loja + i) % CORES_TOLDO.length]));

    // Letreiro: um retângulo da imagem com todos os letreiros (cada loja é uma faixa)
    const g = new PlaneGeometry(Math.min(1.7, largFachada * 0.8), 0.22);
    const uv = g.attributes.uv;
    const v0 = 1 - (p.loja + 1) / LOJAS.length;
    const v1 = 1 - p.loja / LOJAS.length;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 - 0.004 : v0 + 0.004);
    g.rotateY(rot);
    g.translate(px + p.fx * 0.02, Y_CALCADA + 0.84, pz + p.fz * 0.02);
    placasLojas.push(g);
  });
  grupoPredios.add(vitrines, portas, toldos);
  const letreiros = new Mesh(mergeGeometries(placasLojas)!, new MeshStandardMaterial({ map: texturaLetreiros(), roughness: 0.45, emissive: 0xffffff, emissiveMap: texturaLetreiros(), emissiveIntensity: 0.25 }));
  grupoPredios.add(letreiros);

  // ── Telhado: caixas d'água azuis e aparelhos de ar-condicionado
  const caixas: [number, number, number][] = [];
  const arCond: [number, number, number][] = [];
  for (const p of predios) {
    if (r() < 0.55) caixas.push([p.x + (r() - 0.5) * p.w * 0.5, p.h + 0.07, p.z + (r() - 0.5) * p.d * 0.5]);
    const n = Math.floor(r() * 3);
    for (let k = 0; k < n; k++) arCond.push([p.x + (r() - 0.5) * p.w * 0.7, p.h + 0.07, p.z + (r() - 0.5) * p.d * 0.7]);
  }
  const malhaCaixas = instancias(new CylinderGeometry(0.2, 0.17, 0.28, 12), new MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.5 }), caixas.length);
  caixas.forEach(([x, y, z], i) => malhaCaixas.setMatrixAt(i, m.makeTranslation(x, y + 0.14, z)));
  const malhaAr = instancias(new BoxGeometry(0.26, 0.16, 0.2), new MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.5, metalness: 0.3 }), arCond.length);
  arCond.forEach(([x, y, z], i) => malhaAr.setMatrixAt(i, m.makeTranslation(x, y + 0.08, z)));
  grupoPredios.add(malhaCaixas, malhaAr);

  // ── Árvores e postes nas calçadas
  const arvores: [number, number][] = [];
  const postes: [number, number, number][] = []; // x, z, rotação (o braço aponta para a rua)
  for (let d = 4.5; d < 40; d += 4.2) {
    for (const s of [-1, 1]) {
      arvores.push([s * (BORDA - 0.35), d * (s === 1 ? 1 : -1)]);
      arvores.push([d * (s === 1 ? -1 : 1), s * (BORDA - 0.35)]);
      const xp = -s * (BORDA - 0.25);
      postes.push([xp, d * s + 2.1, xp > 0 ? Math.PI : 0]);
      const zp = -s * (BORDA - 0.25);
      postes.push([d * s + 2.1, zp, zp > 0 ? Math.PI / 2 : -Math.PI / 2]);
    }
  }
  // Não coloca nada em cima do ponto onde o jogador fica (esquina sudoeste).
  const longe = (x: number, z: number): boolean => Math.hypot(x - POS_JOGADOR.x, z - POS_JOGADOR.z) > 1.6;
  const arvoresOk = arvores.filter(([x, z]) => longe(x, z));
  const postesOk = postes.filter(([x, z]) => longe(x, z));

  const troncos = instancias(new CylinderGeometry(0.035, 0.055, 0.7, 7), new MeshLambertMaterial({ color: 0x5b4030 }), arvoresOk.length);
  const copaGeo = mergeGeometries([
    new IcosahedronGeometry(0.42, 1),
    new IcosahedronGeometry(0.3, 0).translate(0.22, -0.08, 0.1),
    new IcosahedronGeometry(0.28, 0).translate(-0.18, 0.05, -0.15),
  ])!;
  const copas = instancias(copaGeo, new MeshLambertMaterial({ color: 0xffffff, flatShading: true }), arvoresOk.length, true, true);
  const canteiros = instancias(new BoxGeometry(0.42, 0.02, 0.42), new MeshLambertMaterial({ color: 0x4a3626 }), arvoresOk.length, false, true);
  const VERDES = [0x3d7a3a, 0x4f8c3f, 0x2f6a35, 0x5a9444];
  arvoresOk.forEach(([x, z], i) => {
    const esc = 0.85 + r() * 0.35;
    m.makeScale(esc, esc, esc).setPosition(x, Y_CALCADA + 0.35 * esc, z);
    troncos.setMatrixAt(i, m);
    tmp.position.set(x, Y_CALCADA + 1.0 * esc, z);
    tmp.rotation.set(0, r() * Math.PI * 2, 0);
    tmp.scale.set(esc, esc * 0.9, esc);
    tmp.updateMatrix();
    copas.setMatrixAt(i, tmp.matrix);
    copas.setColorAt(i, cor.setHex(VERDES[Math.floor(r() * VERDES.length)]));
    canteiros.setMatrixAt(i, m.makeTranslation(x, Y_CALCADA + 0.005, z));
  });
  raiz.add(troncos, copas, canteiros);

  // Poste de luz com braço curvo por cima da pista
  const posteGeo = mergeGeometries([
    new CylinderGeometry(0.022, 0.03, 1.7, 8).translate(0, 0.85, 0),
    new CylinderGeometry(0.014, 0.014, 0.55, 6).rotateZ(Math.PI / 2 - 0.25).translate(0.26, 1.74, 0),
  ])!;
  const hastes = instancias(posteGeo, new MeshStandardMaterial({ color: 0x5f656c, roughness: 0.45, metalness: 0.6 }), postesOk.length);
  const cabecas = instancias(new BoxGeometry(0.2, 0.04, 0.09), new MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.4 }), postesOk.length);
  postesOk.forEach(([x, z, rot], i) => {
    tmp.position.set(x, Y_CALCADA, z);
    tmp.rotation.set(0, rot, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    hastes.setMatrixAt(i, tmp.matrix);
    tmp.translateX(0.56);
    tmp.translateY(1.8);
    tmp.updateMatrix();
    cabecas.setMatrixAt(i, tmp.matrix);
  });
  raiz.add(hastes, cabecas);

  // ── Posto do guarda: plataforma onde o jogador fica em pé
  const posto = new Mesh(new CylinderGeometry(0.42, 0.48, 0.3, 20), new MeshLambertMaterial({ color: 0xf2c94c }));
  posto.position.set(POS_JOGADOR.x, Y_CALCADA + 0.15, POS_JOGADOR.z);
  posto.castShadow = posto.receiveShadow = true;
  raiz.add(posto);
  const faixaPosto = new Mesh(new CylinderGeometry(0.43, 0.43, 0.06, 20), new MeshLambertMaterial({ color: 0x222222 }));
  faixaPosto.position.set(POS_JOGADOR.x, Y_CALCADA + 0.21, POS_JOGADOR.z);
  raiz.add(faixaPosto);

  return raiz;
}

/** Cor do horizonte: o nevoeiro usa a mesma cor para a cidade "sumir" no céu. */
export const COR_HORIZONTE = 0xd6e6f0;

/** Domo de céu com degradê (azul em cima, claro no horizonte) e um brilho em volta do sol. */
export function criarCeu(direcaoSol: { x: number; y: number; z: number }): Mesh {
  const geo = new SphereGeometry(120, 32, 16);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const topo = new Color(0x3d7fc4);
  const horizonte = new Color(COR_HORIZONTE);
  const brilho = new Color(0xfff4dc);
  const len = Math.hypot(direcaoSol.x, direcaoSol.y, direcaoSol.z);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 120;
    const y = pos.getY(i) / 120;
    const z = pos.getZ(i) / 120;
    const t = Math.max(0, Math.min(1, y));
    c.copy(horizonte).lerp(topo, Math.pow(t, 0.55));
    const perto = Math.max(0, (x * direcaoSol.x + y * direcaoSol.y + z * direcaoSol.z) / len);
    c.lerp(brilho, Math.pow(perto, 12) * 0.8);
    cores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(cores, 3));
  const ceu = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false }));
  ceu.name = 'ceu';
  ceu.renderOrder = -1;
  return ceu;
}
