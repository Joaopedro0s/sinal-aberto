// Chuva da vista 3D (fase "Tempo chuvoso"): riscos de água caindo em volta da câmera.
// Uma geometria só com ~1.200 segmentos de linha, atualizada a cada quadro.

import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Object3D, type Vector3 } from 'three';

const GOTAS = 1200;
const RAIO = 9;
const ALTURA = 6;
const QUEDA = 9; // unidades por segundo
const VENTO = 1.2;
const COMPRIMENTO = 0.32;

export class Chuva3D {
  private readonly pos: Float32Array;
  private readonly geo: BufferGeometry;
  private readonly linhas: LineSegments;

  constructor(cena: Object3D) {
    this.pos = new Float32Array(GOTAS * 6);
    for (let i = 0; i < GOTAS; i++) this.reposicionar(i, 0, 0, Math.random() * ALTURA);
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.linhas = new LineSegments(this.geo, new LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.55, depthWrite: false }));
    this.linhas.frustumCulled = false;
    cena.add(this.linhas);
  }

  private reposicionar(i: number, cx: number, cz: number, y: number): void {
    const x = cx + (Math.random() * 2 - 1) * RAIO;
    const z = cz + (Math.random() * 2 - 1) * RAIO;
    const k = i * 6;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.pos[k + 3] = x - VENTO * (COMPRIMENTO / QUEDA);
    this.pos[k + 4] = y + COMPRIMENTO;
    this.pos[k + 5] = z;
  }

  /** Faz a chuva cair (tempo real, não acelera com a velocidade do jogo). */
  atualizar(dtMs: number, camera: Vector3): void {
    const dt = Math.min(0.1, dtMs / 1000);
    const dy = QUEDA * dt;
    const dx = VENTO * dt;
    for (let i = 0; i < GOTAS; i++) {
      const k = i * 6;
      this.pos[k + 1] -= dy;
      this.pos[k + 4] -= dy;
      this.pos[k] += dx;
      this.pos[k + 3] += dx;
      // Chegou no chão ou ficou longe da câmera: volta lá para cima, perto dela
      if (this.pos[k + 1] < 0.1 || Math.abs(this.pos[k] - camera.x) > RAIO || Math.abs(this.pos[k + 2] - camera.z) > RAIO) {
        this.reposicionar(i, camera.x, camera.z, ALTURA * (0.6 + Math.random() * 0.4));
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
