/*
  voz.js
  Adiciona botoes de leitura em voz alta (Web Speech API) as mensagens diarias
  do Ministerio Pao Diario. Nao depende de nenhuma biblioteca externa.

  Como usar no index.html:
  1) Adicione antes do </body>:
       <script src="voz.js"></script>
  2) No elemento onde o texto da mensagem diaria e mostrado, adicione a
     classe "mensagem-diaria" (ou ajuste SELETOR_MENSAGEM abaixo para o
     seletor real usado no seu HTML).
  3) O script insere automaticamente os botoes "Ouvir mensagem" e "Parar"
     no final desse elemento.
*/

(function () {
  var SELETOR_MENSAGEM = '.mensagem-diaria';

  var utteranceAtual = null;

  function obterVozPortuguesa() {
    var vozes = window.speechSynthesis.getVoices();
    return (
      vozes.find(function (v) { return v.lang.toLowerCase() === 'pt-pt'; }) ||
      vozes.find(function (v) { return v.lang.toLowerCase() === 'pt-br'; }) ||
      vozes.find(function (v) { return v.lang.toLowerCase().indexOf('pt') === 0; }) ||
      null
    );
  }

  function extrairTexto(elemento) {
    var clone = elemento.cloneNode(true);
    var remover = clone.querySelectorAll('.audio-controls, button, script, style');
    remover.forEach(function (el) { el.remove(); });
    return clone.innerText.replace(/\s+/g, ' ').trim();
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
    estilarBotao(btnOuvir);

    var btnParar = document.createElement('button');
    btnParar.type = 'button';
    btnParar.id = 'pararMensagemBtn';
    btnParar.textContent = '\u23F9 Parar';
    estilarBotao(btnParar);

    wrapper.appendChild(btnOuvir);
    wrapper.appendChild(btnParar);
    return wrapper;
  }

  function estilarBotao(botao) {
    botao.style.border = '0';
    botao.style.borderRadius = '999px';
    botao.style.padding = '10px 16px';
    botao.style.cursor = 'pointer';
    botao.style.fontSize = '0.95rem';
    botao.style.background = '#8b5e34';
    botao.style.color = '#fff';
    botao.addEventListener('mouseenter', function () { botao.style.background = '#6f4727'; });
    botao.addEventListener('mouseleave', function () { botao.style.background = '#8b5e34'; });
  }

  function configurarLeitura(elemento) {
    if (elemento.querySelector('.audio-controls')) return;

    var controlos = criarControlos();
    elemento.appendChild(controlos);

    var btnOuvir = controlos.querySelector('#lerMensagemBtn');
    var btnParar = controlos.querySelector('#pararMensagemBtn');

    btnOuvir.addEventListener('click', function () {
      if (!('speechSynthesis' in window)) {
        alert('O seu navegador nao suporta leitura em voz alta.');
        return;
      }

      window.speechSynthesis.cancel();

      var texto = extrairTexto(elemento);
      if (!texto) return;

      utteranceAtual = new SpeechSynthesisUtterance(texto);
      utteranceAtual.lang = 'pt-PT';
      utteranceAtual.rate = 0.9;
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
    });

    btnParar.addEventListener('click', function () {
      window.speechSynthesis.cancel();
      btnOuvir.textContent = '\uD83D\uDD0A Ouvir mensagem';
      btnOuvir.disabled = false;
    });
  }

  function inicializar() {
    var elementos = document.querySelectorAll(SELETOR_MENSAGEM);
    elementos.forEach(configurarLeitura);
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function () {};
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

  window.MinisterioPaoDiarioVoz = {
    reinicializar: inicializar,
    configurarElemento: configurarLeitura
  };
})();
