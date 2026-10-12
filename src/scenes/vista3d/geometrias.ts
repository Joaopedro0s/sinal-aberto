// Modelos 3D gerados em código para a cena do cruzamento.
// Nenhum arquivo .glb, .obj ou imagem externa: as formas são do Three.js e as texturas
// (asfalto, calçada, placas, letreiros) são desenhadas em canvas (ver texturas.ts).
//
// Para o celular continuar leve, peças do mesmo material são "fundidas" numa geometria só
// (uma chamada de desenho) e os carros usam InstancedMesh.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { criarCidade } from './cidade';
import { texturaAsfalto, texturaCalcada, texturaGrama, texturaPlacaRua, texturaVelocidade } from './texturas';

/** Cores dos carros: parecidas com as da frota real (muito branco, prata, preto e cinza). */
export const CORES_CARRO = [
  0xf4f4f2, 0xb9bec4, 0x23262b, 0xb71c1c, 0x1d4e89, 0x6e737a, 0xf4f4f2, 0xd8c7a0, 0x2e6b3a, 0xb9bec4,
];

// ──────────────────────────────────────── helpers

/** Desloca (e opcionalmente gira) uma geometria e devolve ela mesma. */
function em(g: BufferGeometry, x: number, y: number, z: number, rotZ = 0, rotY = 0): BufferGeometry {
  if (rotZ) g.rotateZ(rotZ);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Garante os mesmos atributos (position, normal, uv) para poder fundir geometrias diferentes. */
function fundir(lista: BufferGeometry[]): BufferGeometry {
  const prontas = lista.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of prontas) {
    if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return mergeGeometries(prontas)!;
}

/**
 * Caixa de chão (pista, calçada) com coordenadas de textura "do mundo": a mesma textura
 * se repete sem esticar, qualquer que seja o tamanho da peça, e várias peças podem ser
 * fundidas com uma textura só.
 */
function caixaChao(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, metrosPorRepeticao: number): BufferGeometry {
  const g = new BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / metrosPorRepeticao, p.getZ(i) / metrosPorRepeticao);
  return g;
}

/** Retângulo deitado no chão (pintura de pista). */
function faixa(cx: number, cz: number, w: number, d: number, y: number): BufferGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  return g;
}

function malha(geo: BufferGeometry, material: Material, sombra: 'projeta' | 'recebe' | 'ambos' | 'nenhuma'): Mesh {
  const m = new Mesh(geo, material);
  m.castShadow = sombra === 'projeta' || sombra === 'ambos';
  m.receiveShadow = sombra === 'recebe' || sombra === 'ambos';
  return m;
}

// ──────────────────────────────────────── Cenário
const MEIO = 1.3; // metade da largura da pista
/** Altura do asfalto (os carros andam aqui). */
export const Y_ASFALTO = 0.1;
/** Altura da calçada: um degrau de meio-fio acima do asfalto. */
const Y_CALCADA = 0.14;
/** Borda externa da calçada (as fachadas dos prédios começam um pouco antes). */
const FIM_CALCADA = 3.3;
const LONGE = 120;

/**
 * Retorna o grupo raiz do cenário estático (chão, pistas, calçadas, sinalização e cidade).
 * Não inclui carros nem semáforos — esses são criados separadamente.
 */
