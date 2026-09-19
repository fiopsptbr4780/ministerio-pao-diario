/*
  voz.js
  Leitura em voz alta (Web Speech API) das mensagens do Ministerio Pao Diario.
  Integrado com a estrutura real do index.html: usa as variaveis globais
  "msgs" e "cur" definidas la, e injeta os botoes dentro do cabecalho ".rh"
  sempre que showReader(i) e chamado.
*/

(function () {
  var utteranceAtual = null;
  var origemShowReader = null;

  function obterVozPortuguesa() {
    var vozes = window.speechSynthesis.getVoices();
    return (
      vozes.find(function (v) { return v.lang.toLowerCase() === 'pt-pt'; }) ||
      vozes.find(function (v) { return v.lang.toLowerCase() === 'pt-br'; }) ||
      vozes.find(function (v) { return v.lang.toLowerCase().indexOf('pt') === 0; }) ||
      null
    );
  }

  function montarTextoFala(m) {
    if (!m) return '';
    var partes = [];
    if (m.titulo) partes.push(m.titulo);
    if (m.ref) partes.push(m.ref);
    if (m.versiculoTexto) partes.push(m.versiculoTexto);
    if (m.texto) partes.push(m.texto);
    if (m.meditacao) partes.push('Reflexao: ' + m.meditacao);
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

  function iniciarLeitura(mensagem, btnOuvir) {
    if (!('speechSynthesis' in window)) {
      alert('O seu navegador nao suporta leitura em voz alta.');
      return;
    }

    window.speechSynthesis.cancel();

    var texto = montarTextoFala(mensagem);
    if (!texto) return;

    utteranceAtual = new SpeechSynthesisUtterance(texto);
    utteranceAtual.lang = 'pt-PT';
    utteranceAtual.rate = 0.95;
    utteranceAtual.pitch = 1;

    var voz = obterVozPortuguesa();
    if (voz) utteranceAtual.voice = voz;

    btnOuvir.textContent = '\uD83D\uDD0A A ler...';
    btnOuvir.disabled = true;

    utteranceAtual.onend = function () {
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
    };
    utteranceAtual.onerror = function () {
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
    };

    window.speechSynthesis.speak(utteranceAtual);
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
      var mensagemAtual = (window.msgs && window.msgs[window.cur]) ? window.msgs[window.cur] : null;
      iniciarLeitura(mensagemAtual, btnOuvir);
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
    }
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function () {};
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
