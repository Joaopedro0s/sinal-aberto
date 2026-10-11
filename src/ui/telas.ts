// Partes em DOM das telas de menu, seleção de fases e fim de fase.

import type { Fase } from '../core/fases';
import { faseLiberada, type Progresso } from '../progresso';
import { abrirJanela, botao, el, estrelasTexto } from './dom';

export function telaMenu(versao: string, aoJogar: () => void): HTMLElement {
  // Tela de título: o cruzamento ocupa a tela inteira e estes botões ficam por cima,
  // centralizados, como num menu de jogo (ver .tela-menu e #app.modo-menu no CSS).
  return el(
    'div',
    { classe: 'tela tela-menu' },
    el('p', { classe: 'menu-chamada' }, 'Programe os semáforos. Salve o trânsito.'),
    botao('▶ JOGAR', aoJogar, { classe: 'botao-grande botao-jogar', testid: 'btn-jogar' }),
    botao('Como jogar', abrirComoJogar, { classe: 'botao-secundario', testid: 'btn-como-jogar' }),
    el('p', { classe: 'versao', testid: 'versao' }, versao),
  );
}

export function abrirComoJogar(): void {
  const passo = (texto: string) => el('li', {}, texto);
  abrirJanela(
    'Como jogar',
    [
      el(
        'ol',
        { style: 'margin:0;padding-left:1.2em;line-height:1.6;color:var(--texto-fraco)' },
        passo('Toque nos blocos para montar o seu algoritmo, linha por linha.'),
        passo('Toque em ▶ INICIAR TRÁFEGO para soltar os carros.'),
        passo('O algoritmo repete sem parar enquanto a fase dura.'),
        passo('Se der batida, a linha com problema fica vermelha. Conserte e tente de novo!'),
        passo('Use 🔍 PASSO A PASSO para ver uma linha de cada vez.'),
        passo('Toque em { } Ver em JavaScript para ver o seu algoritmo em código de verdade.'),
      ),
      el('p', {}, 'Sinal verde mostra ▲ ABERTO. Sinal vermelho mostra ■ FECHADO.'),
    ],
    { textoBotao: 'Entendi', testid: 'janela-como-jogar' },
  );
}

export function telaSelecao(
  fases: Fase[],
  progresso: Progresso,
  aoEscolher: (id: number) => void,
  aoVoltar: () => void,
): HTMLElement {
  const itens = fases.map((f) => {
    const liberada = faseLiberada(progresso, f.id);
    const estrelas = progresso.estrelas[f.id] ?? 0;
    const b = botao('', () => aoEscolher(f.id), {
      classe: 'botao-fase',
      testid: `btn-fase-${f.id}`,
      rotulo: liberada
        ? `Fase ${f.id}: ${f.titulo}. ${estrelas} de 3 estrelas.`
        : `Fase ${f.id}: ${f.titulo}. Bloqueada: vença a fase ${f.id - 1} antes.`,
    });
    b.append(
      el('span', {}, `${f.id}. ${f.titulo}`),
      el('span', { classe: 'estrelas', 'aria-hidden': 'true' }, liberada ? estrelasTexto(estrelas) : '🔒'),
    );
    b.disabled = !liberada;
    return el('li', {}, b);
  });
  return el(
    'div',
    { classe: 'tela' },
    el('div', { classe: 'mesa-topo' }, botao('←', aoVoltar, { classe: 'botao-voltar', testid: 'btn-voltar', rotulo: 'Voltar ao menu' }), el('h2', {}, 'Escolha a fase')),
    el('ul', { classe: 'lista-fases' }, ...itens),
  );
}

export interface DadosFim {
  fase: Fase;
  estrelas: number;
  ultima: boolean;
  aoProxima: () => void;
  aoRepetir: () => void;
  aoMenu: () => void;
  /** Só na última fase: o JavaScript completo que o jogador consertou. */
  /** Só na última fase: o JavaScript completo que o jogador consertou. */
  jsFinal?: string;
  /** Todas as fases do jogo, para gerar o resumo final. */
  todasFases?: Fase[];
}

export function telaFimFase(d: DadosFim): HTMLElement {
  const container = el(
    'div',
    { classe: 'tela', testid: d.ultima ? 'tela-fim-jogo' : 'tela-fim-fase' },
    el('h2', {}, d.ultima ? 'Você completou o Sinal Aberto!' : `Fase ${d.fase.id} concluída!`),
    el(
      'p',
      { classe: 'estrelas-fim', testid: 'estrelas', rotulo: `${d.estrelas} de 3 estrelas` },
      el('span', { 'aria-hidden': 'true', style: 'font-size:2rem;color:var(--foco);letter-spacing:4px' }, estrelasTexto(d.estrelas)),
    ),
  );

  if (d.ultima && d.todasFases) {
    const resumo = d.todasFases.map(f => el('li', { style: 'margin-bottom: 0.5rem;' }, el('strong', {}, `${f.titulo}: `), f.conceito));
    container.append(
      el('div', { classe: 'cartao', style: 'max-height: 200px; overflow-y: auto; text-align: left;' }, 
        el('h3', { style: 'margin-top: 0;' }, 'O que você aprendeu na jornada:'),
        el('ul', { style: 'padding-left: 1.2rem; font-size: 0.9rem;' }, ...resumo)
      ),
      el('p', { testid: 'revelacao', style: 'color:var(--texto)' }, 'Programação não é só decorar comandos, é resolver problemas. Você já está pensando como alguém da área de tecnologia!'),
      d.jsFinal !== undefined ? el('pre', { classe: 'codigo', testid: 'js-final' }, d.jsFinal) : '',
      el('p', { style: 'color:var(--texto);font-weight:700' }, 'Você leu, criou e consertou código de verdade.')
    );

    const btnCompartilhar = botao('Compartilhar Vitória', async () => {
      const texto = `Venci o Sinal Aberto e virei um Controlador de Trânsito!\n\nVeja o código que eu montei:\n\n${d.jsFinal}\n\nJogue também: https://joaopedro0s.github.io/sinal-aberto`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Sinal Aberto - Vitória!', text: texto });
        } catch { /* ignorar cancelamento */ }
      } else {
        await navigator.clipboard.writeText(texto);
        btnCompartilhar.textContent = 'Copiado!';
        setTimeout(() => { btnCompartilhar.textContent = 'Compartilhar Vitória'; }, 3000);
      }
    }, { classe: 'botao-secundario', testid: 'btn-compartilhar' });

    container.append(
      btnCompartilhar,
      botao('Voltar ao menu principal', d.aoMenu, { classe: 'botao-grande', testid: 'btn-menu' }),
      botao('Melhorar minha pontuação', d.aoRepetir, { classe: 'botao-secundario', testid: 'btn-repetir' })
    );

  } else {
    container.append(
      el('div', { classe: 'cartao' }, el('p', { testid: 'revelacao', style: 'color:var(--texto)' }, d.fase.revelacao)),
      el('p', {}, `O que você aprendeu: ${d.fase.conceito}`),
      botao('Próxima fase ➜', d.aoProxima, { classe: 'botao-grande', testid: 'btn-proxima' }),
      botao('Jogar esta fase de novo', d.aoRepetir, { classe: 'botao-secundario', testid: 'btn-repetir' })
    );
  }

  return container;
}
