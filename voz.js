/*
  voz.js
  Leitura em voz alta (Web Speech API) das mensagens do Ministerio Pao Diario.

  v3: corrige a causa raiz do "sem som em nenhum navegador": no index.html as
  variaveis "msgs" e "cur" sao declaradas com "let" dentro do <script>, logo
  NAO existem como window.msgs / window.cur (let/const de topo de script nao
  cria propriedade em window). O voz.js tentava ler window.msgs e falhava
  silenciosamente. Agora extrai o texto diretamente do DOM ja renderizado
  por showReader (h1, .vbox, .mtxt, .mbox p), que sempre reflete a mensagem
  correta, sem depender de variaveis globais.
*/

(function () {
  var utteranceAtual = null;
  var origemShowReader = null;
  var vozesPronto = false;
  var vozesCache = [];

  function atualizarVozes() {
    vozesCache = window.speechSynthesis.getVoices();
    if (vozesCache && vozesCache.length > 0) vozesPronto = true;
  }

  function obterVozPortuguesa() {
    atualizarVozes();
    return (
      vozesCache.find(function (v) { return v.lang.toLowerCase() === 'pt-pt'; }) ||
      vozesCache.find(function (v) { return v.lang.toLowerCase() === 'pt-br'; }) ||
      vozesCache.find(function (v) { return v.lang.toLowerCase().indexOf('pt') === 0; }) ||
      null
    );
  }

  function textoLimpo(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function montarTextoFalaDoDOM() {
    var reader = document.getElementById('reader');
    if (!reader) return '';

    var titulo = textoLimpo(reader.querySelector('.rh h1'));
    var ref = textoLimpo(reader.querySelector('.rh .bdgt'));
    var versiculo = textoLimpo(reader.querySelector('.vbox'));
    var corpo = textoLimpo(reader.querySelector('.mtxt'));
    var meditacao = textoLimpo(reader.querySelector('.mbox p'));

    var partes = [];
    if (titulo) partes.push(titulo);
    if (versiculo) partes.push(versiculo);
    if (corpo) partes.push(corpo);
    if (meditacao) partes.push('Reflexao: ' + meditacao);

    return partes.join('. ').replace(/\s+/g, ' ').trim();
  }

  function criarControlos() {
    var wrapper = document.createElement('div');
    wrapper.className = 'audio-controls';
    wrapper.style.display = 'flex';
    wrapper.style.gap = '10px';
    wrapper.style.flexWrap = 'wrap';
    wrapper.style.marginTop = '16px';

    var btnOuvir = document.createElement('button');
    btnOuvir.type = 'button';
    btnOuvir.id = 'lerMensagemBtn';
    btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
    estilarBotao(btnOuvir, true);

    var btnParar = document.createElement('button');
    btnParar.type = 'button';
    btnParar.id = 'pararMensagemBtn';
    btnParar.textContent = '\u23F9 Parar';
    estilarBotao(btnParar, false);

    wrapper.appendChild(btnOuvir);
    wrapper.appendChild(btnParar);
    return wrapper;
  }

  function estilarBotao(botao, destaque) {
    botao.style.border = destaque ? '0' : '2px solid rgba(255,255,255,.6)';
    botao.style.borderRadius = '20px';
    botao.style.padding = '7px 16px';
    botao.style.cursor = 'pointer';
    botao.style.fontSize = '.8rem';
    botao.style.fontWeight = '700';
    botao.style.background = destaque ? 'rgba(255,255,255,.25)' : 'transparent';
    botao.style.color = '#fff';
    botao.style.fontFamily = 'inherit';
  }

  function pararLeitura(btnOuvir) {
    window.speechSynthesis.cancel();
    if (btnOuvir) {
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
    }
  }

  function falarAgora(texto, btnOuvir) {
    utteranceAtual = new SpeechSynthesisUtterance(texto);
    utteranceAtual.lang = 'pt-PT';
    utteranceAtual.rate = 0.95;
    utteranceAtual.pitch = 1;
    utteranceAtual.volume = 1;

    var voz = obterVozPortuguesa();
    if (voz) utteranceAtual.voice = voz;

    btnOuvir.textContent = '\uD83D\uDD0A A ler...';
    btnOuvir.disabled = true;

    utteranceAtual.onend = function () {
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
    };
    utteranceAtual.onerror = function (e) {
      console.warn('Erro na leitura em voz alta:', e.error);
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
      if (e.error === 'not-allowed' || e.error === 'audio-busy') {
        alert('O navegador bloqueou o audio. Tente clicar novamente no botao.');
      }
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utteranceAtual);

    setTimeout(function () {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        window.speechSynthesis.speak(utteranceAtual);
      }
    }, 400);
  }

  function iniciarLeitura(btnOuvir) {
    if (!('speechSynthesis' in window)) {
      alert('O seu navegador nao suporta leitura em voz alta.');
      return;
    }

    var texto = montarTextoFalaDoDOM();

    if (!texto) {
      alert('Nao foi possivel encontrar o texto da mensagem para ler.');
      return;
    }

    if (!vozesPronto) atualizarVozes();

    if (!vozesPronto) {
      var tentativas = 0;
      var esperar = setInterval(function () {
        tentativas++;
        atualizarVozes();
        if (vozesPronto || tentativas > 15) {
          clearInterval(esperar);
          falarAgora(texto, btnOuvir);
        }
      }, 100);
    } else {
      falarAgora(texto, btnOuvir);
    }
  }

  function injetarBotoes() {
    var cabecalho = document.querySelector('#reader .rh');
    if (!cabecalho) return;

    window.speechSynthesis.cancel();

    var existentes = cabecalho.querySelector('.audio-controls');
    if (existentes) existentes.remove();

    var controlos = criarControlos();
    cabecalho.appendChild(controlos);

    var btnOuvir = controlos.querySelector('#lerMensagemBtn');
    var btnParar = controlos.querySelector('#pararMensagemBtn');

    btnOuvir.addEventListener('click', function () {
      iniciarLeitura(btnOuvir);
    });

    btnParar.addEventListener('click', function () {
      pararLeitura(btnOuvir);
    });
  }

  function interceptarShowReader() {
    if (typeof window.showReader !== 'function' || window.showReader.__vozInterceptado) {
      return false;
    }
    origemShowReader = window.showReader;
    var novaFuncao = function (i) {
      origemShowReader(i);
      injetarBotoes();
    };
    novaFuncao.__vozInterceptado = true;
    window.showReader = novaFuncao;
    return true;
  }

  function interceptarShowIndexEShowCover() {
    ['showIndex', 'showCover', 'showGallery'].forEach(function (nome) {
      if (typeof window[nome] === 'function' && !window[nome].__vozInterceptado) {
        var original = window[nome];
        var nova = function () {
          window.speechSynthesis.cancel();
          return original.apply(this, arguments);
        };
        nova.__vozInterceptado = true;
        window[nome] = nova;
      }
    });
  }

  function tentarInicializar() {
    var ok = interceptarShowReader();
    interceptarShowIndexEShowCover();
    if (!ok) {
      setTimeout(tentarInicializar, 200);
    } else {
      setInterval(interceptarShowReader, 1000);
    }
  }

  if ('speechSynthesis' in window) {
    atualizarVozes();
    window.speechSynthesis.onvoiceschanged = atualizarVozes;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tentarInicializar);
  } else {
    tentarInicializar();
  }

  window.addEventListener('beforeunload', function () {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });
})();