export function criarCenario(): Object3D {
  const raiz = new Object3D();
  raiz.name = 'cenario';

  // ── Grama (terrenos atrás dos prédios, até o horizonte)
  const grama = texturaGrama();
  const chao = malha(caixaChao(-LONGE * 2, LONGE * 2, -LONGE * 2, LONGE * 2, -0.1, 0, 2), new MeshLambertMaterial({ map: grama }), 'recebe');
  raiz.add(chao);

  // ── Asfalto: rua Norte-Sul inteira + os dois braços da rua Leste-Oeste
  const asfalto = fundir([
    caixaChao(-MEIO, MEIO, -LONGE, LONGE, 0, Y_ASFALTO, 1.6),
    caixaChao(MEIO, LONGE, -MEIO, MEIO, 0, Y_ASFALTO, 1.6),
    caixaChao(-LONGE, -MEIO, -MEIO, MEIO, 0, Y_ASFALTO, 1.6),
  ]);
  raiz.add(malha(asfalto, new MeshLambertMaterial({ map: texturaAsfalto() }), 'recebe'));

  // ── Calçadas nas quatro esquinas (em L) e o meio-fio claro na beira da pista
  const pecasCalcada: BufferGeometry[] = [];
  const pecasMeioFio: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Ao longo da rua Norte-Sul (inclui o quadrado da esquina)
      pecasCalcada.push(caixaChao(sx * MEIO, sx * FIM_CALCADA, sz * MEIO, sz * LONGE, 0, Y_CALCADA, 1));
      // Ao longo da rua Leste-Oeste (começa depois do quadrado da esquina)
      pecasCalcada.push(caixaChao(sx * FIM_CALCADA, sx * LONGE, sz * MEIO, sz * FIM_CALCADA, 0, Y_CALCADA, 1));
      // Meio-fio: tira clara um pouco mais alta na beira da pista
      pecasMeioFio.push(caixaChao(sx * MEIO, sx * (MEIO + 0.06), sz * MEIO, sz * LONGE, 0, Y_CALCADA + 0.008, 1));
      pecasMeioFio.push(caixaChao(sx * (MEIO + 0.06), sx * LONGE, sz * MEIO, sz * (MEIO + 0.06), 0, Y_CALCADA + 0.008, 1));
    }
  }
  raiz.add(malha(fundir(pecasCalcada), new MeshLambertMaterial({ map: texturaCalcada() }), 'recebe'));
  raiz.add(malha(fundir(pecasMeioFio), new MeshLambertMaterial({ color: 0xd9d6cf }), 'recebe'));

  // ── Pintura da pista (uma geometria só)
  const y = Y_ASFALTO + 0.002;
  const pinturas: BufferGeometry[] = [];
  const BORDA_LINHA = MEIO - 0.1;
  for (const s of [-1, 1]) {
    // Linhas de bordo contínuas, fora do cruzamento
    pinturas.push(faixa(s * BORDA_LINHA, s * (MEIO + 2.4 + LONGE) / 2, 0.04, LONGE - MEIO - 2.4, y));
    pinturas.push(faixa(-s * BORDA_LINHA, s * (MEIO + 2.4 + LONGE) / 2, 0.04, LONGE - MEIO - 2.4, y));
    pinturas.push(faixa(s * (MEIO + 2.4 + LONGE) / 2, s * BORDA_LINHA, LONGE - MEIO - 2.4, 0.04, y));
    pinturas.push(faixa(s * (MEIO + 2.4 + LONGE) / 2, -s * BORDA_LINHA, LONGE - MEIO - 2.4, 0.04, y));
  }
  // Faixas de pedestre (zebradas) nos quatro lados do cruzamento
  for (let x = -MEIO + 0.2; x <= MEIO - 0.15; x += 0.32) {
    for (const s of [-1, 1]) {
      pinturas.push(faixa(x + 0.08, s * (MEIO + 0.45), 0.16, 0.62, y));
      pinturas.push(faixa(s * (MEIO + 0.45), x + 0.08, 0.62, 0.16, y));
    }
  }
  // Linhas de retenção (onde a fila para) nas duas vias que chegam
  pinturas.push(faixa(0, -MEIO - 1.1, MEIO * 2 - 0.1, 0.07, y));
  pinturas.push(faixa(MEIO + 1.1, 0, 0.07, MEIO * 2 - 0.1, y));
  const tinta = new MeshLambertMaterial({ color: 0xf2f2ee, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  raiz.add(malha(fundir(pinturas), tinta, 'recebe'));

  // ── Placas: nome das ruas (azul) e velocidade máxima
  raiz.add(criarPlacas());

  // Prédios, lojas, árvores e postes ficam em cidade.ts (instanciados).
  raiz.add(criarCidade());

  return raiz;
}

const metalPoste = new MeshStandardMaterial({ color: 0x5f656c, roughness: 0.5, metalness: 0.6 });

function criarPlacas(): Object3D {
  const g = new Object3D();
  // Placa de rua na esquina nordeste (em frente ao guarda), com as duas ruas.
  const haste = malha(new CylinderGeometry(0.02, 0.02, 1.15, 8), metalPoste, 'projeta');
  haste.position.set(MEIO + 0.35, Y_CALCADA + 0.575, -MEIO - 0.35);
  g.add(haste);
  // Cada placa tem duas faces (uma de cada lado), para o texto nunca aparecer espelhado.
  const placa = (texto: string, y: number, rotY: number): Object3D => {
    const p = new Object3D();
    const mat = new MeshStandardMaterial({ map: texturaPlacaRua(texto), roughness: 0.4 });
    const frente = new Mesh(new PlaneGeometry(0.62, 0.155), mat);
    frente.position.z = 0.004;
    const verso = new Mesh(frente.geometry, mat);
    verso.rotation.y = Math.PI;
    verso.position.z = -0.004;
    const chapa = malha(new BoxGeometry(0.63, 0.16, 0.006), metalPoste, 'projeta');
    p.add(frente, verso, chapa);
    p.position.set(MEIO + 0.35, Y_CALCADA + y, -MEIO - 0.35);
    p.rotation.y = rotY;
    return p;
  };
  g.add(placa('AV. NORTE–SUL', 1.08, Math.PI / 2), placa('R. LESTE–OESTE', 0.92, 0));

  // Velocidade máxima 40 km/h nas duas vias que chegam (antes do cruzamento)
  const vel = new MeshStandardMaterial({ map: texturaVelocidade(40), roughness: 0.4, transparent: true, alphaTest: 0.5 });
  const discoVel = new PlaneGeometry(0.26, 0.26);
  const pontos: [number, number, number][] = [
    [MEIO + 0.3, -MEIO - 6.5, 0], // via Norte, olhando para quem vem do norte
    [MEIO + 6.5, -MEIO - 0.3, -Math.PI / 2], // via Leste
  ];
  for (const [x, z, rot] of pontos) {
    const p = malha(new CylinderGeometry(0.018, 0.018, 0.9, 8), metalPoste, 'projeta');
    p.position.set(x, Y_CALCADA + 0.45, z);
    const d = new Mesh(discoVel, vel);
    d.position.set(x, Y_CALCADA + 0.85, z);
    d.rotation.y = Math.PI + rot;
    d.castShadow = true;
    g.add(p, d);
  }
  return g;
}

// ──────────────────────────────────────── Semáforo

export interface Semaforo {
  grupo: Object3D;
  /** Materiais das luzes (compartilhados pela frente e pelo verso da caixa). */
  luzes: { vermelho: MeshBasicMaterial; amarelo: MeshBasicMaterial; verde: MeshBasicMaterial };
}

export const COR_LUZ = {
  vermelho: { acesa: 0xff2a1a, apagada: 0x3a1210 },
  amarelo: { acesa: 0xffb300, apagada: 0x3a2c0c },
  verde: { acesa: 0x2bff6a, apagada: 0x0f3018 },
} as const;

export function criarSemaforo(): Semaforo {
  const grupo = new Object3D();
  const poste = malha(new CylinderGeometry(0.035, 0.045, 1.45, 10), metalPoste, 'projeta');
  poste.position.y = 0.725;
  grupo.add(poste);

  // Caixa preta com bordas arredondadas e "bonés" sobre cada luz
  const preto = new MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.2 });
  const caixa = malha(new RoundedBoxGeometry(0.22, 0.58, 0.16, 2, 0.03), preto, 'projeta');
  caixa.position.y = 1.62;
  grupo.add(caixa);
  const bones: BufferGeometry[] = [];
  const luzes = {
    vermelho: new MeshBasicMaterial({ color: COR_LUZ.vermelho.acesa }),
    amarelo: new MeshBasicMaterial({ color: COR_LUZ.amarelo.apagada }),
    verde: new MeshBasicMaterial({ color: COR_LUZ.verde.apagada }),
  };
  const bola = new SphereGeometry(0.058, 16, 10);
  const alturas: [keyof typeof luzes, number][] = [['vermelho', 1.79], ['amarelo', 1.62], ['verde', 1.45]];
  for (const [cor, yy] of alturas) {
    for (const lado of [1, -1]) {
      const l = new Mesh(bola, luzes[cor]);
      l.position.set(0, yy, lado * 0.07);
      l.scale.z = 0.5;
      grupo.add(l);
      bones.push(em(new BoxGeometry(0.16, 0.012, 0.07), 0, yy + 0.07, lado * 0.115));
    }
  }
  grupo.add(malha(fundir(bones), preto, 'projeta'));
  // Placa de fundo (preta com borda amarela, como nos semáforos brasileiros)
  const fundo = malha(new BoxGeometry(0.32, 0.68, 0.01), new MeshLambertMaterial({ color: 0xf2c200 }), 'projeta');
  fundo.position.set(0, 1.62, 0);
  grupo.add(fundo);
  return { grupo, luzes };
}

