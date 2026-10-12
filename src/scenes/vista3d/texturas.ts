// Texturas geradas em código (canvas 2D) para a vista 3D.
// Nada é baixado: o asfalto, a calçada, a grama, as placas de rua e os letreiros das lojas
// são desenhados na hora em que a cena abre. Mantém o jogo 100% offline e sem licenças
// de terceiros.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Gerador pseudoaleatório com semente (a textura sai sempre igual). */
function rng(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function novoCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finalizar(c: HTMLCanvasElement, repetir = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repetir) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Granulado: muitos pontinhos claros e escuros sobre uma cor base. */
function granular(g: CanvasRenderingContext2D, w: number, h: number, base: string, qtd: number, forca: number, r: () => number): void {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < qtd; i++) {
    const claro = r() < 0.5;
    g.fillStyle = claro ? `rgba(255,255,255,${r() * forca})` : `rgba(0,0,0,${r() * forca})`;
    const s = 1 + r() * 2;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

const cache = new Map<string, Texture>();
function memo(chave: string, criar: () => Texture): Texture {
  let t = cache.get(chave);
  if (!t) {
    t = criar();
    cache.set(chave, t);
  }
  return t;
}

/** Asfalto: cinza escuro granulado, com manchas de óleo e remendos. */
export function texturaAsfalto(): Texture {
  return memo('asfalto', () => {
    const [c, g] = novoCanvas(256, 256);
    const r = rng(11);
    granular(g, 256, 256, '#45484d', 7000, 0.12, r);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(20,20,24,${0.08 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * 256, r() * 256, 10 + r() * 30, 6 + r() * 16, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // Rachaduras finas
    g.strokeStyle = 'rgba(25,25,28,0.5)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      let x = r() * 256;
      let y = r() * 256;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return finalizar(c);
  });
}

/** Calçada: lajotas de concreto 4 × 4 com rejunte. */
export function texturaCalcada(): Texture {
  return memo('calcada', () => {
    const [c, g] = novoCanvas(256, 256);
    const r = rng(23);
    granular(g, 256, 256, '#b9b4ab', 5000, 0.12, r);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const v = Math.floor((r() - 0.5) * 18);
        g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 120})` : `rgba(0,0,0,${-v / 120})`;
        g.fillRect(i * 64, j * 64, 64, 64);
      }
    }
    g.strokeStyle = 'rgba(70,66,60,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 256);
      g.moveTo(0, i * 64);
      g.lineTo(256, i * 64);
      g.stroke();
    }
    return finalizar(c);
  });
}

/** Grama: verde com variação de tom. */
export function texturaGrama(): Texture {
  return memo('grama', () => {
    const [c, g] = novoCanvas(128, 128);
    const r = rng(5);
    granular(g, 128, 128, '#5b8a3c', 4000, 0.25, r);
    return finalizar(c);
  });
}

/** Placa azul de nome de rua, no padrão brasileiro (texto branco, borda branca). */
export function texturaPlacaRua(texto: string): Texture {
  return memo(`placa:${texto}`, () => {
    const [c, g] = novoCanvas(512, 128);
    g.fillStyle = '#1f4fa3';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 492, 108);
    g.fillStyle = '#ffffff';
    g.font = 'bold 58px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, 256, 68, 470);
    return finalizar(c, false);
  });
}

/** Placa de velocidade máxima (círculo vermelho, número preto). */
export function texturaVelocidade(kmh: number): Texture {
  return memo(`vel:${kmh}`, () => {
    const [c, g] = novoCanvas(128, 128);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d32f2f';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#111';
    g.font = 'bold 50px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(kmh), 64, 68);
    return finalizar(c, false);
  });
}

/** Letreiros das lojas: todos numa só imagem (uma faixa por loja), para desenhar em 1 chamada. */
export const LOJAS: { nome: string; fundo: string; letra: string }[] = [
  { nome: 'MERCADO', fundo: '#d32f2f', letra: '#ffffff' },
  { nome: 'PADARIA', fundo: '#8d5524', letra: '#ffe9c4' },
  { nome: 'FARMÁCIA', fundo: '#ffffff', letra: '#1b8a3a' },
  { nome: 'LANCHES', fundo: '#ffb300', letra: '#5a2600' },
  { nome: 'BANCO', fundo: '#0d47a1', letra: '#ffffff' },
  { nome: 'ÓTICA', fundo: '#212121', letra: '#ffd54f' },
  { nome: 'PET SHOP', fundo: '#00897b', letra: '#ffffff' },
  { nome: 'PAPELARIA', fundo: '#6a1b9a', letra: '#ffffff' },
];

export function texturaLetreiros(): Texture {
  return memo('letreiros', () => {
    const alturaFaixa = 64;
    const [c, g] = novoCanvas(512, alturaFaixa * LOJAS.length);
    LOJAS.forEach((l, i) => {
      const y = i * alturaFaixa;
      g.fillStyle = l.fundo;
      g.fillRect(0, y, 512, alturaFaixa);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, y + alturaFaixa - 6, 512, 6);
      g.fillStyle = l.letra;
      g.font = 'bold 42px Arial, Helvetica, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l.nome, 256, y + alturaFaixa / 2 + 2, 480);
    });
    return finalizar(c, false);
  });
}

/** Mancha de luz suave (círculo com degradê): fachos dos faróis, luz dos postes e brilho dos semáforos. */
export function texturaMancha(): Texture {
  return memo('mancha', () => {
    const [c, g] = novoCanvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return finalizar(c, false);
  });
}
