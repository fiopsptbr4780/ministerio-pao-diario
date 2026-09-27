/*
  voz.js — Narração Devocional Humanizada com Voz Sénior, Grave e Ajustes Reativos
  Ministério Pão Diário

  Recursos implementados:
  - Perfil de voz sénior, maduro e acolhedor (padrão pastoral grave: tom 0.80, ritmo sereno: 0.84x).
  - Algoritmo de deteção que prioriza vozes masculinas, profundas e solenes (Duarte, Antonio, Daniel).
  - Ajustes em tempo real: alteração imediata de velocidade e tom durante a reprodução.
  - Feedback audível instantâneo com reprodução de amostra ao mudar valores ou presets.
  - Suporte a amplo alcance de tom (0.50 a 1.30) para personalização de gravidade verdadeiramente perceptível.
  - Pausas contemplativas e humanização de referências bíblicas e momentos de oração.
  - Remoção inteligente de emojis para fala fluida e reverente.
  - Presets rápidos: Pastoral Sénior, Oração Profunda, Leitura Suave e Dinâmica.
  - Destaque visual sincronizado no versículo e parágrafo em leitura.
  - Proteção ativa contra corte de áudio e recolha de lixo da Web Speech API.
*/

(function () {
  'use strict';

  var STORAGE_KEY = 'pao_diario_audio_config_v5';

  var CONFIG_DEFAULT = {
    rate: 0.84,               // Ritmo meditativo pastoral sereno e compassado
    pitch: 0.80,              // Tom grave, aveludado e maduro (perfil sénior ideal para reflexão espiritual)
    volume: 1.0,              // Volume total
    voiceURI: '',             // Melhor voz masculina/sénior detetada automaticamente
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

  // Timers para reatividade e amostras
  var liveUpdateTimer = null;
  var testeTimer = null;

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
      // Limpeza de preferências antigas para garantir o novo perfil sénior/grave por defeito
      try {
        localStorage.removeItem('pao_diario_audio_config_v4');
        localStorage.removeItem('pao_diario_audio_config_v3');
      } catch (err) {}
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
  // GESTÃO DE VOZES E DETEÇÃO DA MELHOR VOZ MASCULINA / SÉNIOR
  // ==========================================================================
  function atualizarVozes() {
    if (!('speechSynthesis' in window)) return;
    var list = window.speechSynthesis.getVoices();
    if (list && list.length > 0) {
      vozesCache = list;
      vozesPronto = true;
    }
  }

  function ehVozMasculinaSenior(v) {
    var nome = (v.name || '').toLowerCase();
    var nomesMasc = [
      'antonio', 'antónio', 'duarte', 'daniel', 'jorge', 'joaquim',
      'felipe', 'male', 'homem', 'masculin', 'baritone', 'senhor'
    ];
    for (var i = 0; i < nomesMasc.length; i++) {
      if (nome.indexOf(nomesMasc[i]) !== -1) return true;
    }
    return false;
  }

  function ehVozFeminina(v) {
    var nome = (v.name || '').toLowerCase();
    var nomesFem = [
      'raquel', 'francisca', 'maria', 'helia', 'hélia', 'joana',
      'luciana', 'female', 'mulher', 'feminina', 'vitória', 'vitoria', 'camila'
    ];
    for (var i = 0; i < nomesFem.length; i++) {
      if (nome.indexOf(nomesFem[i]) !== -1) return true;
    }
    return false;
  }

  function classificarVoz(v) {
    var pontuacao = 0;
    var lang = (v.lang || '').toLowerCase();
    var nome = (v.name || '').toLowerCase();

    // Prioridade de Idioma: Português
    if (lang === 'pt-pt') pontuacao += 100;
    else if (lang === 'pt-br') pontuacao += 95;
    else if (lang.indexOf('pt') === 0) pontuacao += 85;
    else return -200; // Excluir idiomas não-portugueses do topo

    // Prioridade máxima para perfil de voz masculina, madura e sénior
    if (ehVozMasculinaSenior(v)) {
      pontuacao += 130;
    } else if (ehVozFeminina(v)) {
      pontuacao -= 60; // Reduz pontuação para priorizar perfil sénior masculino
    }

    // Bónus para nomes com perfil reconhecidamente grave/sénior
    if (nome.indexOf('antonio') !== -1 || nome.indexOf('antónio') !== -1) pontuacao += 45;
    if (nome.indexOf('duarte') !== -1) pontuacao += 40;
    if (nome.indexOf('daniel') !== -1) pontuacao += 35; // Excelente suporte a tom grave no Windows

    // Bónus para qualidade de síntese
    if (nome.indexOf('natural') !== -1) pontuacao += 35;
    if (nome.indexOf('neural') !== -1) pontuacao += 30;
    if (nome.indexOf('online') !== -1) pontuacao += 15;
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

    // Selecionar a melhor voz portuguesa pelo algoritmo de qualidade e gravidade
    var vozesPT = vozesCache
      .filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') === 0; })
      .sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    if (vozesPT.length > 0) return vozesPT[0];

    // Fallback geral
    var todas = vozesCache.slice().sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });
    return todas[0] || vozesCache[0] || null;
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
  // CONSTRUÇÃO DE SEGMENTOS DEVOCIONAIS COM EMOÇÃO E PROSÓDIA SÉNIOR
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
        pitchFactor: 1.00
      });
    }

    // 2. REFERÊNCIA BÍBLICA E VERSÍCULO SAGRADO
    var elVbox = reader.querySelector('.vbox');
    var elAline = reader.querySelector('.vbox .aline') || reader.querySelector('.rh .bdgt');
    var refBruta = elAline ? elAline.textContent.replace(/^[-—\s]+/, '').trim() : '';
    var refHumanizada = humanizarReferenciaBiblica(refBruta);

    var versiculoTexto = '';
    if (elVbox) {
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
        rateFactor: 0.96,
        pitchFactor: 0.98
      });
    }

    if (versiculoTexto) {
      segmentos.push({
        id: 'versiculo',
        elemento: elVbox,
        label: 'Versículo',
        texto: '“' + versiculoTexto + '”',
        pausa: config.pausasMeditativas ? 900 : 350,
        rateFactor: 0.92, // Leitura serena e reverente
        pitchFactor: 0.96 // Tom mais grave e solene para as Escrituras
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
            pitchFactor: 0.98
          });
          segmentos.push({
            id: 'oracao_corpo',
            elemento: item.el,
            label: 'Oração',
            texto: corpoOracao,
            pausa: config.pausasMeditativas ? 850 : 300,
            rateFactor: 0.88, // Oração íntima e acolhedora
            pitchFactor: 0.95 // Tom profundo e solene
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
        pitchFactor: 1.00
      });
      segmentos.push({
        id: 'meditacao_corpo',
        elemento: elMbox,
        label: 'Hora de Refletir',
        texto: meditacaoTexto,
        pausa: config.pausasMeditativas ? 900 : 300,
        rateFactor: 0.90,
        pitchFactor: 0.97
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
      pitchFactor: 0.96
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
    // Previne que navegadores silenciem o áudio aos 14 segundos em leituras longas
    estado.heartbeatTimer = setInterval(function () {
      if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 8500);
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
    var baseRate = parseFloat(config.rate) || 0.84;
    var basePitch = parseFloat(config.pitch) || 0.80;
    var baseVolume = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;

    ut.rate = Math.max(0.4, Math.min(2.0, baseRate * (seg.rateFactor || 1.0)));
    ut.pitch = Math.max(0.4, Math.min(1.8, basePitch * (seg.pitchFactor || 1.0)));
    ut.volume = Math.max(0.0, Math.min(1.0, baseVolume));
    ut.lang = voz ? voz.lang : 'pt-PT';

    estado.utteranceAtual = ut;
    window.__pd_current_utterance = ut; // Evita garbage collection precoce no motor do navegador

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
  // ATUALIZAÇÃO EM TEMPO REAL E AMOSTRAS AUDÍVEIS
  // ==========================================================================
  function aplicarAjusteAoVivo(tocarAmostraSeOcioso) {
    if (estado.status === 'playing') {
      // Re-aplica imediatamente as alterações ao segmento atual que está a tocar
      if (liveUpdateTimer) clearTimeout(liveUpdateTimer);
      liveUpdateTimer = setTimeout(function () {
        if (estado.status === 'playing' && estado.indiceAtual >= 0) {
          if (estado.timerPausa) clearTimeout(estado.timerPausa);
          pararHeartbeat();
          window.speechSynthesis.cancel();
          setTimeout(function () {
            if (estado.status === 'playing') {
              iniciarHeartbeat();
              tocarSegmento(estado.indiceAtual);
            }
          }, 40);
        }
      }, 90);
    } else if (tocarAmostraSeOcioso) {
      testarExemploDeVoz();
    }
  }

  function testarExemploDeVoz() {
    if (estado.status === 'playing' && estado.indiceAtual >= 0) {
      // Se estiver a tocar, atualiza o segmento atual
      aplicarAjusteAoVivo(false);
      return;
    }

    if (testeTimer) clearTimeout(testeTimer);
    testeTimer = setTimeout(function () {
      if (estado.status !== 'playing') {
        window.speechSynthesis.cancel();
        var ut = new SpeechSynthesisUtterance('O Senhor é o meu pastor; nada me faltará. Que a paz e a bênção de Deus acompanhem o seu dia.');
        var voz = obterMelhorVoz();
        if (voz) ut.voice = voz;
        ut.rate = parseFloat(config.rate) || 0.84;
        ut.pitch = parseFloat(config.pitch) || 0.80;
        ut.volume = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;
        ut.lang = voz ? voz.lang : 'pt-PT';
        window.__pd_current_utterance = ut;
        window.speechSynthesis.speak(ut);
      }
    }, 70);
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
        color: rgba(255,255,255,0.9);
        border: 1px solid rgba(255,255,255,0.35);
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
        background: rgba(30, 12, 1, 0.97);
        border: 1px solid rgba(245, 185, 66, 0.45);
        border-radius: 16px;
        padding: 18px 20px;
        margin-top: 10px;
        color: #fff8ee;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        backdrop-filter: blur(8px);
        max-width: 660px;
        animation: vozFadeIn 0.22s ease-out;
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
        font-size: 0.95rem;
        font-weight: 700;
        color: #f5b942;
        display: flex;
        align-items: center;
        gap: 8px;
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
        font-size: 0.82rem;
        font-weight: 600;
        margin-bottom: 6px;
        color: #f7d5a5;
      }
      .voz-badge-val {
        font-size: 0.74rem;
        background: rgba(245,185,66,0.22);
        border: 1px solid rgba(245,185,66,0.4);
        color: #fff;
        padding: 2px 10px;
        border-radius: 12px;
        font-weight: 700;
      }

      /* Presets Pastorais */
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
        background: rgba(255,255,255,0.18);
        color: #fff;
      }
      .voz-preset-chip.active {
        background: #c8790a;
        color: #fff;
        border-color: #f5b942;
        box-shadow: 0 0 10px rgba(245,185,66,0.35);
      }

      .voz-select {
        width: 100%;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.3);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.83rem;
        outline: none;
        cursor: pointer;
      }
      .voz-select option, .voz-select optgroup {
        background: #250f00;
        color: #fff;
      }
      .voz-select optgroup {
        font-weight: 700;
        color: #f5b942;
      }

      .voz-help-tip {
        font-size: 0.74rem;
        color: #ffd899;
        background: rgba(245, 185, 66, 0.12);
        border-left: 3px solid #f5b942;
        padding: 6px 10px;
        border-radius: 4px;
        margin-top: 6px;
        line-height: 1.4;
      }

      .voz-range {
        width: 100%;
        accent-color: #f5b942;
        cursor: pointer;
        height: 6px;
      }
      .voz-range-sub {
        display: flex;
        justify-content: space-between;
        font-size: 0.69rem;
        color: rgba(255,255,255,0.55);
        margin-top: 3px;
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
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.12);
        flex-wrap: wrap;
        gap: 8px;
      }
      .voz-btn-link {
        background: none;
        border: none;
        color: #f5b942;
        font-size: 0.76rem;
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
        <button type="button" class="voz-btn voz-btn-primary" id="vozBtnPlay" title="Ouvir reflexão narrada em voz sénior">
          <span id="vozPlayIcon">▶</span>
          <span id="vozPlayTexto">Ouvir mensagem</span>
        </button>

        <button type="button" class="voz-btn voz-btn-secondary" id="vozBtnStop" style="display:none;" title="Parar narração">
          <span>⏹</span>
          <span>Parar</span>
        </button>

        <button type="button" class="voz-btn voz-btn-settings" id="vozBtnSettings" title="Personalizar voz sénior, tom grave e velocidade">
          <span>⚙</span>
          <span>Ajustes de Áudio</span>
        </button>

        <div class="voz-status-pill" id="vozStatusPill" style="display:none;">
          <span class="voz-pulse-dot"></span>
          <span id="vozStatusTexto">A carregar...</span>
        </div>
      </div>

      <div class="voz-settings-panel" id="vozSettingsPanel" style="display:none;" role="region" aria-label="Ajustes de Narração Devocional">
        <div class="voz-panel-head">
          <div class="voz-panel-title">
            <span>🎙️</span>
            <span>Personalizar Narração Devocional Sénior</span>
          </div>
          <button type="button" class="voz-panel-close" id="vozBtnCloseSettings" aria-label="Fechar ajustes">✕</button>
        </div>

        <div class="voz-setting-row">
          <label class="voz-setting-label">Estilo & Cadência Devocional:</label>
          <div class="voz-presets-wrap">
            <button type="button" class="voz-preset-chip active" data-preset="pastoral" title="Tom grave e maduro com ritmo compassado e acolhedor">
              🎙️ Pastoral Sénior (Grave & Sereno)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="oracao" title="Tom muito profundo e reverente para oração profunda">
              🕊️ Oração Profunda (Solene)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="suave" title="Tom aveludado e cadência equilibrada">
              📖 Leitura Suave (0.90x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="dinamico" title="Ritmo mais dinâmico para escuta rápida">
              ⚡ Dinâmico (1.05x)
            </button>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozSelectVoz">🎙️ Voz da Mensagem:</label>
            <span class="voz-badge-val" id="vozBadgeNome">Automático (Sénior)</span>
          </div>
          <select id="vozSelectVoz" class="voz-select"></select>
          <div class="voz-help-tip" id="vozHelpTip">
            ✨ Prioridade ativa: Vozes masculinas e seniores (Duarte, Antonio, Daniel) para máxima gravidade e reflexão.
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangePitch">🎵 Tom & Gravidade (Timbre Sénior):</label>
            <span class="voz-badge-val" id="vozBadgePitch">0.80 (Grave & Maduro)</span>
          </div>
          <input type="range" id="vozRangePitch" class="voz-range" min="0.50" max="1.30" step="0.02" value="0.80">
          <div class="voz-range-sub">
            <span>Muito Grave / Solene (0.50)</span>
            <span>Ideal Sénior (0.80)</span>
            <span>Mais Agudo (1.30)</span>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangeRate">⏱️ Velocidade do Ritmo:</label>
            <span class="voz-badge-val" id="vozBadgeRate">0.84x (Pastoral)</span>
          </div>
          <input type="range" id="vozRangeRate" class="voz-range" min="0.55" max="1.45" step="0.02" value="0.84">
          <div class="voz-range-sub">
            <span>Mais Lento / Meditativo (0.55x)</span>
            <span>Ideal Pastoral (0.84x)</span>
            <span>Mais Rápido (1.45x)</span>
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
            ↺ Restaurar Padrão Pastoral Sénior
          </button>
          <button type="button" class="voz-btn voz-btn-primary" id="vozBtnTestarExemplo" style="padding:6px 16px;font-size:0.78rem;">
            ▶ Testar Tom e Velocidade
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
    optAuto.textContent = '🌟 Melhor Voz Masculina / Sénior Automática (Recomendado)';
    select.appendChild(optAuto);

    if (!vozesCache || vozesCache.length === 0) return;

    var vozesPT = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') === 0; });
    var outras = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') !== 0; });

    var vozesSeniores = [];
    var outrasPT = [];

    vozesPT.forEach(function (v) {
      if (ehVozMasculinaSenior(v)) {
        vozesSeniores.push(v);
      } else {
        outrasPT.push(v);
      }
    });

    vozesSeniores.sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });
    outrasPT.sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    if (vozesSeniores.length > 0) {
      var grupoSenior = document.createElement('optgroup');
      grupoSenior.label = '🎙️ Vozes Masculinas & Seniores (Recomendadas para Ministério)';
      vozesSeniores.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        var rotulo = '👨 ' + v.name;
        if (v.name.toLowerCase().indexOf('daniel') !== -1) {
          rotulo += ' (Tom Grave Ajustável)';
        } else if (v.name.toLowerCase().indexOf('antonio') !== -1 || v.name.toLowerCase().indexOf('antónio') !== -1) {
          rotulo += ' (Voz Madura & Aveludada)';
        } else if (v.name.toLowerCase().indexOf('duarte') !== -1) {
          rotulo += ' (Voz Solene & Serena)';
        }
        opt.textContent = rotulo;
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoSenior.appendChild(opt);
      });
      select.appendChild(grupoSenior);
    }

    if (outrasPT.length > 0) {
      var grupoOutrasPT = document.createElement('optgroup');
      grupoOutrasPT.label = '🔊 Outras Vozes em Português';
      outrasPT.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = '🗣️ ' + v.name + ' (' + v.lang + ')';
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoOutrasPT.appendChild(opt);
      });
      select.appendChild(grupoOutrasPT);
    }

    if (outras.length > 0) {
      var grupoGeral = document.createElement('optgroup');
      grupoGeral.label = '🌐 Outros Idiomas do Sistema';
      outras.slice(0, 15).forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = v.name + ' (' + v.lang + ')';
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoGeral.appendChild(opt);
      });
      select.appendChild(grupoGeral);
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

    var r = parseFloat(config.rate) || 0.84;
    var p = parseFloat(config.pitch) || 0.80;
    var vol = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;

    if (rangeRate && badgeRate) {
      rangeRate.value = r;
      var descRate = r <= 0.72 ? 'Muito Pausado' : (r <= 0.88 ? 'Ideal Pastoral' : (r <= 1.05 ? 'Moderado' : 'Dinâmico'));
      badgeRate.textContent = r.toFixed(2) + 'x (' + descRate + ')';
    }

    if (rangePitch && badgePitch) {
      rangePitch.value = p;
      var descPitch = p <= 0.65 ? 'Muito Grave / Solene' : (p <= 0.82 ? 'Grave & Maduro' : (p <= 0.95 ? 'Aveludado' : (p <= 1.05 ? 'Neutro' : 'Agudo')));
      badgePitch.textContent = p.toFixed(2) + ' (' + descPitch + ')';
    }

    if (rangeVolume && badgeVolume) {
      rangeVolume.value = vol;
      badgeVolume.textContent = Math.round(vol * 100) + '%';
    }

    if (checkPausas) checkPausas.checked = !!config.pausasMeditativas;
    if (checkRef) checkRef.checked = !!config.humanizarReferencias;
    if (checkDestaque) checkDestaque.checked = !!config.destacarTexto;

    // Atualiza seleção dos botões de preset
    document.querySelectorAll('.voz-preset-chip').forEach(function (chip) {
      var preset = chip.getAttribute('data-preset');
      var ativo = false;
      if (preset === 'pastoral' && Math.abs(r - 0.84) < 0.04 && Math.abs(p - 0.80) < 0.04) ativo = true;
      if (preset === 'oracao' && Math.abs(r - 0.78) < 0.04 && Math.abs(p - 0.72) < 0.04) ativo = true;
      if (preset === 'suave' && Math.abs(r - 0.90) < 0.04 && Math.abs(p - 0.86) < 0.04) ativo = true;
      if (preset === 'dinamico' && Math.abs(r - 1.05) < 0.04 && Math.abs(p - 0.95) < 0.04) ativo = true;
      chip.classList.toggle('active', ativo);
    });
  }

  function aplicarPreset(preset) {
    if (preset === 'pastoral') {
      config.rate = 0.84;
      config.pitch = 0.80;
      config.pausasMeditativas = true;
    } else if (preset === 'oracao') {
      config.rate = 0.78;
      config.pitch = 0.72;
      config.pausasMeditativas = true;
    } else if (preset === 'suave') {
      config.rate = 0.90;
      config.pitch = 0.86;
      config.pausasMeditativas = true;
    } else if (preset === 'dinamico') {
      config.rate = 1.05;
      config.pitch = 0.95;
      config.pausasMeditativas = false;
    }
    salvarConfig();
    sincronizarValoresAjustes();
    aplicarAjusteAoVivo(true);
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
        sincronizarValoresAjustes();
        var badge = wrapper.querySelector('#vozBadgeNome');
        var vozSel = obterMelhorVoz();
        if (badge && vozSel) {
          badge.textContent = vozSel.name.split(' ')[0] + ' (' + vozSel.lang + ')';
        }
        aplicarAjusteAoVivo(true);
      });
    }

    if (rangeRate) {
      rangeRate.addEventListener('input', function () {
        config.rate = parseFloat(this.value);
        sincronizarValoresAjustes();
        salvarConfig();
        aplicarAjusteAoVivo(false);
      });
      rangeRate.addEventListener('change', function () {
        salvarConfig();
        aplicarAjusteAoVivo(true);
      });
    }

    if (rangePitch) {
      rangePitch.addEventListener('input', function () {
        config.pitch = parseFloat(this.value);
        sincronizarValoresAjustes();
        salvarConfig();
        aplicarAjusteAoVivo(false);
      });
      rangePitch.addEventListener('change', function () {
        salvarConfig();
        aplicarAjusteAoVivo(true);
      });
    }

    if (rangeVolume) {
      rangeVolume.addEventListener('input', function () {
        config.volume = parseFloat(this.value);
        sincronizarValoresAjustes();
        salvarConfig();
        aplicarAjusteAoVivo(false);
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
        aplicarAjusteAoVivo(true);
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
      sincronizarValoresAjustes();
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
