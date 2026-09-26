/*
  voz.js — Narração Devocional Humanizada com Expressão e Controlo Personalizado
  Ministério Pão Diário

  Recursos implementados:
  - Prosódia e ritmo devocional sereno (ritmo meditativo padrão: 0.88x, tom suave: 0.98).
  - Pausas contemplativas naturais entre título, leitura da Palavra, oração e reflexão.
  - Conversor de abreviações e passagens bíblicas para pronúncia humanizada (ex: "capítulo e versículo").
  - Remoção inteligente de emojis na fala para evitar soletrações mecânicas.
  - Painel de ajustes de áudio interativo: escolha de voz, velocidade, tom, volume e estilo.
  - Presets rápidos de 1 clique (Padrão Devocional, Oração Serena, Leitura Fluida).
  - Suporte completo a Reproduzir, Pausar, Retomar e Parar.
  - Destaque visual sincronizado (realce suave) no versículo e parágrafo em leitura.
  - Persistência das preferências do utilizador em localStorage.
  - Prevenção ativa do bug de corte de áudio da Web Speech API.
*/

(function () {
  'use strict';

  var STORAGE_KEY = 'pao_diario_audio_config_v4';

  var CONFIG_DEFAULT = {
    rate: 0.88,               // Ritmo meditativo e compassado
    pitch: 0.98,              // Tom ligeiramente mais aveludado e acolhedor
    volume: 1.0,              // Volume total
    voiceURI: '',             // Melhor voz natural detetada automaticamente
    pausasMeditativas: true,  // Pausas silenciosas de reflexão entre blocos
    humanizarReferencias: true,// "Romanos 1:14" -> "Romanos, capítulo 1, versículo 14"
    destacarTexto: true       // Iluminação visual do parágrafo lido
  };

  var config = carregarConfig();
  var vozesCache = [];
  var vozesPronto = false;

  // Estado da reprodução
  var estado = {
    status: 'idle', // 'idle' | 'playing' | 'paused'
    segmentos: [],
    indiceAtual: -1,
    utteranceAtual: null,
    timerPausa: null,
    heartbeatTimer: null,
    elementoDestacado: null
  };

  // ==========================================================================
  // CONFIGURAÇÃO & PERSISTÊNCIA
  // ==========================================================================
  function carregarConfig() {
    try {
      var guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        var parsed = JSON.parse(guardado);
        return Object.assign({}, CONFIG_DEFAULT, parsed);
      }
    } catch (e) {
      console.warn('Erro ao carregar preferências de áudio:', e);
    }
    return Object.assign({}, CONFIG_DEFAULT);
  }

  function salvarConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Erro ao guardar preferências de áudio:', e);
    }
  }

  // ==========================================================================
  // GESTÃO DE VOZES E DETEÇÃO DA MELHOR VOZ NATURAL
  // ==========================================================================
  function atualizarVozes() {
    if (!('speechSynthesis' in window)) return;
    var list = window.speechSynthesis.getVoices();
    if (list && list.length > 0) {
      vozesCache = list;
      vozesPronto = true;
    }
  }

  function classificarVoz(v) {
    var pontuacao = 0;
    var lang = (v.lang || '').toLowerCase();
    var nome = (v.name || '').toLowerCase();

    // Prioridade máxima: Português
    if (lang === 'pt-pt') pontuacao += 100;
    else if (lang === 'pt-br') pontuacao += 90;
    else if (lang.indexOf('pt') === 0) pontuacao += 80;
    else return -100; // Não-português

    // Bónus para vozes naturais e neurais modernas
    if (nome.indexOf('natural') !== -1) pontuacao += 50;
    if (nome.indexOf('neural') !== -1) pontuacao += 45;
    if (nome.indexOf('online') !== -1) pontuacao += 30;
    if (nome.indexOf('raquel') !== -1 || nome.indexOf('duarte') !== -1) pontuacao += 25;
    if (nome.indexOf('francisca') !== -1 || nome.indexOf('antonio') !== -1 || nome.indexOf('antónio') !== -1) pontuacao += 25;
    if (nome.indexOf('google') !== -1) pontuacao += 20;
    if (nome.indexOf('premium') !== -1 || nome.indexOf('enhanced') !== -1) pontuacao += 20;

    return pontuacao;
  }

  function obterMelhorVoz() {
    atualizarVozes();
    if (!vozesCache || vozesCache.length === 0) return null;

    // Se o utilizador já escolheu uma voz específica
    if (config.voiceURI) {
      var encontrada = vozesCache.find(function (v) { return v.voiceURI === config.voiceURI; });
      if (encontrada) return encontrada;
    }

    // Selecionar a melhor voz portuguesa pelo algoritmo de qualidade
    var vozesPT = vozesCache
      .filter(function (v) { return classificarVoz(v) > 0; })
      .sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    return vozesPT.length > 0 ? vozesPT[0] : (vozesCache[0] || null);
  }

  // ==========================================================================
  // HUMANIZAÇÃO DO TEXTO E REFERÊNCIAS BÍBLICAS
  // ==========================================================================
  function limparEmojis(str) {
    if (!str) return '';
    return str
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      .replace(/[\u2600-\u27BF]/g, '')
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/[🌱📖💡✨✝️🕊️🙏🍞💧🔥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function humanizarReferenciaBiblica(ref) {
    if (!ref || !config.humanizarReferencias) return ref || '';
    var r = ' ' + ref.trim() + ' ';

    var mapeamento = [
      [/\b1\s*Cor[íi]ntios\b/gi, 'Primeira Coríntios'],
      [/\b2\s*Cor[íi]ntios\b/gi, 'Segunda Coríntios'],
      [/\b1\s*Co\b/gi, 'Primeira Coríntios'],
      [/\b2\s*Co\b/gi, 'Segunda Coríntios'],
      [/\b1\s*Ts\b|\b1\s*Tessalonicenses\b/gi, 'Primeira Tessalonicenses'],
      [/\b2\s*Ts\b|\b2\s*Tessalonicenses\b/gi, 'Segunda Tessalonicenses'],
      [/\b1\s*Tm\b|\b1\s*Tim[óo]teo\b/gi, 'Primeira Timóteo'],
      [/\b2\s*Tm\b|\b2\s*Tim[óo]teo\b/gi, 'Segunda Timóteo'],
      [/\b1\s*Pe\b|\b1\s*Pedro\b/gi, 'Primeira Pedro'],
      [/\b2\s*Pe\b|\b2\s*Pedro\b/gi, 'Segunda Pedro'],
      [/\b1\s*Jo\b|\b1\s*Jo[ãa]o\b/gi, 'Primeira João'],
      [/\b2\s*Jo\b|\b2\s*Jo[ãa]o\b/gi, 'Segunda João'],
      [/\b3\s*Jo\b|\b3\s*Jo[ãa]o\b/gi, 'Terceira João'],
      [/\b1\s*Sm\b|\b1\s*Samuel\b/gi, 'Primeiro Samuel'],
      [/\b2\s*Sm\b|\b2\s*Samuel\b/gi, 'Segundo Samuel'],
      [/\b1\s*Rs\b|\b1\s*Reis\b/gi, 'Primeiro Reis'],
      [/\b2\s*Rs\b|\b2\s*Reis\b/gi, 'Segundo Reis'],
      [/\b1\s*Cr\b|\b1\s*Cr[ôo]nicas\b/gi, 'Primeiro Crônicas'],
      [/\b2\s*Cr\b|\b2\s*Cr[ôo]nicas\b/gi, 'Segundo Crônicas'],
      [/\bSl\b|\bSal\b/gi, 'Salmo'],
      [/\bPv\b|\bProv\b/gi, 'Provérbios'],
      [/\bMt\b|\bMat\b/gi, 'Mateus'],
      [/\bMc\b|\bMar\b/gi, 'Marcos'],
      [/\bLc\b|\bLuc\b/gi, 'Lucas'],
      [/\bJo\b/gi, 'João'],
      [/\bAt\b|\bAct\b/gi, 'Atos'],
      [/\bRm\b|\bRom\b/gi, 'Romanos'],
      [/\bGl\b|\bGal\b/gi, 'Gálatas'],
      [/\bEf\b/gi, 'Efésios'],
      [/\bFp\b|\bFil\b/gi, 'Filipenses'],
      [/\bCl\b|\bCol\b/gi, 'Colossenses'],
      [/\bHb\b|\bHeb\b/gi, 'Hebreus'],
      [/\bTg\b/gi, 'Tiago'],
      [/\bAp\b|\bApoc\b/gi, 'Apocalipse'],
      [/\bGn\b|\bGen\b/gi, 'Gênesis'],
      [/\bÊx\b|\bEx\b/gi, 'Êxodo']
    ];

    mapeamento.forEach(function (par) {
      r = r.replace(par[0], par[1]);
    });

    // Formatação de capítulos e versículos
    r = r.replace(/(\d+)\s*:\s*(\d+)\s*[-–—]\s*(\d+)/g, 'capítulo $1, versículos $2 a $3');
    r = r.replace(/(\d+)\s*:\s*(\d+)/g, 'capítulo $1, versículo $2');

    return r.trim();
  }

  // ==========================================================================
  // CONSTRUÇÃO DE SEGMENTOS DEVOCIONAIS COM EMOÇÃO
  // ==========================================================================
  function montarSegmentosDevocionais() {
    var reader = document.getElementById('reader');
    if (!reader) return [];

    var segmentos = [];

    // 1. TÍTULO
    var elTitulo = reader.querySelector('.rh h1');
    var tituloTexto = elTitulo ? limparEmojis(elTitulo.textContent) : '';
    if (tituloTexto) {
      segmentos.push({
        id: 'titulo',
        elemento: elTitulo,
        label: 'Título',
        texto: 'Ministério Pão Diário. Mensagem: ' + tituloTexto + '.',
        pausa: config.pausasMeditativas ? 650 : 250,
        rateFactor: 0.98,
        pitchFactor: 1.01
      });
    }

    // 2. REFERÊNCIA BÍBLICA E VERSÍCULO SAGRADO
    var elVbox = reader.querySelector('.vbox');
    var elAline = reader.querySelector('.vbox .aline') || reader.querySelector('.rh .bdgt');
    var refBruta = elAline ? elAline.textContent.replace(/^[-—\s]+/, '').trim() : '';
    var refHumanizada = humanizarReferenciaBiblica(refBruta);

    var versiculoTexto = '';
    if (elVbox) {
      // Clona para remover .aline e extrair só o versículo
      var cloneVbox = elVbox.cloneNode(true);
      var alineNoClone = cloneVbox.querySelector('.aline');
      if (alineNoClone) alineNoClone.remove();
      versiculoTexto = limparEmojis(cloneVbox.textContent).replace(/^["“]+|["”]+$/g, '').trim();
    }

    if (refHumanizada) {
      segmentos.push({
        id: 'ref',
        elemento: elVbox || elAline,
        label: 'Leitura Bíblica',
        texto: 'Leitura da Palavra de Deus em ' + refHumanizada + ':',
        pausa: config.pausasMeditativas ? 450 : 200,
        rateFactor: 0.94,
        pitchFactor: 0.99
      });
    }

    if (versiculoTexto) {
      segmentos.push({
        id: 'versiculo',
        elemento: elVbox,
        label: 'Versículo',
        texto: '“' + versiculoTexto + '”',
        pausa: config.pausasMeditativas ? 900 : 350, // Pausa solene após a Palavra
        rateFactor: 0.90, // Leitura serena e reverente
        pitchFactor: 0.97
      });
    }

    // 3. CORPO DA MENSAGEM (PARÁGRAFOS)
    var elMtxt = reader.querySelector('.mtxt');
    if (elMtxt) {
      var ps = elMtxt.querySelectorAll('p');
      var paragrafos = [];
      if (ps && ps.length > 0) {
        ps.forEach(function (p) { paragrafos.push({ el: p, txt: p.textContent.trim() }); });
      } else {
        var textoGeral = elMtxt.textContent.trim();
        textoGeral.split(/\n\s*\n/).forEach(function (bloco) {
          if (bloco.trim()) paragrafos.push({ el: elMtxt, txt: bloco.trim() });
        });
      }

      paragrafos.forEach(function (item, idx) {
        var txt = limparEmojis(item.txt);
        if (!txt) return;

        // Se for momento de oração
        if (/^ora[çc][ãa]o\s*:/i.test(txt)) {
          var corpoOracao = txt.replace(/^ora[çc][ãa]o\s*:\s*/i, '').trim();
          segmentos.push({
            id: 'oracao_intro',
            elemento: item.el,
            label: 'Oração',
            texto: 'Momento de oração:',
            pausa: config.pausasMeditativas ? 500 : 200,
            rateFactor: 0.92,
            pitchFactor: 0.99
          });
          segmentos.push({
            id: 'oracao_corpo',
            elemento: item.el,
            label: 'Oração',
            texto: corpoOracao,
            pausa: config.pausasMeditativas ? 850 : 300,
            rateFactor: 0.86, // Oração íntima e acolhedora
            pitchFactor: 0.96
          });
        } else {
          segmentos.push({
            id: 'paragrafo_' + idx,
            elemento: item.el,
            label: 'Reflexão',
            texto: txt,
            pausa: config.pausasMeditativas ? 550 : 200,
            rateFactor: 1.0,
            pitchFactor: 1.0
          });
        }
      });
    }

    // 4. HORA DE REFLETIR (MEDITAÇÃO FINAL)
    var elMbox = reader.querySelector('.mbox');
    var elMboxP = reader.querySelector('.mbox p');
    var meditacaoTexto = elMboxP ? limparEmojis(elMboxP.textContent) : '';
    if (meditacaoTexto) {
      segmentos.push({
        id: 'meditacao_intro',
        elemento: elMbox,
        label: 'Hora de Refletir',
        texto: 'Hora de refletir:',
        pausa: config.pausasMeditativas ? 500 : 200,
        rateFactor: 0.94,
        pitchFactor: 1.02
      });
      segmentos.push({
        id: 'meditacao_corpo',
        elemento: elMbox,
        label: 'Hora de Refletir',
        texto: meditacaoTexto,
        pausa: config.pausasMeditativas ? 900 : 300,
        rateFactor: 0.88,
        pitchFactor: 0.98
      });
    }

    // 5. ENCERRAMENTO COM BÊNÇÃO
    segmentos.push({
      id: 'bencao_final',
      elemento: null,
      label: 'Conclusão',
      texto: 'Que a paz e a bênção de Deus acompanhem o seu dia. Amém.',
      pausa: 200,
      rateFactor: 0.88,
      pitchFactor: 0.97
    });

    return segmentos;
  }

  // ==========================================================================
  // DESTAQUE VISUAL (REALCE SUAVE DE LEITURA)
  // ==========================================================================
  function destacarElemento(el) {
    removerDestaque();
    if (!el || !config.destacarTexto) return;
    el.classList.add('voz-destaque-ativo');
    estado.elementoDestacado = el;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
  }

  function removerDestaque() {
    if (estado.elementoDestacado) {
      estado.elementoDestacado.classList.remove('voz-destaque-ativo');
      estado.elementoDestacado = null;
    }
  }

  // ==========================================================================
  // CONTROLO DE REPRODUÇÃO & PREVENÇÃO DE BUG DO WEBSPEECH
  // ==========================================================================
  function iniciarHeartbeat() {
    pararHeartbeat();
    // Previne que o Chrome/Edge silencie o áudio aos 14 segundos em leituras longas
    estado.heartbeatTimer = setInterval(function () {
      if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 9000);
  }

  function pararHeartbeat() {
    if (estado.heartbeatTimer) {
      clearInterval(estado.heartbeatTimer);
      estado.heartbeatTimer = null;
    }
  }

  function tocarSegmento(indice) {
    if (indice >= estado.segmentos.length) {
      finalizarLeituraCompleta();
      return;
    }

    estado.indiceAtual = indice;
    var seg = estado.segmentos[indice];

    destacarElemento(seg.elemento);
    atualizarBarraEstado(seg.label, indice + 1, estado.segmentos.length);

    var ut = new SpeechSynthesisUtterance(seg.texto);
    var voz = obterMelhorVoz();
    if (voz) ut.voice = voz;

    // Aplica parâmetros personalizados multiplicados pelo fator de expressão do segmento
    var baseRate = parseFloat(config.rate) || 0.88;
    var basePitch = parseFloat(config.pitch) || 0.98;
    var baseVolume = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;

    ut.rate = Math.max(0.5, Math.min(2.0, baseRate * (seg.rateFactor || 1.0)));
    ut.pitch = Math.max(0.5, Math.min(1.5, basePitch * (seg.pitchFactor || 1.0)));
    ut.volume = Math.max(0.0, Math.min(1.0, baseVolume));
    ut.lang = voz ? voz.lang : 'pt-PT';

    estado.utteranceAtual = ut;

    ut.onend = function () {
      if (estado.status !== 'playing') return;
      var pausa = seg.pausa || 300;
      estado.timerPausa = setTimeout(function () {
        if (estado.status === 'playing') {
          tocarSegmento(indice + 1);
        }
      }, pausa);
    };

    ut.onerror = function (e) {
      console.warn('Voz devocional (aviso):', e.error);
      if (estado.status !== 'playing') return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;

      // Avança para o próximo segmento mesmo com erro transitório
      setTimeout(function () {
        if (estado.status === 'playing') tocarSegmento(indice + 1);
      }, 200);
    };

    window.speechSynthesis.speak(ut);
  }

  function iniciarLeitura() {
    if (!('speechSynthesis' in window)) {
      alert('O seu navegador não suporta a síntese de voz (Web Speech API).');
      return;
    }

    // Se já estiver pausado, retoma
    if (estado.status === 'paused') {
      retomarLeitura();
      return;
    }

    window.speechSynthesis.cancel();
    if (estado.timerPausa) clearTimeout(estado.timerPausa);

    estado.segmentos = montarSegmentosDevocionais();
    if (!estado.segmentos || estado.segmentos.length === 0) {
      alert('Não foi possível encontrar o texto da mensagem para narrar.');
      return;
    }

    estado.status = 'playing';
    iniciarHeartbeat();
    atualizarBotoesUI();

    if (!vozesPronto) {
      atualizarVozes();
      setTimeout(function () {
        tocarSegmento(0);
      }, 150);
    } else {
      tocarSegmento(0);
    }
  }

  function pausarLeitura() {
    if (estado.status === 'playing') {
      estado.status = 'paused';
      if (estado.timerPausa) clearTimeout(estado.timerPausa);
      window.speechSynthesis.pause();
      pararHeartbeat();
      atualizarBotoesUI();
      atualizarBarraEstado('Pausado', estado.indiceAtual + 1, estado.segmentos.length);
    }
  }

  function retomarLeitura() {
    if (estado.status === 'paused') {
      estado.status = 'playing';
      iniciarHeartbeat();
      atualizarBotoesUI();
      window.speechSynthesis.resume();
      // Verificação para navegadores que não disparam resume corretamente
      setTimeout(function () {
        if (!window.speechSynthesis.speaking && estado.status === 'playing') {
          tocarSegmento(estado.indiceAtual >= 0 ? estado.indiceAtual : 0);
        }
      }, 250);
    }
  }

  function pararLeitura() {
    estado.status = 'idle';
    estado.indiceAtual = -1;
    estado.utteranceAtual = null;

    if (estado.timerPausa) clearTimeout(estado.timerPausa);
    pararHeartbeat();
    removerDestaque();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    atualizarBotoesUI();
    ocultarBarraEstado();
  }

  function finalizarLeituraCompleta() {
    pararLeitura();
    var pill = document.getElementById('vozStatusPill');
    if (pill) {
      pill.style.display = 'inline-flex';
      var txt = document.getElementById('vozStatusTexto');
      if (txt) txt.textContent = '✨ Narração concluída';
      setTimeout(function () {
        if (estado.status === 'idle') pill.style.display = 'none';
      }, 4000);
    }
  }

  // ==========================================================================
  // INTERFACE DE UTILIZADOR (BARRA & PAINEL DE AJUSTES)
  // ==========================================================================
  function injetarEstilos() {
    if (document.getElementById('voz-audio-styles')) return;

    var css = `
      /* Controlo Principal de Narração */
      .voz-player-wrapper {
        margin-top: 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-family: sans-serif;
      }
      .voz-bar-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .voz-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border-radius: 24px;
        font-size: 0.84rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        outline: none;
        font-family: inherit;
      }
      .voz-btn:focus-visible {
        box-shadow: 0 0 0 3px #f5b942;
      }
      .voz-btn-primary {
        background: #f5b942;
        color: #3d1a00;
        box-shadow: 0 3px 12px rgba(0,0,0,0.25);
      }
      .voz-btn-primary:hover {
        background: #fff;
        transform: translateY(-1px);
      }
      .voz-btn-secondary {
        background: rgba(255,255,255,0.18);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.4);
      }
      .voz-btn-secondary:hover {
        background: rgba(255,255,255,0.28);
      }
      .voz-btn-settings {
        background: transparent;
        color: rgba(255,255,255,0.85);
        border: 1px solid rgba(255,255,255,0.3);
        padding: 8px 14px;
      }
      .voz-btn-settings:hover, .voz-btn-settings.active {
        background: rgba(255,255,255,0.2);
        color: #fff;
        border-color: #f5b942;
      }

      /* Indicador de Estado / Progresso */
      .voz-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(245,185,66,0.4);
        padding: 5px 14px;
        border-radius: 20px;
        font-size: 0.76rem;
        color: #fdebc8;
        max-width: fit-content;
      }
      .voz-pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f5b942;
        box-shadow: 0 0 8px #f5b942;
        animation: vozPulse 1.4s infinite ease-in-out;
      }
      @keyframes vozPulse {
        0%, 100% { transform: scale(0.85); opacity: 0.7; }
        50% { transform: scale(1.3); opacity: 1; }
      }

      /* Painel de Ajustes Retrátil */
      .voz-settings-panel {
        background: rgba(35, 14, 2, 0.95);
        border: 1px solid rgba(245, 185, 66, 0.45);
        border-radius: 16px;
        padding: 18px 20px;
        margin-top: 10px;
        color: #fff8ee;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        backdrop-filter: blur(8px);
        max-width: 640px;
        animation: vozFadeIn 0.25s ease-out;
      }
      @keyframes vozFadeIn {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .voz-panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.12);
        padding-bottom: 10px;
        margin-bottom: 14px;
      }
      .voz-panel-title {
        font-size: 0.92rem;
        font-weight: 700;
        color: #f5b942;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .voz-panel-close {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.7);
        font-size: 1.1rem;
        cursor: pointer;
        padding: 4px 8px;
      }
      .voz-panel-close:hover { color: #fff; }

      .voz-setting-row {
        margin-bottom: 14px;
      }
      .voz-setting-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.8rem;
        font-weight: 600;
        margin-bottom: 6px;
        color: #f7d5a5;
      }
      .voz-badge-val {
        font-size: 0.72rem;
        background: rgba(245,185,66,0.2);
        border: 1px solid rgba(245,185,66,0.35);
        color: #fff;
        padding: 2px 8px;
        border-radius: 12px;
      }

      /* Presets Devocionais */
      .voz-presets-wrap {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .voz-preset-chip {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.2);
        color: #f0dbc0;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .voz-preset-chip:hover {
        background: rgba(255,255,255,0.16);
      }
      .voz-preset-chip.active {
        background: #c8790a;
        color: #fff;
        border-color: #f5b942;
        box-shadow: 0 0 8px rgba(245,185,66,0.3);
      }

      .voz-select {
        width: 100%;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.25);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.82rem;
        outline: none;
        cursor: pointer;
      }
      .voz-select option {
        background: #2a1100;
        color: #fff;
      }
      .voz-range {
        width: 100%;
        accent-color: #f5b942;
        cursor: pointer;
      }
      .voz-range-sub {
        display: flex;
        justify-content: space-between;
        font-size: 0.68rem;
        color: rgba(255,255,255,0.5);
        margin-top: 2px;
      }

      .voz-checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;
        color: #eed5be;
        cursor: pointer;
        margin-top: 6px;
      }
      .voz-checkbox-row input {
        accent-color: #f5b942;
        cursor: pointer;
      }

      .voz-panel-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.12);
        flex-wrap: wrap;
        gap: 8px;
      }
      .voz-btn-link {
        background: none;
        border: none;
        color: #f5b942;
        font-size: 0.75rem;
        cursor: pointer;
        text-decoration: underline;
        padding: 4px;
      }
      .voz-btn-link:hover { color: #fff; }

      /* Realce Suave no Leitor */
      .voz-destaque-ativo {
        transition: all 0.35s ease;
        box-shadow: 0 0 0 3px rgba(245, 185, 66, 0.45), 0 6px 20px rgba(200, 121, 10, 0.15) !important;
        background-color: #fff5e3 !important;
        border-radius: 8px;
      }
    `;

    var style = document.createElement('style');
    style.id = 'voz-audio-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function criarEstruturaUI() {
    var wrapper = document.createElement('div');
    wrapper.className = 'voz-player-wrapper';

    wrapper.innerHTML = `
      <div class="voz-bar-controls">
        <button type="button" class="voz-btn voz-btn-primary" id="vozBtnPlay" title="Ouvir reflexão narrada">
          <span id="vozPlayIcon">▶</span>
          <span id="vozPlayTexto">Ouvir mensagem</span>
        </button>

        <button type="button" class="voz-btn voz-btn-secondary" id="vozBtnStop" style="display:none;" title="Parar narração">
          <span>⏹</span>
          <span>Parar</span>
        </button>

        <button type="button" class="voz-btn voz-btn-settings" id="vozBtnSettings" title="Personalizar voz, velocidade e emoção">
          <span>⚙</span>
          <span>Ajustes de Áudio</span>
        </button>

        <div class="voz-status-pill" id="vozStatusPill" style="display:none;">
          <span class="voz-pulse-dot"></span>
          <span id="vozStatusTexto">A carregar...</span>
        </div>
      </div>

      <div class="voz-settings-panel" id="vozSettingsPanel" style="display:none;" role="region" aria-label="Ajustes de Narração">
        <div class="voz-panel-head">
          <div class="voz-panel-title">
            <span>🕊️</span>
            <span>Personalizar Narração Devocional</span>
          </div>
          <button type="button" class="voz-panel-close" id="vozBtnCloseSettings" aria-label="Fechar ajustes">✕</button>
        </div>

        <div class="voz-setting-row">
          <label class="voz-setting-label">Estilo / Cadência Devocional:</label>
          <div class="voz-presets-wrap">
            <button type="button" class="voz-preset-chip active" data-preset="devocional" title="Ritmo meditativo e acolhedor recomendado">
              🕊️ Padrão Devocional (0.88x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="sereno" title="Ritmo pausado para meditação profunda">
              📖 Oração Serena (0.80x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="fluido" title="Ritmo normal e dinâmico">
              ⚡ Leitura Fluida (1.00x)
            </button>
          </div>
        </div>

        <div class="voz-setting-row">
          <label class="voz-setting-label" for="vozSelectVoz">
            <span>🗣️ Voz da Leitura:</span>
            <span class="voz-badge-val" id="vozBadgeNome">Automático</span>
          </label>
          <select id="vozSelectVoz" class="voz-select"></select>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangeRate">⏱️ Velocidade do Ritmo:</label>
            <span class="voz-badge-val" id="vozBadgeRate">0.88x</span>
          </div>
          <input type="range" id="vozRangeRate" class="voz-range" min="0.65" max="1.30" step="0.02" value="0.88">
          <div class="voz-range-sub">
            <span>Mais Lento / Meditativo</span>
            <span>Ideal (0.88x)</span>
            <span>Mais Rápido</span>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangePitch">🎵 Tom & Acolhimento:</label>
            <span class="voz-badge-val" id="vozBadgePitch">0.98 (Aveludado)</span>
          </div>
          <input type="range" id="vozRangePitch" class="voz-range" min="0.80" max="1.20" step="0.02" value="0.98">
          <div class="voz-range-sub">
            <span>Aveludado / Grave</span>
            <span>Equilibrado</span>
            <span>Mais Agudo</span>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangeVolume">🔊 Volume:</label>
            <span class="voz-badge-val" id="vozBadgeVolume">100%</span>
          </div>
          <input type="range" id="vozRangeVolume" class="voz-range" min="0" max="1" step="0.05" value="1">
        </div>

        <div class="voz-setting-row">
          <label class="voz-checkbox-row">
            <input type="checkbox" id="vozCheckPausas" checked>
            <span>Inserir pausas contemplativas entre versículos e reflexão</span>
          </label>
          <label class="voz-checkbox-row">
            <input type="checkbox" id="vozCheckRef" checked>
            <span>Pronunciar passagens bíblicas por extenso (capítulo e versículo)</span>
          </label>
          <label class="voz-checkbox-row">
            <input type="checkbox" id="vozCheckDestaque" checked>
            <span>Realçar visualmente o texto correspondente durante a leitura</span>
          </label>
        </div>

        <div class="voz-panel-footer">
          <button type="button" class="voz-btn-link" id="vozBtnRestaurar">
            ↺ Restaurar Padrão Devocional
          </button>
          <button type="button" class="voz-btn voz-btn-secondary" id="vozBtnTestarExemplo" style="padding:4px 12px;font-size:0.75rem;">
            ▶ Testar Tom de Voz
          </button>
        </div>
      </div>
    `;

    return wrapper;
  }

  function atualizarBotoesUI() {
    var btnPlay = document.getElementById('vozBtnPlay');
    var iconPlay = document.getElementById('vozPlayIcon');
    var txtPlay = document.getElementById('vozPlayTexto');
    var btnStop = document.getElementById('vozBtnStop');

    if (!btnPlay) return;

    if (estado.status === 'playing') {
      if (iconPlay) iconPlay.textContent = '⏸';
      if (txtPlay) txtPlay.textContent = 'Pausar';
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else if (estado.status === 'paused') {
      if (iconPlay) iconPlay.textContent = '▶';
      if (txtPlay) txtPlay.textContent = 'Continuar';
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else {
      if (iconPlay) iconPlay.textContent = '▶';
      if (txtPlay) txtPlay.textContent = 'Ouvir mensagem';
      if (btnStop) btnStop.style.display = 'none';
    }
  }

  function atualizarBarraEstado(label, atual, total) {
    var pill = document.getElementById('vozStatusPill');
    var txt = document.getElementById('vozStatusTexto');
    if (!pill || !txt) return;

    pill.style.display = 'inline-flex';
    txt.textContent = label + ' (' + atual + '/' + total + ')';
  }

  function ocultarBarraEstado() {
    var pill = document.getElementById('vozStatusPill');
    if (pill) pill.style.display = 'none';
  }

  function preencherListaVozes() {
    var select = document.getElementById('vozSelectVoz');
    if (!select) return;

    atualizarVozes();
    select.innerHTML = '';

    var optAuto = document.createElement('option');
    optAuto.value = '';
    optAuto.textContent = '🌟 Melhor Voz Natural Automática (Recomendado)';
    select.appendChild(optAuto);

    if (!vozesCache || vozesCache.length === 0) return;

    // Filtra e organiza vozes em português primeiro
    var vozesPT = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') === 0; });
    var outras = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') !== 0; });

    var grupoPT = document.createElement('optgroup');
    grupoPT.label = 'Vozes em Português (PT-PT / PT-BR)';

    vozesPT.sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    vozesPT.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.voiceURI;
      var etiqueta = v.name + ' (' + v.lang + ')';
      if (classificarVoz(v) >= 120) etiqueta = '✨ ' + etiqueta;
      opt.textContent = etiqueta;
      if (config.voiceURI === v.voiceURI) opt.selected = true;
      grupoPT.appendChild(opt);
    });
    select.appendChild(grupoPT);

    if (outras.length > 0) {
      var grupoOutras = document.createElement('optgroup');
      grupoOutras.label = 'Outros Idiomas do Sistema';
      outras.slice(0, 15).forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = v.name + ' (' + v.lang + ')';
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoOutras.appendChild(opt);
      });
      select.appendChild(grupoOutras);
    }

    var vozEscolhida = obterMelhorVoz();
    var badge = document.getElementById('vozBadgeNome');
    if (badge && vozEscolhida) {
      badge.textContent = vozEscolhida.name.split(' ')[0] + ' (' + vozEscolhida.lang + ')';
    }
  }

  function sincronizarValoresAjustes() {
    var rangeRate = document.getElementById('vozRangeRate');
    var badgeRate = document.getElementById('vozBadgeRate');
    var rangePitch = document.getElementById('vozRangePitch');
    var badgePitch = document.getElementById('vozBadgePitch');
    var rangeVolume = document.getElementById('vozRangeVolume');
    var badgeVolume = document.getElementById('vozBadgeVolume');
    var checkPausas = document.getElementById('vozCheckPausas');
    var checkRef = document.getElementById('vozCheckRef');
    var checkDestaque = document.getElementById('vozCheckDestaque');

    if (rangeRate && badgeRate) {
      rangeRate.value = config.rate;
      var descRate = config.rate <= 0.82 ? 'Pausado' : (config.rate <= 0.92 ? 'Ideal Devocional' : 'Dinâmico');
      badgeRate.textContent = config.rate.toFixed(2) + 'x (' + descRate + ')';
    }

    if (rangePitch && badgePitch) {
      rangePitch.value = config.pitch;
      var descPitch = config.pitch < 0.95 ? 'Grave' : (config.pitch <= 1.05 ? 'Suave' : 'Agudo');
      badgePitch.textContent = config.pitch.toFixed(2) + ' (' + descPitch + ')';
    }

    if (rangeVolume && badgeVolume) {
      rangeVolume.value = config.volume;
      badgeVolume.textContent = Math.round(config.volume * 100) + '%';
    }

    if (checkPausas) checkPausas.checked = !!config.pausasMeditativas;
    if (checkRef) checkRef.checked = !!config.humanizarReferencias;
    if (checkDestaque) checkDestaque.checked = !!config.destacarTexto;

    // Atualiza seleção do preset chip
    document.querySelectorAll('.voz-preset-chip').forEach(function (chip) {
      var preset = chip.getAttribute('data-preset');
      var ativo = false;
      if (preset === 'devocional' && Math.abs(config.rate - 0.88) < 0.03 && Math.abs(config.pitch - 0.98) < 0.03) ativo = true;
      if (preset === 'sereno' && Math.abs(config.rate - 0.80) < 0.03 && Math.abs(config.pitch - 0.94) < 0.03) ativo = true;
      if (preset === 'fluido' && Math.abs(config.rate - 1.00) < 0.03 && Math.abs(config.pitch - 1.00) < 0.03) ativo = true;
      chip.classList.toggle('active', ativo);
    });
  }

  function aplicarPreset(preset) {
    if (preset === 'devocional') {
      config.rate = 0.88;
      config.pitch = 0.98;
      config.pausasMeditativas = true;
    } else if (preset === 'sereno') {
      config.rate = 0.80;
      config.pitch = 0.94;
      config.pausasMeditativas = true;
    } else if (preset === 'fluido') {
      config.rate = 1.00;
      config.pitch = 1.00;
      config.pausasMeditativas = false;
    }
    salvarConfig();
    sincronizarValoresAjustes();
  }

  function testarExemploDeVoz() {
    window.speechSynthesis.cancel();
    var ut = new SpeechSynthesisUtterance('O Senhor é o meu pastor; nada me faltará. Que a paz esteja consigo.');
    var voz = obterMelhorVoz();
    if (voz) ut.voice = voz;
    ut.rate = config.rate;
    ut.pitch = config.pitch;
    ut.volume = config.volume;
    window.speechSynthesis.speak(ut);
  }

  // ==========================================================================
  // INJEÇÃO NO DOM E EVENTOS
  // ==========================================================================
  function vincularEventosAjustes(wrapper) {
    var btnPlay = wrapper.querySelector('#vozBtnPlay');
    var btnStop = wrapper.querySelector('#vozBtnStop');
    var btnSettings = wrapper.querySelector('#vozBtnSettings');
    var btnCloseSettings = wrapper.querySelector('#vozBtnCloseSettings');
    var panel = wrapper.querySelector('#vozSettingsPanel');
    var selectVoz = wrapper.querySelector('#vozSelectVoz');
    var rangeRate = wrapper.querySelector('#vozRangeRate');
    var rangePitch = wrapper.querySelector('#vozRangePitch');
    var rangeVolume = wrapper.querySelector('#vozRangeVolume');
    var checkPausas = wrapper.querySelector('#vozCheckPausas');
    var checkRef = wrapper.querySelector('#vozCheckRef');
    var checkDestaque = wrapper.querySelector('#vozCheckDestaque');
    var btnRestaurar = wrapper.querySelector('#vozBtnRestaurar');
    var btnTestar = wrapper.querySelector('#vozBtnTestarExemplo');

    if (btnPlay) {
      btnPlay.addEventListener('click', function () {
        if (estado.status === 'playing') pausarLeitura();
        else iniciarLeitura();
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', pararLeitura);
    }

    if (btnSettings && panel) {
      btnSettings.addEventListener('click', function () {
        var aberto = panel.style.display !== 'none';
        panel.style.display = aberto ? 'none' : 'block';
        btnSettings.classList.toggle('active', !aberto);
        if (!aberto) preencherListaVozes();
      });
    }

    if (btnCloseSettings && panel && btnSettings) {
      btnCloseSettings.addEventListener('click', function () {
        panel.style.display = 'none';
        btnSettings.classList.remove('active');
      });
    }

    if (selectVoz) {
      selectVoz.addEventListener('change', function () {
        config.voiceURI = this.value;
        salvarConfig();
        var badge = wrapper.querySelector('#vozBadgeNome');
        var vozSel = obterMelhorVoz();
        if (badge && vozSel) badge.textContent = vozSel.name.split(' ')[0] + ' (' + vozSel.lang + ')';
      });
    }

    if (rangeRate) {
      rangeRate.addEventListener('input', function () {
        config.rate = parseFloat(this.value);
        salvarConfig();
        sincronizarValoresAjustes();
      });
    }

    if (rangePitch) {
      rangePitch.addEventListener('input', function () {
        config.pitch = parseFloat(this.value);
        salvarConfig();
        sincronizarValoresAjustes();
      });
    }

    if (rangeVolume) {
      rangeVolume.addEventListener('input', function () {
        config.volume = parseFloat(this.value);
        salvarConfig();
        sincronizarValoresAjustes();
      });
    }

    if (checkPausas) {
      checkPausas.addEventListener('change', function () {
        config.pausasMeditativas = this.checked;
        salvarConfig();
      });
    }

    if (checkRef) {
      checkRef.addEventListener('change', function () {
        config.humanizarReferencias = this.checked;
        salvarConfig();
      });
    }

    if (checkDestaque) {
      checkDestaque.addEventListener('change', function () {
        config.destacarTexto = this.checked;
        if (!config.destacarTexto) removerDestaque();
        salvarConfig();
      });
    }

    wrapper.querySelectorAll('.voz-preset-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        aplicarPreset(this.getAttribute('data-preset'));
      });
    });

    if (btnRestaurar) {
      btnRestaurar.addEventListener('click', function () {
        config = Object.assign({}, CONFIG_DEFAULT);
        salvarConfig();
        sincronizarValoresAjustes();
        preencherListaVozes();
      });
    }

    if (btnTestar) {
      btnTestar.addEventListener('click', testarExemploDeVoz);
    }
  }

  function injetarBotoes() {
    var cabecalho = document.querySelector('#reader .rh');
    if (!cabecalho) return;

    pararLeitura();

    var existentes = cabecalho.querySelector('.voz-player-wrapper') || cabecalho.querySelector('.audio-controls');
    if (existentes) existentes.remove();

    injetarEstilos();
    var wrapper = criarEstruturaUI();
    cabecalho.appendChild(wrapper);

    vincularEventosAjustes(wrapper);
    preencherListaVozes();
    sincronizarValoresAjustes();
  }

  // ==========================================================================
  // INTERCEÇÃO INTELIGENTE DE NAVEGAÇÃO DO LEITOR
  // ==========================================================================
  function interceptarFuncoesNavegacao() {
    // Intercetar showReader
    if (typeof window.showReader === 'function' && !window.showReader.__vozInterceptado) {
      var origemShowReader = window.showReader;
      var novoShowReader = function (i) {
        origemShowReader(i);
        injetarBotoes();
      };
      novoShowReader.__vozInterceptado = true;
      window.showReader = novoShowReader;
    }

    // Intercetar ecrãs que fecham a leitura
    ['showIndex', 'showCover', 'showGallery'].forEach(function (nome) {
      if (typeof window[nome] === 'function' && !window[nome].__vozInterceptado) {
        var original = window[nome];
        var novo = function () {
          pararLeitura();
          return original.apply(this, arguments);
        };
        novo.__vozInterceptado = true;
        window[nome] = novo;
      }
    });
  }

  function inicializar() {
    interceptarFuncoesNavegacao();
    if (document.querySelector('#reader .rh') && !document.querySelector('.voz-player-wrapper')) {
      injetarBotoes();
    }
  }

  if ('speechSynthesis' in window) {
    atualizarVozes();
    window.speechSynthesis.onvoiceschanged = function () {
      atualizarVozes();
      preencherListaVozes();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      inicializar();
      setInterval(interceptarFuncoesNavegacao, 1200);
    });
  } else {
    inicializar();
    setInterval(interceptarFuncoesNavegacao, 1200);
  }

  window.addEventListener('beforeunload', function () {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });
})();
