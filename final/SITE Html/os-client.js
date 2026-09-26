/* ==============================================================
   PC BUILD SIMULATOR — envio da build e acompanhamento da fila
   --------------------------------------------------------------
   Fluxo: este site → fenecan-backend (interligando/) → O.S.

   1. "Continuar" envia a configuração: POST /build
   2. A tela de fila acompanha: GET /build/:id/position e GET /queue
   3. Quando a build entra em montagem, libera a tela de montagem.

   Endereço da API (nesta ordem):
     ?api=http://192.168.0.20:3000   na URL da página
     window.FENECAN_API_URL          definido antes deste script
     http://<mesmo host da página>:3000   (padrão)
   ============================================================== */
(function () {
  'use strict';

  var POLL_MS = 2000;

  var API_URL = (function () {
    var fromQuery = new URLSearchParams(location.search).get('api');
    var host = location.hostname || 'localhost';
    var url = fromQuery || window.FENECAN_API_URL || ('http://' + host + ':3000');
    return String(url).replace(/\/+$/, '');
  })();

  /*
   * O site só oferece 4 categorias (cpu, gpu, ram, ssd), mas o contrato da
   * API (e da O.S. e da Unity) tem 7 componentes. Os 3 que o visitante não
   * escolhe são derivados das escolhas, sempre compatíveis entre si.
   * Quando o catálogo ganhar esses cards, basta ter inputs com
   * name="motherboard" / "psu" / "case" que eles passam a valer.
   */
  function motherboardFor(cpu) {
    return /^i\d|intel/.test(cpu) ? 'b660' : 'b550';
  }
  function psuFor(gpu) {
    return /4070|4080|4090|7800|7900/.test(gpu) ? '750w' : '650w';
  }

  function picked(name) {
    var input = document.querySelector('input[name="' + name + '"]:checked');
    return input ? input.value : null;
  }

  function collectBuild() {
    var cpu = picked('cpu');
    var gpu = picked('gpu');
    var ram = picked('ram');
    var storage = picked('ssd');
    if (!cpu || !gpu || !ram || !storage) {
      return null;
    }
    return {
      cpu: cpu,
      gpu: gpu,
      ram: ram,
      storage: storage,
      motherboard: picked('motherboard') || motherboardFor(cpu),
      psu: picked('psu') || psuFor(gpu),
      case: picked('case') || 'mid-tower'
    };
  }

  function api(path, options) {
    return fetch(API_URL + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options)).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error(body.message || ('API respondeu ' + response.status));
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* ---------- envio ---------- */

  var sending = false;
  var current = null; // { buildId, timer }

  var noteEl = document.querySelector('.actionbar__note');
  var noteOriginal = noteEl ? noteEl.innerHTML : '';

  function actionNote(text) {
    if (noteEl) noteEl.textContent = text;
  }

  function restoreNote() {
    if (noteEl) noteEl.innerHTML = noteOriginal;
    if (typeof refreshSummary === 'function') refreshSummary();
  }

  function sendBuild(event) {
    // Sem stopPropagation, o script de navegação da página trocaria de tela
    // antes de a API confirmar a build.
    event.preventDefault();
    event.stopPropagation();
    if (sending) return;

    var build = collectBuild();
    if (!build) {
      actionNote('Escolha uma peça em cada categoria antes de continuar.');
      return;
    }

    sending = true;
    actionNote('Enviando sua build...');

    api('/build', { method: 'POST', body: JSON.stringify(build) })
      .then(function (created) {
        restoreNote();
        startTracking(created.buildId);
        showScreen('screen-status');
      })
      .catch(function (error) {
        var detail = error.body && error.body.details && error.body.details[0];
        actionNote('Não foi possível enviar: ' +
          (detail ? detail.field + ' — ' + detail.message : error.message) +
          ' (API: ' + API_URL + ')');
      })
      .then(function () {
        sending = false;
      });
  }

  /* ---------- acompanhamento ---------- */

  var montageLink = document.querySelector('#screen-status a[href="#screen-montage"]');

  // `.btn` define display, então o atributo `hidden` sozinho não esconderia.
  function showMontageLink(visible) {
    if (montageLink) montageLink.style.display = visible ? '' : 'none';
  }

  function startTracking(buildId) {
    if (current) clearInterval(current.timer);

    var label = '#' + buildId.replace(/^BUILD-/, '');
    setText('build-number', label);
    setText('mount-build-number', label);
    setText('status-sub', 'Seus componentes foram validados e entraram na fila de montagem.');
    showMontageLink(false);

    current = { buildId: buildId, timer: setInterval(poll, POLL_MS) };
    poll();
  }

  function poll() {
    if (!current) return;
    var buildId = current.buildId;

    Promise.all([
      api('/build/' + encodeURIComponent(buildId) + '/position'),
      api('/queue')
    ]).then(function (results) {
      if (!current || current.buildId !== buildId) return;
      render(results[0], results[1]);
    }).catch(function () {
      setText('queue-eta', 'sem conexão com a API, tentando de novo...');
    });
  }

  function render(position, queue) {
    var counts = queue.counts || {};
    var total = (counts.WAITING || 0) + (counts.BUILDING || 0);
    setText('queue-total', String(total));

    switch (position.status) {
      case 'WAITING':
        setText('queue-position', pad(position.position));
        setText('queue-eta', position.position <= 1
          ? 'você é o próximo'
          : (position.position - 1) + ' build(s) antes da sua');
        if (!queue.unity || !queue.unity.connected) {
          setText('status-sub', 'Na fila. Aguardando o simulador ficar disponível.');
        }
        break;

      case 'BUILDING':
        setText('queue-position', '00');
        setText('queue-eta', 'em montagem agora');
        setText('status-sub', 'Sua build está sendo montada!');
        setText('mount-stage', 'Montagem em andamento');
        setText('mount-eta', 'acompanhe ao vivo');
        showMontageLink(true);
        break;

      case 'COMPLETED':
        finish('Montagem concluída!', 'Sua build foi montada com sucesso.');
        break;

      case 'ERROR':
        finish('Falha na montagem', 'O simulador informou um erro na montagem desta build.');
        break;
    }
  }

  function finish(stage, message) {
    clearInterval(current.timer);
    current = null;

    setText('queue-position', '00');
    setText('queue-eta', stage.toLowerCase());
    setText('status-sub', message);
    setText('mount-stage', stage);
    setText('mount-eta', '');

    var fill = document.getElementById('build-progress-fill');
    if (fill) {
      fill.style.animation = 'none';
      fill.style.width = '100%';
    }
    document.querySelectorAll('.checklist__item').forEach(function (item) {
      item.classList.remove('is-now');
      item.classList.add('is-done');
    });
    showMontageLink(true);
  }

  /* ---------- ligação com a página ---------- */

  var continueButton = document.querySelector('#screen-components .actionbar a[href="#screen-status"]');
  if (continueButton) {
    continueButton.addEventListener('click', sendBuild);
  }

  // O link "Acompanhar a montagem" só aparece quando a build entra em montagem.
  showMontageLink(false);

  // Recarregar a página na tela de fila, sem build enviada, volta para a escolha.
  if (location.hash === '#screen-status' || location.hash === '#screen-montage') {
    showScreen('screen-components');
  }

  window.PCBuildApi = { url: API_URL, collectBuild: collectBuild };
})();