// ──────────────────────────────────────── Carro (geometrias para InstancedMesh)
// Frente do carro em +z. Comprimento 0,95, largura 0,55 (≈ 4,2 m × 1,8 m na escala do jogo).

export interface PecasCarro {
  /** Lataria (recebe a cor de cada carro). */
  pintura: BufferGeometry;
  vidro: BufferGeometry;
  /** Pneus, para-choques e grade. */
  escuro: BufferGeometry;
  /** Calotas e maçanetas. */
  cromado: BufferGeometry;
  farois: BufferGeometry;
  lanternas: BufferGeometry;
}

/** Cabine de vidro com o teto mais estreito que a base (para-brisa e vigia inclinados). */
function cabine(): BufferGeometry {
  const g = new BoxGeometry(0.47, 0.15, 0.52);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.86);
      p.setZ(i, p.getZ(i) * 0.7 - 0.02);
    }
  }
  g.computeVertexNormals();
  return em(g, 0, 0.305, -0.04);
}

export function gerarPecasCarro(): PecasCarro {
  const rodas: BufferGeometry[] = [];
  const calotas: BufferGeometry[] = [];
  for (const x of [-0.245, 0.245]) {
    for (const z of [-0.31, 0.31]) {
      rodas.push(em(new CylinderGeometry(0.088, 0.088, 0.075, 12), x, 0.088, z, Math.PI / 2));
      calotas.push(em(new CylinderGeometry(0.05, 0.05, 0.08, 8), x, 0.088, z, Math.PI / 2));
    }
  }
  return {
    pintura: fundir([
      em(new RoundedBoxGeometry(0.55, 0.165, 0.95, 2, 0.055), 0, 0.152, 0),
      em(new RoundedBoxGeometry(0.4, 0.035, 0.37, 2, 0.015), 0, 0.392, -0.056),
      // Retrovisores
      em(new BoxGeometry(0.05, 0.035, 0.05), -0.29, 0.255, 0.13),
      em(new BoxGeometry(0.05, 0.035, 0.05), 0.29, 0.255, 0.13),
    ]),
    vidro: fundir([cabine()]),
    escuro: fundir([
      ...rodas,
      em(new BoxGeometry(0.565, 0.055, 0.06), 0, 0.1, 0.465),
      em(new BoxGeometry(0.565, 0.055, 0.06), 0, 0.1, -0.465),
      em(new BoxGeometry(0.26, 0.04, 0.012), 0, 0.17, 0.476),
    ]),
    cromado: fundir([
      ...calotas,
      // Maçanetas
      ...[-0.278, 0.278].flatMap((x) => [em(new BoxGeometry(0.008, 0.012, 0.04), x, 0.2, 0.06), em(new BoxGeometry(0.008, 0.012, 0.04), x, 0.2, -0.14)]),
    ]),
    farois: fundir([
      em(new BoxGeometry(0.11, 0.045, 0.012), -0.19, 0.175, 0.474),
      em(new BoxGeometry(0.11, 0.045, 0.012), 0.19, 0.175, 0.474),
      // Placas (brancas, padrão Mercosul) na frente e atrás
      em(new BoxGeometry(0.14, 0.04, 0.006), 0, 0.1, 0.497),
      em(new BoxGeometry(0.14, 0.04, 0.006), 0, 0.1, -0.497),
    ]),
    lanternas: fundir([
      em(new BoxGeometry(0.12, 0.05, 0.012), -0.19, 0.18, -0.474),
      em(new BoxGeometry(0.12, 0.05, 0.012), 0.19, 0.18, -0.474),
    ]),
  };
}

