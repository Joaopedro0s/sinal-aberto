// Hora do dia e clima da vista 3D. As fases mais difíceis ficam mais tarde:
//   fases 1–4: dia de sol · 5–6: fim de tarde (horário de pico) · 7: chuva · 8: noite.
// Cada ambiente é só um conjunto de números (cores, luzes, nevoeiro): a cidade é a mesma.

export type Ambiente = 'dia' | 'entardecer' | 'chuva' | 'noite';

export interface Preset {
  ceu: { topo: number; horizonte: number; brilho: number; forcaBrilho: number };
  sol: { cor: number; intensidade: number; direcao: { x: number; y: number; z: number } };
  hemisferio: { ceu: number; chao: number; intensidade: number };
  nevoa: { perto: number; longe: number };
  exposicao: number;
  /** Força dos reflexos (lataria, vidros). */
  reflexos: number;
  /** Fração das janelas com a luz acesa. */
  janelasAcesas: number;
  /** Postes, letreiros, vitrines e faróis acesos. */
  luzesAcesas: boolean;
  /** Manchas de luz dos postes no chão (só faz sentido no escuro). */
  luzNoChao: number;
  estrelas: boolean;
  chuva: boolean;
}

export const PRESETS: Record<Ambiente, Preset> = {
  dia: {
    ceu: { topo: 0x3d7fc4, horizonte: 0xd6e6f0, brilho: 0xfff4dc, forcaBrilho: 0.8 },
    sol: { cor: 0xffeccc, intensidade: 2.6, direcao: { x: -10, y: 14, z: 5 } },
    hemisferio: { ceu: 0xcfe4ff, chao: 0x6e6552, intensidade: 1.1 },
    nevoa: { perto: 14, longe: 70 },
    exposicao: 1.0,
    reflexos: 0.5,
    janelasAcesas: 0.12,
    luzesAcesas: false,
    luzNoChao: 0,
    estrelas: false,
    chuva: false,
  },
  entardecer: {
    ceu: { topo: 0x3a4f8f, horizonte: 0xf2a86b, brilho: 0xffc66e, forcaBrilho: 1 },
    // Sol baixo a noroeste: sombras compridas e luz alaranjada
    sol: { cor: 0xffa860, intensidade: 2.4, direcao: { x: -12, y: 4.5, z: -6 } },
    hemisferio: { ceu: 0xc4b0dc, chao: 0x5a4a3c, intensidade: 1.0 },
    nevoa: { perto: 12, longe: 60 },
    exposicao: 1.05,
    reflexos: 0.4,
    janelasAcesas: 0.3,
    luzesAcesas: true,
    luzNoChao: 0.25,
    estrelas: false,
    chuva: false,
  },
  chuva: {
    ceu: { topo: 0x6b7680, horizonte: 0xa4adb5, brilho: 0xb8c0c7, forcaBrilho: 0.2 },
    sol: { cor: 0xdfe6ee, intensidade: 0.9, direcao: { x: -6, y: 14, z: 4 } },
    hemisferio: { ceu: 0xc4ced8, chao: 0x4b4f52, intensidade: 1.3 },
    nevoa: { perto: 6, longe: 42 },
    exposicao: 0.95,
    reflexos: 0.7,
    janelasAcesas: 0.3,
    luzesAcesas: true,
    luzNoChao: 0.3,
    estrelas: false,
    chuva: true,
  },
  noite: {
    ceu: { topo: 0x050a1c, horizonte: 0x1d2a4a, brilho: 0x9fb4e6, forcaBrilho: 0.35 },
    // "Sol" = lua: luz fraca e azulada, ainda com sombras suaves
    sol: { cor: 0x9db4ff, intensidade: 0.9, direcao: { x: 6, y: 12, z: -8 } },
    hemisferio: { ceu: 0x3a4f80, chao: 0x1c1d22, intensidade: 1.1 },
    nevoa: { perto: 10, longe: 55 },
    exposicao: 1.3,
    reflexos: 0.2,
    janelasAcesas: 0.5,
    luzesAcesas: true,
    luzNoChao: 0.75,
    estrelas: true,
    chuva: false,
  },
};

/** Ambiente de cada fase: quanto mais difícil, mais tarde (e a fase de chuva tem chuva). */
export function ambienteDaFase(fase: { id: number; transito: { clima?: string } }): Ambiente {
  if (fase.transito.clima === 'chuva') return 'chuva';
  if (fase.id >= 8) return 'noite';
  if (fase.id >= 5) return 'entardecer';
  return 'dia';
}
