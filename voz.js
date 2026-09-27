/*
  voz.js — Narração Devocional Humanizada com Ritmo Acelerado (até 2.80x) e Música Suave de Fundo
  Ministério Pão Diário

  Recursos implementados:
  - Velocidade ampliada e ágil: suporte de 0.80x até 2.80x (com presets de 1.15x, 1.50x, 2.00x e 2.50x).
  - Música ambiente suave devocional integrada (Web Audio API com acordes orquestrais pacíficos e relaxantes em fade-in/fade-out).
  - Conversão integral de citações e referências bíblicas em todo o texto (impede leitura de "horas e minutos" em passagens como João 15:13).
  - Expansão de abreviações de livros bíblicos e versículos (v.15 -> versículo 15, vv. 15-17 -> versículos 15 a 17).
  - Síntese com vozes neurais e naturais de alta definição (Duarte, Antonio, Raquel, Google) sem robotização.
  - Pausas dinâmicas proporcionais à velocidade (elimina estagnação em ritmos rápidos).
  - Ajustes em tempo real: alteração imediata de velocidade, tom e volume durante a reprodução.
  - Destaque visual sincronizado no versículo e parágrafo em leitura.
  - Proteção ativa contra corte de áudio e recolha de lixo da Web Speech API.
*/

(function () {
  'use strict';

  var STORAGE_KEY = 'pao_diario_audio_config_v9';

  var CONFIG_DEFAULT = {
    rate: 1.15,               // Ritmo ágil e dinâmico (permite ajustar até 2.80x)
    pitch: 1.00,              // Tom neutro humano (preserva a voz natural de estúdio)
    volume: 1.0,              // Volume da voz de narração
    voiceURI: '',             // Melhor voz neural/natural detetada automaticamente
    musicaFundo: true,        // Música suave e tranquila ao fundo
    volumeMusica: 0.35,       // Volume equilibrado e claramente audível da música ambiente (35%)
    pausasMeditativas: true,  // Pausas naturais de respiração entre blocos
    humanizarReferencias: true,// "João 15:13" -> "João capítulo 15, versículo 13"
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
        var merged = Object.assign({}, CONFIG_DEFAULT, parsed);
        if (typeof merged.volumeMusica !== 'number' || isNaN(merged.volumeMusica) || merged.volumeMusica < 0.05) {
          merged.volumeMusica = 0.35;
        }
        return merged;
      }
      try {
        localStorage.removeItem('pao_diario_audio_config_v8');
        localStorage.removeItem('pao_diario_audio_config_v7');
        localStorage.removeItem('pao_diario_audio_config_v6');
        localStorage.removeItem('pao_diario_audio_config_v5');
        localStorage.removeItem('pao_diario_audio_config_v4');
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
  // MOTOR DE MÚSICA AMBIENTE SUAVE (TRANQUILIDADE & PAZ DEVOCIONAL)
  // ==========================================================================
  var audioCtx = null;
  var musicMasterGain = null;
  var musicFilter = null;
  var currentChordNodes = [];
  var musicTimer = null;
  var musicPlaying = false;
  var chordIndex = 0;

  // Progressão harmónica orquestral de acolhimento e paz (Fmaj9 -> Cadd9 -> Am9 -> Gsus4)
  // Frequências calibradas na gama acústica de alta sensibilidade do ouvido humano (110 Hz a 440 Hz)
  // Perfeitamente audível em colunas de computadores portáteis, telemóveis e auscultadores.
  var CHORDS = [
    [174.61, 261.63, 329.63, 392.00, 440.00], // Fmaj9: Paz profunda e acolhimento
    [130.81, 196.00, 261.63, 293.66, 329.63], // Cadd9: Esperança e luz
    [110.00, 164.81, 220.00, 261.63, 329.63], // Am9: Reflexão e intimidade
    [146.83, 196.00, 246.94, 293.66, 392.00]  // Gsus4 / G: Gratidão e serenidade
  ];

  function getAudioContext() {
    try {
      if (!audioCtx) {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(function () {});
      }
    } catch (e) {
      console.warn('AudioContext inicialização:', e);
    }
    return audioCtx;
  }

  function iniciarMusicaAmbiente() {
    if (!config.musicaFundo) return;
    var ctx = getAudioContext();
    if (!ctx) return;

    var targetVol = (parseFloat(config.volumeMusica) !== undefined ? parseFloat(config.volumeMusica) : 0.35);

    if (musicPlaying) {
      if (musicMasterGain) {
        try {
          musicMasterGain.gain.setValueAtTime(targetVol, ctx.currentTime);
        } catch (e) {}
      }
      return;
    }

    try {
      if (!musicMasterGain) {
        musicMasterGain = ctx.createGain();
        musicFilter = ctx.createBiquadFilter();
        musicFilter.type = 'lowpass';
        musicFilter.frequency.setValueAtTime(2200, ctx.currentTime); // Filtro aveludado (elimina asperezas, mantém calor)
        musicFilter.Q.setValueAtTime(0.7, ctx.currentTime);

        musicFilter.connect(musicMasterGain);
        musicMasterGain.connect(ctx.destination);
      }

      var agora = ctx.currentTime;
      musicMasterGain.gain.cancelScheduledValues(agora);
      musicMasterGain.gain.setValueAtTime(0.0001, agora);
      musicMasterGain.gain.linearRampToValueAtTime(targetVol, agora + 0.35);

      musicPlaying = true;
      atualizarBotaoTestarMusica();
      tocarProximoAcorde();
    } catch (err) {
      console.warn('Erro ao iniciar música ambiente:', err);
    }
  }

  function pararMusicaAmbiente(imediato) {
    musicPlaying = false;
    atualizarBotaoTestarMusica();
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }

    if (!audioCtx || !musicMasterGain) return;

    var ctx = audioCtx;
    var agora = ctx.currentTime;
    var fadeTime = imediato ? 0.1 : 0.8;

    try {
      musicMasterGain.gain.cancelScheduledValues(agora);
      musicMasterGain.gain.setValueAtTime(musicMasterGain.gain.value, agora);
      musicMasterGain.gain.linearRampToValueAtTime(0.0001, agora + fadeTime);
    } catch (e) {}

    setTimeout(function () {
      if (!musicPlaying) {
        desconectarAcordesAtuais();
      }
    }, (fadeTime + 0.1) * 1000);
  }

  function toggleTestarMusica() {
    if (musicPlaying) {
      pararMusicaAmbiente(false);
    } else {
      config.musicaFundo = true;
      var chk = document.getElementById('vozCheckMusica');
      if (chk) chk.checked = true;
      salvarConfig();
      iniciarMusicaAmbiente();
    }
  }

  function atualizarBotaoTestarMusica() {
    var btn = document.getElementById('vozBtnTestarMusica');
    if (!btn) return;
    if (musicPlaying) {
      btn.innerHTML = '⏸ Parar Música';
      btn.style.color = '#ff9999';
    } else {
      btn.innerHTML = '🎵 Ouvir / Testar Música';
      btn.style.color = '#f5b942';
    }
  }

  function desconectarAcordesAtuais() {
    for (var i = 0; i < currentChordNodes.length; i++) {
      try {
        currentChordNodes[i].osc.stop();
        currentChordNodes[i].osc.disconnect();
        currentChordNodes[i].gain.disconnect();
      } catch (e) {}
    }
    currentChordNodes = [];
  }

  function tocarProximoAcorde() {
    if (!musicPlaying || !audioCtx) return;
    var ctx = audioCtx;

    // Se o AudioContext estiver suspenso por política do browser, acorda-o
    if (ctx.state === 'suspended') {
      ctx.resume().then(function () {
        if (musicPlaying) tocarProximoAcorde();
      }).catch(function () {});
      return;
    }

    var freqs = CHORDS[chordIndex % CHORDS.length];
    chordIndex++;

    var agora = ctx.currentTime;
    var duracaoAcorde = 6.5;
    var attackTime = 0.8;
    var releaseTime = 2.0;

    var velhosNos = currentChordNodes;
    currentChordNodes = [];

    // Fade-out suave dos osciladores do acorde anterior
    for (var j = 0; j < velhosNos.length; j++) {
      var velho = velhosNos[j];
      try {
        velho.gain.gain.cancelScheduledValues(agora);
        velho.gain.gain.setValueAtTime(velho.gain.gain.value, agora);
        velho.gain.gain.linearRampToValueAtTime(0.0001, agora + releaseTime);
        velho.osc.stop(agora + releaseTime + 0.05);
      } catch (e) {}
    }

    // Novos osciladores com harmonia celestial acolhedora:
    // Mistura de ondas senoidais puras e triangulares quentes + leve harmónico de estúdio (+1 oitava)
    for (var k = 0; k < freqs.length; k++) {
      var f = freqs[k];

      // 1. Oscilador fundamental do acorde
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();

      osc1.type = (k % 2 === 0) ? 'sine' : 'triangle';
      osc1.frequency.setValueAtTime(f, agora);
      osc1.detune.setValueAtTime((k % 2 === 0 ? 3 : -3), agora);

      var notaGain = 0.18; // Nível sonoro claramente audível e encorpado
      gain1.gain.setValueAtTime(0.0001, agora);
      gain1.gain.linearRampToValueAtTime(notaGain, agora + attackTime);
      gain1.gain.linearRampToValueAtTime(notaGain * 0.85, agora + duracaoAcorde - 0.5);

      osc1.connect(gain1);
      gain1.connect(musicFilter);

      osc1.start(agora);
      currentChordNodes.push({ osc: osc1, gain: gain1 });

      // 2. Harmónico de claridade (som celestial tipo celesta/harpa suave)
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(f * 2, agora);

      var harmGain = 0.05; // Leve brilho de estúdio
      gain2.gain.setValueAtTime(0.0001, agora);
      gain2.gain.linearRampToValueAtTime(harmGain, agora + attackTime * 1.2);
      gain2.gain.linearRampToValueAtTime(harmGain * 0.7, agora + duracaoAcorde - 0.5);

      osc2.connect(gain2);
      gain2.connect(musicFilter);

      osc2.start(agora);
      currentChordNodes.push({ osc: osc2, gain: gain2 });
    }

    musicTimer = setTimeout(function () {
      if (musicPlaying) {
        tocarProximoAcorde();
      }
    }, (duracaoAcorde - 1.2) * 1000);
  }

  // ==========================================================================
  // GESTÃO DE VOZES E DETEÇÃO DA MELHOR VOZ NATURAL DE ESTÚDIO
  // ==========================================================================
  function atualizarVozes() {
    if (!('speechSynthesis' in window)) return;
    var list = window.speechSynthesis.getVoices();
    if (list && list.length > 0) {
      vozesCache = list;
      vozesPronto = true;
    }
  }

  function ehVozNaturalEstudio(v) {
    var nome = (v.name || '').toLowerCase();
    return (
      nome.indexOf('natural') !== -1 ||
      nome.indexOf('neural') !== -1 ||
      nome.indexOf('online') !== -1 ||
      nome.indexOf('premium') !== -1 ||
      nome.indexOf('enhanced') !== -1 ||
      nome.indexOf('google') !== -1
    );
  }

  function classificarVoz(v) {
    var pontuacao = 0;
    var lang = (v.lang || '').toLowerCase();
    var nome = (v.name || '').toLowerCase();

    // 1. Idioma: Português
    if (lang === 'pt-pt') pontuacao += 100;
    else if (lang === 'pt-br') pontuacao += 95;
    else if (lang.indexOf('pt') === 0) pontuacao += 80;
    else return -500;

    // 2. Prioridade máxima absoluta: vozes neurais e de estúdio
    if (nome.indexOf('natural') !== -1 || nome.indexOf('neural') !== -1 || nome.indexOf('online') !== -1) {
      pontuacao += 350; // Microsoft Edge / Azure Neural
    } else if (nome.indexOf('google') !== -1) {
      pontuacao += 220; // Google Cloud Neural
    } else if (nome.indexOf('premium') !== -1 || nome.indexOf('enhanced') !== -1) {
      pontuacao += 220; // Apple Siri / Mac Studio
    } else {
      pontuacao -= 80; // Vozes SAPI5 legadas desfavorecidas
    }

    // 3. Oradores acolhedores e solenes
    if (nome.indexOf('duarte') !== -1) pontuacao += 40;
    if (nome.indexOf('antonio') !== -1 || nome.indexOf('antónio') !== -1) pontuacao += 35;
    if (nome.indexOf('raquel') !== -1) pontuacao += 30;
    if (nome.indexOf('francisca') !== -1) pontuacao += 25;

    return pontuacao;
  }

  function obterMelhorVoz() {
    atualizarVozes();
    if (!vozesCache || vozesCache.length === 0) return null;

    if (config.voiceURI) {
      var encontrada = vozesCache.find(function (v) { return v.voiceURI === config.voiceURI; });
      if (encontrada) return encontrada;
    }

    var vozesPT = vozesCache
      .filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') === 0; })
      .sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    if (vozesPT.length > 0) return vozesPT[0];

    var todas = vozesCache.slice().sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });
    return todas[0] || vozesCache[0] || null;
  }

  // ==========================================================================
  // HUMANIZAÇÃO COMPLETA DE TEXTO E CITAÇÕES BÍBLICAS
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

  function humanizarTextoCompleto(str) {
    if (!str) return '';
    var r = ' ' + str.trim() + ' ';

    r = limparEmojis(r);

    // Abreviações de versículos no texto: (v.15), (vv. 15-17), (v. 15)
    r = r.replace(/\bvv\.\s*(\d+)\s*[-–—]\s*(\d+)/gi, 'versículos $1 a $2');
    r = r.replace(/\bv\.\s*(\d+)\s*[-–—]\s*(\d+)/gi, 'versículos $1 a $2');
    r = r.replace(/\bv\.\s*(\d+)/gi, 'versículo $1');
    r = r.replace(/\(v\s*(\d+)\)/gi, '(versículo $1)');

    // Nomes de livros bíblicos com proteção Unicode
    var mapeamento = [
      [/\b1\s*Cor[íi]ntios\b/gi, 'Primeira Coríntios'],
      [/\b2\s*Cor[íi]ntios\b/gi, 'Segunda Coríntios'],
      [/\b1\s*Co(?![a-zà-ÿ])/gi, 'Primeira Coríntios'],
      [/\b2\s*Co(?![a-zà-ÿ])/gi, 'Segunda Coríntios'],
      [/\b1\s*Tessalonicenses\b|\b1\s*Ts(?![a-zà-ÿ])/gi, 'Primeira Tessalonicenses'],
      [/\b2\s*Tessalonicenses\b|\b2\s*Ts(?![a-zà-ÿ])/gi, 'Segunda Tessalonicenses'],
      [/\b1\s*Tim[óo]teo\b|\b1\s*Tm(?![a-zà-ÿ])/gi, 'Primeira Timóteo'],
      [/\b2\s*Tim[óo]teo\b|\b2\s*Tm(?![a-zà-ÿ])/gi, 'Segunda Timóteo'],
      [/\b1\s*Pedro\b|\b1\s*Pe(?![a-zà-ÿ])/gi, 'Primeira Pedro'],
      [/\b2\s*Pedro\b|\b2\s*Pe(?![a-zà-ÿ])/gi, 'Segunda Pedro'],
      [/\b1\s*Jo[ãa]o\b|\b1\s*Jo(?![a-zà-ÿ])/gi, 'Primeira João'],
      [/\b2\s*Jo[ãa]o\b|\b2\s*Jo(?![a-zà-ÿ])/gi, 'Segunda João'],
      [/\b3\s*Jo[ãa]o\b|\b3\s*Jo(?![a-zà-ÿ])/gi, 'Terceira João'],
      [/\b1\s*Samuel\b|\b1\s*Sm(?![a-zà-ÿ])/gi, 'Primeiro Samuel'],
      [/\b2\s*Samuel\b|\b2\s*Sm(?![a-zà-ÿ])/gi, 'Segundo Samuel'],
      [/\b1\s*Reis\b|\b1\s*Rs(?![a-zà-ÿ])/gi, 'Primeiro Reis'],
      [/\b2\s*Reis\b|\b2\s*Rs(?![a-zà-ÿ])/gi, 'Segundo Reis'],
      [/\b1\s*Cr[ôo]nicas\b|\b1\s*Cr(?![a-zà-ÿ])/gi, 'Primeiro Crônicas'],
      [/\b2\s*Cr[ôo]nicas\b|\b2\s*Cr(?![a-zà-ÿ])/gi, 'Segundo Crônicas'],
      [/\bSalmos\b|\bSl(?![a-zà-ÿ])|\bSal(?![a-zà-ÿ])/gi, 'Salmo'],
      [/\bProv[ée]rbios\b|\bPv(?![a-zà-ÿ])|\bProv(?![a-zà-ÿ])/gi, 'Provérbios'],
      [/\bMateus\b|\bMt(?![a-zà-ÿ])|\bMat(?![a-zà-ÿ])/gi, 'Mateus'],
      [/\bMarcos\b|\bMc(?![a-zà-ÿ])|\bMar(?![a-zà-ÿ])/gi, 'Marcos'],
      [/\bLucas\b|\bLc(?![a-zà-ÿ])|\bLuc(?![a-zà-ÿ])/gi, 'Lucas'],
      [/\bJoao\b/gi, 'João'],
      [/\bAtos\b|\bAt(?![a-zà-ÿ])|\bAct(?![a-zà-ÿ])/gi, 'Atos'],
      [/\bRomanos\b|\bRm(?![a-zà-ÿ])|\bRom(?![a-zà-ÿ])/gi, 'Romanos'],
      [/\bG[áa]latas\b|\bGl(?![a-zà-ÿ])|\bGal(?![a-zà-ÿ])/gi, 'Gálatas'],
      [/\bEf[ée]sios\b|\bEf(?![a-zà-ÿ])/gi, 'Efésios'],
      [/\bFilipenses\b|\bFp(?![a-zà-ÿ])|\bFil(?![a-zà-ÿ])/gi, 'Filipenses'],
      [/\bColossenses\b|\bCl(?![a-zà-ÿ])|\bCol(?![a-zà-ÿ])/gi, 'Colossenses'],
      [/\bHebreus\b|\bHb(?![a-zà-ÿ])|\bHeb(?![a-zà-ÿ])/gi, 'Hebreus'],
      [/\bTiago\b|\bTg(?![a-zà-ÿ])/gi, 'Tiago'],
      [/\bApocalipse\b|\bAp(?![a-zà-ÿ])|\bApoc(?![a-zà-ÿ])/gi, 'Apocalipse'],
      [/\bG[êe]nesis\b|\bGn(?![a-zà-ÿ])|\bGen(?![a-zà-ÿ])/gi, 'Gênesis'],
      [/\b[ÊE]xodo\b|\bÊx(?![a-zà-ÿ])|\bEx(?![a-zà-ÿ])/gi, 'Êxodo']
    ];

    mapeamento.forEach(function (par) {
      r = r.replace(par[0], par[1]);
    });

    // Conversão de capítulos e versículos (impede o erro de leitura de "horas e minutos")
    r = r.replace(/(\d+)\s*:\s*(\d+)\s*[-–—]\s*(\d+)/g, 'capítulo $1, versículos $2 a $3');
    r = r.replace(/(\d+)\s*:\s*(\d+)\s*,\s*(\d+)/g, 'capítulo $1, versículos $2 e $3');
    r = r.replace(/(\d+)\s*:\s*(\d+)/g, 'capítulo $1, versículo $2');

    // Suavização de pontuação
    r = r.replace(/\.{3,}/g, '. ');
    r = r.replace(/["“”«»]/g, ' ');
    r = r.replace(/\s+/g, ' ');

    return r.trim();
  }

  // ==========================================================================
  // CONSTRUÇÃO DE SEGMENTOS DEVOCIONAIS
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
        texto: humanizarTextoCompleto('Ministério Pão Diário. ' + tituloTexto + '.'),
        pausa: config.pausasMeditativas ? 220 : 80,
        rateFactor: 1.0,
        pitchFactor: 1.0
      });
    }

    // 2. REFERÊNCIA BÍBLICA E VERSÍCULO
    var elVbox = reader.querySelector('.vbox');
    var elAline = reader.querySelector('.vbox .aline') || reader.querySelector('.rh .bdgt');
    var refBruta = elAline ? elAline.textContent.replace(/^[-—\s]+/, '').trim() : '';
    var refHumanizada = humanizarTextoCompleto(refBruta);

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
        texto: humanizarTextoCompleto('Leitura da Palavra de Deus em ' + refHumanizada + ':'),
        pausa: config.pausasMeditativas ? 180 : 80,
        rateFactor: 1.0,
        pitchFactor: 1.0
      });
    }

    if (versiculoTexto) {
      segmentos.push({
        id: 'versiculo',
        elemento: elVbox,
        label: 'Versículo',
        texto: humanizarTextoCompleto('“' + versiculoTexto + '”'),
        pausa: config.pausasMeditativas ? 300 : 120,
        rateFactor: 1.0,
        pitchFactor: 1.0
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
        var txtBruto = item.txt;
        if (!txtBruto) return;

        var pboxPai = item.el.closest ? item.el.closest('.pbox') : null;
        var ehOracao = /^ora[çc][ãa]o\s*:/i.test(txtBruto) || !!pboxPai;

        if (ehOracao) {
          var corpoOracao = txtBruto.replace(/^ora[çc][ãa]o\s*:\s*/i, '').trim();
          var alvoEl = pboxPai || item.el;
          segmentos.push({
            id: 'oracao_intro_' + idx,
            elemento: alvoEl,
            label: 'Oração',
            texto: 'Momento de oração:',
            pausa: 160,
            rateFactor: 1.0,
            pitchFactor: 1.0
          });
          segmentos.push({
            id: 'oracao_corpo_' + idx,
            elemento: alvoEl,
            label: 'Oração',
            texto: humanizarTextoCompleto(corpoOracao),
            pausa: config.pausasMeditativas ? 300 : 120,
            rateFactor: 1.0,
            pitchFactor: 1.0
          });
        } else if (item.el.classList && item.el.classList.contains('autor-sign')) {
          segmentos.push({
            id: 'autor_' + idx,
            elemento: item.el,
            label: 'Autor',
            texto: humanizarTextoCompleto(txtBruto),
            pausa: 160,
            rateFactor: 1.0,
            pitchFactor: 1.0
          });
        } else {
          segmentos.push({
            id: 'paragrafo_' + idx,
            elemento: item.el,
            label: 'Reflexão',
            texto: humanizarTextoCompleto(txtBruto),
            pausa: config.pausasMeditativas ? 200 : 90,
            rateFactor: 1.02,
            pitchFactor: 1.0
          });
        }
      });
    }

    // 3.1 GENEALOGIA BÍBLICA
    var elGenealogia = reader.querySelector('.genealogia');
    if (elGenealogia) {
      var h3Gen = elGenealogia.querySelector('h3');
      var tituloGen = h3Gen ? h3Gen.textContent.trim() : 'Linhagem e genealogia:';
      var lisGen = elGenealogia.querySelectorAll('li');
      var nomesGen = [];
      lisGen.forEach(function (li) {
        var t = li.textContent.trim();
        if (t) nomesGen.push(t);
      });
      if (nomesGen.length > 0) {
        segmentos.push({
          id: 'genealogia_intro',
          elemento: elGenealogia,
          label: 'Genealogia',
          texto: humanizarTextoCompleto(tituloGen),
          pausa: 180,
          rateFactor: 1.0,
          pitchFactor: 1.0
        });
        segmentos.push({
          id: 'genealogia_lista',
          elemento: elGenealogia,
          label: 'Genealogia',
          texto: humanizarTextoCompleto(nomesGen.join(', ') + '.'),
          pausa: config.pausasMeditativas ? 260 : 120,
          rateFactor: 1.0,
          pitchFactor: 1.0
        });
      }
    }

    // 4. HORA DE REFLETIR (MEDITAÇÃO)
    var elMbox = reader.querySelector('.mbox');
    var elMboxP = reader.querySelector('.mbox p');
    var meditacaoTexto = elMboxP ? elMboxP.textContent : '';
    if (meditacaoTexto) {
      segmentos.push({
        id: 'meditacao_intro',
        elemento: elMbox,
        label: 'Hora de Refletir',
        texto: 'Hora de refletir:',
        pausa: 160,
        rateFactor: 1.0,
        pitchFactor: 1.0
      });
      segmentos.push({
        id: 'meditacao_corpo',
        elemento: elMbox,
        label: 'Hora de Refletir',
        texto: humanizarTextoCompleto(meditacaoTexto),
        pausa: config.pausasMeditativas ? 280 : 120,
        rateFactor: 1.02,
        pitchFactor: 1.0
      });
    }

    // 4.1 ORAÇÃO DEDICADA (fora do corpo de texto)
    var elOracaoDedicada = reader.querySelector('.rb > .pbox');
    if (elOracaoDedicada) {
      var elOracaoP = elOracaoDedicada.querySelector('p');
      var oracaoTexto = elOracaoP ? elOracaoP.textContent.trim() : '';
      if (oracaoTexto) {
        segmentos.push({
          id: 'oracao_dedicada_intro',
          elemento: elOracaoDedicada,
          label: 'Momento de Oração',
          texto: 'Momento de oração:',
          pausa: 160,
          rateFactor: 1.0,
          pitchFactor: 1.0
        });
        segmentos.push({
          id: 'oracao_dedicada_corpo',
          elemento: elOracaoDedicada,
          label: 'Momento de Oração',
          texto: humanizarTextoCompleto(oracaoTexto),
          pausa: config.pausasMeditativas ? 300 : 120,
          rateFactor: 1.0,
          pitchFactor: 1.0
        });
      }
    }

    // 4.2 APLICAÇÃO PRÁTICA / PERGUNTA FINAL
    var elAplicacao = reader.querySelector('.aplicacao-box');
    if (elAplicacao) {
      var elAppLabel = elAplicacao.querySelector('.label');
      var labelApp = elAppLabel ? elAppLabel.textContent.trim() : 'Pergunta para Reflexão';
      var cloneApp = elAplicacao.cloneNode(true);
      var cloneLabel = cloneApp.querySelector('.label');
      if (cloneLabel) cloneLabel.remove();
      var textoApp = cloneApp.textContent.trim();
      if (textoApp) {
        segmentos.push({
          id: 'aplicacao_intro',
          elemento: elAplicacao,
          label: 'Aplicação',
          texto: humanizarTextoCompleto(labelApp + ':'),
          pausa: 160,
          rateFactor: 1.0,
          pitchFactor: 1.0
        });
        segmentos.push({
          id: 'aplicacao_corpo',
          elemento: elAplicacao,
          label: 'Aplicação',
          texto: humanizarTextoCompleto(textoApp),
          pausa: config.pausasMeditativas ? 280 : 120,
          rateFactor: 1.02,
          pitchFactor: 1.0
        });
      }
    }

    // 5. ENCERRAMENTO COM BÊNÇÃO
    segmentos.push({
      id: 'bencao_final',
      elemento: null,
      label: 'Conclusão',
      texto: 'Que a paz e a bênção de Deus acompanhem o seu dia. Amém.',
      pausa: 120,
      rateFactor: 1.0,
      pitchFactor: 1.0
    });

    return segmentos;
  }

  // ==========================================================================
  // DESTAQUE VISUAL
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

    // Velocidade ágil e dinâmica: suporta de 0.80x até 2.80x
    var baseRate = parseFloat(config.rate) || 1.15;
    var basePitch = parseFloat(config.pitch) || 1.00;
    var baseVolume = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;

    ut.rate = Math.max(0.5, Math.min(3.0, baseRate * (seg.rateFactor || 1.0)));
    ut.pitch = Math.max(0.7, Math.min(1.4, basePitch * (seg.pitchFactor || 1.0)));
    ut.volume = Math.max(0.0, Math.min(1.0, baseVolume));
    ut.lang = voz ? voz.lang : 'pt-PT';

    estado.utteranceAtual = ut;
    window.__pd_current_utterance = ut;

    ut.onend = function () {
      if (estado.status !== 'playing') return;

      // Pausas dinâmicas ajustadas à velocidade (elimina paragens lentas a velocidades altas)
      var basePausa = seg.pausa || 160;
      var pausa = Math.round(basePausa / Math.max(1, baseRate));
      if (baseRate >= 1.4) pausa = Math.min(pausa, 50);
      if (baseRate >= 2.0) pausa = Math.min(pausa, 20);

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

      setTimeout(function () {
        if (estado.status === 'playing') tocarSegmento(indice + 1);
      }, 100);
    };

    window.speechSynthesis.speak(ut);
  }

  function iniciarLeitura() {
    if (!('speechSynthesis' in window)) {
      alert('O seu navegador não suporta a síntese de voz (Web Speech API).');
      return;
    }

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
    iniciarMusicaAmbiente(); // Inicia música ambiente suave
    atualizarBotoesUI();

    if (!vozesPronto) {
      atualizarVozes();
      setTimeout(function () {
        tocarSegmento(0);
      }, 120);
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
      pararMusicaAmbiente(false); // Fade out suave da música
      atualizarBotoesUI();
      atualizarBarraEstado('Pausado', estado.indiceAtual + 1, estado.segmentos.length);
    }
  }

  function retomarLeitura() {
    if (estado.status === 'paused') {
      estado.status = 'playing';
      iniciarHeartbeat();
      iniciarMusicaAmbiente(); // Retoma música ambiente suave
      atualizarBotoesUI();
      window.speechSynthesis.resume();
      setTimeout(function () {
        if (!window.speechSynthesis.speaking && estado.status === 'playing') {
          tocarSegmento(estado.indiceAtual >= 0 ? estado.indiceAtual : 0);
        }
      }, 180);
    }
  }

  function pararLeitura() {
    estado.status = 'idle';
    estado.indiceAtual = -1;
    estado.utteranceAtual = null;

    if (estado.timerPausa) clearTimeout(estado.timerPausa);
    pararHeartbeat();
    pararMusicaAmbiente(false); // Fade out suave da música
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
      }, 3500);
    }
  }

  // ==========================================================================
  // ATUALIZAÇÃO EM TEMPO REAL E AMOSTRAS AUDÍVEIS
  // ==========================================================================
  function aplicarAjusteAoVivo(tocarAmostraSeOcioso) {
    if (estado.status === 'playing') {
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
          }, 30);
        }
      }, 70);
    } else if (tocarAmostraSeOcioso) {
      testarExemploDeVoz();
    }
  }

  function testarExemploDeVoz() {
    if (estado.status === 'playing' && estado.indiceAtual >= 0) {
      aplicarAjusteAoVivo(false);
      return;
    }

    if (testeTimer) clearTimeout(testeTimer);
    testeTimer = setTimeout(function () {
      if (estado.status !== 'playing') {
        window.speechSynthesis.cancel();
        var ut = new SpeechSynthesisUtterance('O Senhor é o meu pastor; nada me faltará. O amor tudo sofre, tudo crê, tudo espera. Que a paz de Deus esteja convosco.');
        var voz = obterMelhorVoz();
        if (voz) ut.voice = voz;
        ut.rate = parseFloat(config.rate) || 1.15;
        ut.pitch = parseFloat(config.pitch) || 1.00;
        ut.volume = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;
        ut.lang = voz ? voz.lang : 'pt-PT';
        window.__pd_current_utterance = ut;

        if (config.musicaFundo) {
          iniciarMusicaAmbiente();
          ut.onend = function () {
            if (estado.status !== 'playing') {
              pararMusicaAmbiente(false);
            }
          };
        }

        window.speechSynthesis.speak(ut);
      }
    }, 50);
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
        background: rgba(28, 11, 1, 0.97);
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

      /* Presets Rápidos */
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
        <button type="button" class="voz-btn voz-btn-primary" id="vozBtnPlay" title="Ouvir reflexão narrada com música suave">
          <span id="vozPlayIcon">▶</span>
          <span id="vozPlayTexto">Ouvir mensagem</span>
        </button>

        <button type="button" class="voz-btn voz-btn-secondary" id="vozBtnStop" style="display:none;" title="Parar narração">
          <span>⏹</span>
          <span>Parar</span>
        </button>

        <button type="button" class="voz-btn voz-btn-settings" id="vozBtnSettings" title="Personalizar voz natural, velocidade até 2.8x e música">
          <span>⚙</span>
          <span>Ajustes & Música</span>
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
            <span>Narração Humanizada & Música de Fundo</span>
          </div>
          <button type="button" class="voz-panel-close" id="vozBtnCloseSettings" aria-label="Fechar ajustes">✕</button>
        </div>

        <div class="voz-setting-row">
          <label class="voz-setting-label">Velocidade Pré-definida:</label>
          <div class="voz-presets-wrap">
            <button type="button" class="voz-preset-chip active" data-preset="natural" title="Leitura fluida e expressiva">
              🌟 Natural (1.15x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="rapida" title="Leitura rápida e envolvente">
              ⚡ Rápida (1.50x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="super" title="Leitura acelerada">
              🚀 Super Rápida (2.00x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="maxima" title="Velocidade máxima de escuta">
              ⚡⚡ Máxima (2.50x)
            </button>
            <button type="button" class="voz-preset-chip" data-preset="serena" title="Cadência tranquila para meditação">
              🕊️ Serena (0.95x)
            </button>
          </div>
        </div>

        <!-- MÚSICA AMBIENTE SUAVE -->
        <div class="voz-setting-row" style="background:rgba(245,185,66,0.12);padding:14px 16px;border-radius:12px;border:1px solid rgba(245,185,66,0.35);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label class="voz-checkbox-row" style="margin-top:0;font-weight:700;color:#f5b942;">
              <input type="checkbox" id="vozCheckMusica" checked>
              <span>🎵 Música Suave de Fundo (Paz Devocional)</span>
            </label>
          </div>
          <div class="voz-setting-label" style="margin-top:10px;margin-bottom:4px;">
            <label for="vozRangeVolMusica" style="font-size:0.75rem;opacity:0.9;">Volume da Música Ambiente:</label>
            <span class="voz-badge-val" id="vozBadgeVolMusica">35%</span>
          </div>
          <input type="range" id="vozRangeVolMusica" class="voz-range" min="0.05" max="1.00" step="0.05" value="0.35">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <span style="font-size:0.68rem;color:#f0dbc0;opacity:0.85;">Suave (20%) — Média (50%) — Máxima (100%)</span>
            <button type="button" id="vozBtnTestarMusica" style="background:rgba(245,185,66,0.2);border:1px solid rgba(245,185,66,0.45);color:#f5b942;padding:4px 12px;border-radius:12px;font-size:0.74rem;font-weight:700;cursor:pointer;">
              🎵 Ouvir / Testar Música
            </button>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozSelectVoz">🎙️ Voz da Narração:</label>
            <span class="voz-badge-val" id="vozBadgeNome">Automático (Natural)</span>
          </div>
          <select id="vozSelectVoz" class="voz-select"></select>
          <div class="voz-help-tip" id="vozHelpTip">
            ✨ Prioridade ativa: Vozes neurais e de estúdio (Duarte, Antonio, Raquel, Google) para pronúncia fluida e sem efeito mecânico.
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangeRate">⏱️ Velocidade da Fala (Até 2.80x):</label>
            <span class="voz-badge-val" id="vozBadgeRate">1.15x (Fluida & Natural)</span>
          </div>
          <input type="range" id="vozRangeRate" class="voz-range" min="0.80" max="2.80" step="0.05" value="1.15">
          <div class="voz-range-sub">
            <span>Mais Calma (0.80x)</span>
            <span>Fluida (1.15x)</span>
            <span>2.50x Ultra Rápida</span>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangePitch">🎵 Tom de Voz (Timbre):</label>
            <span class="voz-badge-val" id="vozBadgePitch">1.00 (Natural Humano)</span>
          </div>
          <input type="range" id="vozRangePitch" class="voz-range" min="0.85" max="1.15" step="0.02" value="1.00">
          <div class="voz-range-sub">
            <span>Mais Encorpado</span>
            <span>Natural Humano (1.00)</span>
            <span>Mais Agudo</span>
          </div>
        </div>

        <div class="voz-setting-row">
          <div class="voz-setting-label">
            <label for="vozRangeVolume">🔊 Volume da Voz:</label>
            <span class="voz-badge-val" id="vozBadgeVolume">100%</span>
          </div>
          <input type="range" id="vozRangeVolume" class="voz-range" min="0" max="1" step="0.05" value="1">
        </div>

        <div class="voz-setting-row">
          <label class="voz-checkbox-row">
            <input type="checkbox" id="vozCheckPausas" checked>
            <span>Pausas naturais entre títulos, versículos e reflexão</span>
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
            ↺ Restaurar Padrão
          </button>
          <button type="button" class="voz-btn voz-btn-primary" id="vozBtnTestarExemplo" style="padding:6px 16px;font-size:0.78rem;">
            ▶ Testar Voz e Ritmo
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
    optAuto.textContent = '🌟 Melhor Voz Natural de Estúdio Automática (Recomendado)';
    select.appendChild(optAuto);

    if (!vozesCache || vozesCache.length === 0) return;

    var vozesPT = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') === 0; });
    var outras = vozesCache.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('pt') !== 0; });

    var vozesNaturais = [];
    var vozesLocais = [];

    vozesPT.forEach(function (v) {
      if (ehVozNaturalEstudio(v)) {
        vozesNaturais.push(v);
      } else {
        vozesLocais.push(v);
      }
    });

    vozesNaturais.sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });
    vozesLocais.sort(function (a, b) { return classificarVoz(b) - classificarVoz(a); });

    if (vozesNaturais.length > 0) {
      var grupoNatural = document.createElement('optgroup');
      grupoNatural.label = '✨ Vozes Naturais de Alta Definição (Humanizadas)';
      vozesNaturais.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        var rotulo = '🎙️ ' + v.name + ' (' + v.lang + ')';
        if (v.name.toLowerCase().indexOf('duarte') !== -1) {
          rotulo = '🎙️ Duarte Natural (PT-PT) — Estúdio Devocional';
        } else if (v.name.toLowerCase().indexOf('antonio') !== -1 || v.name.toLowerCase().indexOf('antónio') !== -1) {
          rotulo = '🎙️ Antonio Natural (PT-BR) — Voz Madura de Estúdio';
        } else if (v.name.toLowerCase().indexOf('raquel') !== -1) {
          rotulo = '🎙️ Raquel Natural (PT-PT) — Clara e Serena';
        } else if (v.name.toLowerCase().indexOf('francisca') !== -1) {
          rotulo = '🎙️ Francisca Natural (PT-BR) — Suave e Fluida';
        }
        opt.textContent = rotulo;
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoNatural.appendChild(opt);
      });
      select.appendChild(grupoNatural);
    }

    if (vozesLocais.length > 0) {
      var grupoLocais = document.createElement('optgroup');
      grupoLocais.label = '🔊 Outras Vozes do Sistema';
      vozesLocais.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = '🗣️ ' + v.name + ' (' + v.lang + ')';
        if (config.voiceURI === v.voiceURI) opt.selected = true;
        grupoLocais.appendChild(opt);
      });
      select.appendChild(grupoLocais);
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
    var checkMusica = document.getElementById('vozCheckMusica');
    var rangeVolMusica = document.getElementById('vozRangeVolMusica');
    var badgeVolMusica = document.getElementById('vozBadgeVolMusica');
    var checkPausas = document.getElementById('vozCheckPausas');
    var checkRef = document.getElementById('vozCheckRef');
    var checkDestaque = document.getElementById('vozCheckDestaque');

    var r = parseFloat(config.rate) || 1.15;
    var p = parseFloat(config.pitch) || 1.00;
    var vol = parseFloat(config.volume) !== undefined ? parseFloat(config.volume) : 1.0;
    var volM = parseFloat(config.volumeMusica) !== undefined ? parseFloat(config.volumeMusica) : 0.35;

    if (rangeRate && badgeRate) {
      rangeRate.value = r;
      var descRate = r < 1.0 ? 'Calma' : (r <= 1.25 ? 'Fluida & Natural' : (r <= 1.75 ? 'Rápida' : (r <= 2.25 ? 'Super Rápida' : 'Velocidade Máxima')));
      badgeRate.textContent = r.toFixed(2) + 'x (' + descRate + ')';
    }

    if (rangePitch && badgePitch) {
      rangePitch.value = p;
      var descPitch = p < 0.94 ? 'Encorpado' : (p <= 1.06 ? 'Natural Humano' : 'Mais Agudo');
      badgePitch.textContent = p.toFixed(2) + ' (' + descPitch + ')';
    }

    if (rangeVolume && badgeVolume) {
      rangeVolume.value = vol;
      badgeVolume.textContent = Math.round(vol * 100) + '%';
    }

    if (checkMusica) checkMusica.checked = !!config.musicaFundo;

    if (rangeVolMusica && badgeVolMusica) {
      rangeVolMusica.value = volM;
      badgeVolMusica.textContent = Math.round(volM * 100) + '%';
    }

    if (checkPausas) checkPausas.checked = !!config.pausasMeditativas;
    if (checkRef) checkRef.checked = !!config.humanizarReferencias;
    if (checkDestaque) checkDestaque.checked = !!config.destacarTexto;

    // Atualiza seleção dos botões de preset
    document.querySelectorAll('.voz-preset-chip').forEach(function (chip) {
      var preset = chip.getAttribute('data-preset');
      var ativo = false;
      if (preset === 'natural' && Math.abs(r - 1.15) < 0.05) ativo = true;
      if (preset === 'rapida' && Math.abs(r - 1.50) < 0.05) ativo = true;
      if (preset === 'super' && Math.abs(r - 2.00) < 0.05) ativo = true;
      if (preset === 'maxima' && Math.abs(r - 2.50) < 0.05) ativo = true;
      if (preset === 'serena' && Math.abs(r - 0.95) < 0.05) ativo = true;
      chip.classList.toggle('active', ativo);
    });
  }

  function aplicarPreset(preset) {
    if (preset === 'natural') {
      config.rate = 1.15;
      config.pitch = 1.00;
      config.pausasMeditativas = true;
    } else if (preset === 'rapida') {
      config.rate = 1.50;
      config.pitch = 1.00;
      config.pausasMeditativas = true;
    } else if (preset === 'super') {
      config.rate = 2.00;
      config.pitch = 1.00;
      config.pausasMeditativas = false;
    } else if (preset === 'maxima') {
      config.rate = 2.50;
      config.pitch = 1.00;
      config.pausasMeditativas = false;
    } else if (preset === 'serena') {
      config.rate = 0.95;
      config.pitch = 1.00;
      config.pausasMeditativas = true;
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
    var checkMusica = wrapper.querySelector('#vozCheckMusica');
    var rangeVolMusica = wrapper.querySelector('#vozRangeVolMusica');
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

    var btnTestarMusica = wrapper.querySelector('#vozBtnTestarMusica');

    if (btnTestarMusica) {
      btnTestarMusica.addEventListener('click', toggleTestarMusica);
    }

    if (checkMusica) {
      checkMusica.addEventListener('change', function () {
        config.musicaFundo = this.checked;
        salvarConfig();
        if (config.musicaFundo && (estado.status === 'playing' || musicPlaying)) {
          iniciarMusicaAmbiente();
        } else if (!config.musicaFundo) {
          pararMusicaAmbiente(false);
        }
      });
    }

    if (rangeVolMusica) {
      rangeVolMusica.addEventListener('input', function () {
        config.volumeMusica = parseFloat(this.value);
        salvarConfig();
        sincronizarValoresAjustes();
        if (musicMasterGain && audioCtx && musicPlaying) {
          try {
            musicMasterGain.gain.setValueAtTime(config.volumeMusica, audioCtx.currentTime);
          } catch (e) {}
        }
      });
      rangeVolMusica.addEventListener('change', function () {
        if (!musicPlaying && config.musicaFundo) {
          iniciarMusicaAmbiente();
        }
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
    if (typeof window.showReader === 'function' && !window.showReader.__vozInterceptado) {
      var origemShowReader = window.showReader;
      var novoShowReader = function (i) {
        origemShowReader(i);
        injetarBotoes();
      };
      novoShowReader.__vozInterceptado = true;
      window.showReader = novoShowReader;
    }

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
    pararMusicaAmbiente(true);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });
})();