// ──────────────────────────────────────── Ambulância (mesh individual)
export function criarMeshAmbulancia(vertical: boolean): Object3D {
  const grupo = new Object3D();
  const branco = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
  const vermelho = new MeshStandardMaterial({ color: 0xd50000, roughness: 0.4 });
  const escuro = new MeshLambertMaterial({ color: 0x18191b });
  const vidro = new MeshStandardMaterial({ color: 0x0f1a24, roughness: 0.08, metalness: 0.8 });

  // Furgão: baú alto atrás, cabine com para-brisa na frente
  const bau = malha(new RoundedBoxGeometry(0.6, 0.46, 0.78, 3, 0.04), branco, 'ambos');
  bau.position.set(0, 0.32, -0.15);
  const capo = malha(new RoundedBoxGeometry(0.6, 0.24, 0.38, 3, 0.05), branco, 'ambos');
  capo.position.set(0, 0.2, 0.42);
  const parabrisa = new Mesh(new BoxGeometry(0.54, 0.16, 0.02), vidro);
  parabrisa.position.set(0, 0.42, 0.26);
  parabrisa.rotation.x = -0.35;
  const cabineAlta = malha(new RoundedBoxGeometry(0.6, 0.2, 0.2, 2, 0.03), branco, 'ambos');
  cabineAlta.position.set(0, 0.44, 0.16);
  const faixa = new Mesh(new BoxGeometry(0.61, 0.07, 1.12), vermelho);
  faixa.position.set(0, 0.22, 0.02);
  grupo.add(bau, capo, parabrisa, cabineAlta, faixa);

  const rodas: BufferGeometry[] = [];
  for (const x of [-0.26, 0.26]) for (const z of [-0.36, 0.38]) rodas.push(em(new CylinderGeometry(0.095, 0.095, 0.08, 14), x, 0.095, z, Math.PI / 2));
  grupo.add(malha(fundir(rodas), escuro, 'projeta'));

  // Giroflex vermelho/azul (a cor alterna no código da cena)
  const luz = new Mesh(new BoxGeometry(0.3, 0.06, 0.1), new MeshBasicMaterial({ color: 0xff1744 }));
  luz.name = 'luz';
  luz.position.set(0, 0.575, 0.16);
  grupo.add(luz);
  // Cruz vermelha no teto
  const cruz = new Mesh(fundir([new BoxGeometry(0.28, 0.01, 0.08), new BoxGeometry(0.08, 0.01, 0.28)]), vermelho);
  cruz.position.set(0, 0.555, -0.2);
  grupo.add(cruz);
  if (!vertical) grupo.rotation.y = -Math.PI / 2;
  return grupo;
}

/** Cor do carro (instância). */
export function corDoCarro(id: number): Color {
  return new Color(CORES_CARRO[id % CORES_CARRO.length]);
}
