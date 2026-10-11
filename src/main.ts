// Ponto de entrada: monta o layout (canvas em cima, painel embaixo) e inicia o Phaser.
// Em modo 3D, o cruzamento é renderizado pelo Three.js (Vista3D) dentro do mesmo #palco.

import './ui/estilos.css';
import Phaser from 'phaser';
import dados from './content/fases.json';
import { carregarFases } from './core/fases';
import { definirContexto } from './contexto';
import { carregarProgresso } from './progresso';
import { BootScene } from './scenes/BootScene';
import { CruzamentoScene } from './scenes/CruzamentoScene';
import { FimFaseScene } from './scenes/FimFaseScene';
import { MenuScene } from './scenes/MenuScene';
import { ESCALA, ativarNitidez } from './scenes/resolucao';
import { SelecaoFasesScene } from './scenes/SelecaoFasesScene';
import { ALTURA, LARGURA } from './scenes/vistaCruzamento';
import { registrarServiceWorker } from './sw/registrar';
import { ligarHookDeTeste } from './testeHook';
import { el } from './ui/dom';
import { suportaWebGL } from './scenes/vista3d/detectorWebGL';

const parametros = new URLSearchParams(window.location.search);
const modoTeste = parametros.get('teste') === '1';
if (modoTeste) ligarHookDeTeste();
// Ativa o renderizador 3D se WebGL estiver disponível (desativado com ?modo2d=1).
const modo3D = suportaWebGL() && parametros.get('modo2d') !== '1';

const app = document.getElementById('app') as HTMLElement;
const palco = el('div', { id: 'palco', role: 'img', rotulo: 'Cruzamento visto de cima com os carros e os semáforos' });
const painel = el('main', { id: 'painel' });
app.replaceChildren(palco, painel);

try {
  definirContexto({
    fases: carregarFases(dados),
    progresso: carregarProgresso(),
    painel,
    palco,
    modo3D,
    versao: '',
    // Nos testes E2E dá para acelerar a simulação com ?vel=N.
    velocidade: modoTeste ? Math.min(50, Math.max(1, Number(parametros.get('vel')) || 1)) : 1,
    modoTeste,
  });
} catch (erro) {
  painel.textContent = 'Não foi possível carregar as fases do jogo.';
  throw erro;
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: palco,
  backgroundColor: '#2b3a2f',
  banner: false,
  audio: { noAudio: true }, // os sons são sintetizados com Web Audio, fora do Phaser
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Canvas com ESCALA× mais pixels; as câmeras dão zoom (ver scenes/resolucao.ts).
    width: LARGURA * ESCALA,
    height: ALTURA * ESCALA,
  },
  callbacks: { postBoot: ativarNitidez },
  scene: [BootScene, MenuScene, SelecaoFasesScene, CruzamentoScene, FimFaseScene],
});

// Offline depois do primeiro acesso (só no site publicado; escopo = pasta da release).
registrarServiceWorker();
