/* scan.js — kamera kontrolü, QR okuma akışı, fotoğraftan okuma, el terminali girişi */
(function (global) {
  'use strict';

  var A = global.App, $ = A.$, $$ = A.$$, state = A.state;
  var scanner = null;

  var MSG = {
    idle: { icon: '📷', t: 'Kamerayı başlat', d: 'Ürünlerin üzerindeki QR kodu okutmak için kamerayı açın.' },
    requesting: { icon: '⏳', t: 'İzin bekleniyor', d: 'Tarayıcı kamera izni istiyor — “İzin ver” deyin.' },
    denied: { icon: '🚫', t: 'Kamera izni reddedildi', d: 'Tarayıcı adres çubuğundaki kilit/kamera simgesinden izni açın, sonra tekrar deneyin.' },
    'no-secure': { icon: '🔒', t: 'Güvenli bağlantı gerekli', d: 'Kamera yalnızca HTTPS veya localhost üzerinde çalışır. Kurulum kılavuzuna bakın (kurulum.html).' },
    'no-camera': { icon: '📵', t: 'Kamera bulunamadı', d: 'Bu cihazda kamera yok ya da başka bir uygulama kullanıyor. “Fotoğraftan” seçeneğini deneyin.' },
    busy: { icon: '⚠️', t: 'Kamera meşgul', d: 'Kamerayı kullanan diğer uygulamayı kapatın (QR tarayıcı, Zoom, WhatsApp…) ve tekrar deneyin.' },
    error: { icon: '⚠️', t: 'Kamera açılamadı', d: 'Cihazı/tarayıcıyı kapatıp tekrar deneyin. Gerekirse “Fotoğraftan” seçeneğini kullanın.' },
    'no-decoder': { icon: '⚠️', t: 'QR motoru yüklenemedi', d: 'vendor/jsQR.js dosyası eksik. Uygulamayı tam kopyaladığınızdan emin olun.' },
    stopped: { icon: '⏸️', t: 'Kamera durduruldu', d: 'Devam etmek için ⏻ veya “Kamerayı başlat” düğmesine basın.' }
  };

  function ensure() {
    if (scanner) return scanner;
    scanner = new global.Scanner();
    scanner.onCode = function (raw) {
      if (state.paused) return;
      A.items.ingest(raw, 'qr');
    };
    scanner.onStatus = onStatus;
    return scanner;
  }

  function camMsg(key, extra) {
    var m = MSG[key] || MSG.error;
    var box = $('#camMsg');
    box.classList.remove('hidden');
    box.innerHTML = '<div><div class="big">' + m.icon + '</div><b>' + m.t + '</b><div class="muted">' +
      (extra || m.d) + '</div>' +
      (key === 'idle' || key === 'stopped' || key === 'error' || key === 'denied' || key === 'no-camera' || key === 'busy'
        ? '<button class="btn primary mt12" type="button" id="camMsgBtn">📷 Kamerayı başlat</button>' : '') +
      '</div>';
    var b = $('#camMsgBtn');
    if (b) b.onclick = startCam;
  }

  function pauseScan(text) {
    state.paused = true;
    var box = $('#camMsg');
    box.classList.remove('hidden');
    box.innerHTML = '<div><div class="big">✅</div><b>Okundu</b><div class="muted">' + text + '</div>' +
      '<button class="btn ok mt12" type="button" id="camResume">▶️ Taramaya devam</button></div>';
    $('#camResume').onclick = function () { resumeScan(); };
  }
  function resumeScan() {
    state.paused = false;
    if (scanner && scanner.running) $('#camMsg').classList.add('hidden');
  }

  function onStatus(st, detail) {
    var dot = $('#camDot'), txt = $('#camState');
    dot.classList.toggle('live', st === 'live');
    dot.classList.toggle('err', st === 'denied' || st === 'error' || st === 'no-camera' || st === 'busy' || st === 'no-secure' || st === 'no-decoder');
    txt.textContent = {
      live: 'Tarama hazır', requesting: 'İzin bekleniyor…', denied: 'İzin yok',
      'no-secure': 'HTTPS gerekli', 'no-camera': 'Kamera yok', busy: 'Kamera meşgul',
      stopped: 'Durduruldu', 'no-decoder': 'Motor yok', idle: 'Kamera kapalı'
    }[st] || 'Hazır değil';

    var baslik = $('#scanTitle');
    if (baslik) {
      baslik.textContent = st === 'live' ? 'Tarama hazır — kodu çerçeveye tutun'
        : st === 'requesting' ? 'Kamera izni bekleniyor…' : 'Kamerayı başlat';
    }

    if (st === 'live') {
      resumeScan();
      $('#btnStartCam').classList.add('hidden');
      $('#btnTorch').disabled = !(scanner && scanner.torchCapable);
      $('#decoderName').textContent = scanner && scanner.native ? 'yerleşik (hızlı)' : 'jsQR (yedek)';
      $('#sysDecoder') && ($('#sysDecoder').textContent = scanner.native ? 'Yerleşik BarcodeDetector' : 'jsQR');
    } else if (st !== 'requesting') {
      camMsg(st === 'idle' ? 'idle' : st, detail);
      $('#btnStartCam').classList.remove('hidden');
    }
  }

  function startCam() {
    ensure();
    state.camWanted = true;
    resumeScan();
    $('#camMsg').classList.remove('hidden');
    $('#camMsg').innerHTML = '<div><div class="big">⏳</div><b>Kamera açılıyor…</b></div>';
    return scanner.start($('#cam')).then(function (ok) {
      if (ok) {
        $('#reticle').style.display = '';
        A.toast('Kamera hazır', 'QR kodu çerçeveye tutun', 'ok', 1700);
      }
      return ok;
    });
  }

  function stopCam() {
    state.camWanted = false;
    if (!scanner) { camMsg('idle'); return; }
    scanner.stop();
    camMsg('idle');
    $('#btnStartCam').classList.remove('hidden');
  }

  function toggleTorch() {
    if (!scanner || !scanner.torchCapable) {
      A.toast('El feneri yok', 'Bu cihaz/uygulama kontrol etmeye izin vermiyor', 'warn');
      return;
    }
    var want = !scanner.torchOn;
    scanner.setTorch(want).then(function (ok) {
      $('#btnTorch').classList.toggle('on', !!(ok && want));
      if (!ok) A.toast('Fener açılamadı', '', 'warn');
    });
  }

  /* ---------- el terminali / Bluetooth barkod okuyucu ---------- */
  function bindKeyboardWedge() {
    var buf = '', last = 0;
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      var now = Date.now();
      if (now - last > 2500) buf = '';
      last = now;
      if (e.key === 'Enter') {
        if (buf.length > 2) {
          e.preventDefault();
          A.items.ingest(buf, 'el-terminali');
        }
        buf = '';
        return;
      }
      if (e.key && e.key.length === 1) buf += e.key;
    });
  }

  /* ---------- fotoğraftan okuma ---------- */
  function bindPhoto() {
    $('#btnPhotoBtn').onclick = function () { $('#photoInput').click(); };
    $('#photoInput').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      A.toast('Fotoğraf çözülüyor…', '', '', 1400);
      global.Scanner.decodeImage(f).then(function (text) {
        $('#photoInput').value = '';
        if (!text) {
          A.beep('bad');
          A.toast('Kod bulunamadı', 'Fotoğrafı daha yakın ve net çekip tekrar deneyin', 'bad', 3600);
          return;
        }
        A.items.ingest(text, 'fotoğraf');
      }).catch(function () {
        A.toast('Okunamadı', 'Görsel işlenemedi', 'bad');
      });
    };
  }

  function bind() {
    ensure();
    onStatus('idle');
    $('#btnStartCam').onclick = startCam;
    $('#btnCamToggle').onclick = function () {
      if (scanner && scanner.running) stopCam(); else startCam();
    };
    $('#btnTorch').onclick = toggleTorch;
    $('#btnFlip').onclick = function () {
      if (!scanner || !scanner.running) return;
      scanner.flip().then(function () { A.toast('Kamera değiştirildi', ''); });
    };
    $('#btnFs').onclick = function () {
      var el = $('#camWrap');
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) { }
    };
    $('#btnManual').onclick = function () {
      A.items.openEditor(A.P.emptyItem(), true);
    };
    $('#camMsg').addEventListener('click', function (e) {
      if (e.target === $('#camMsg') && scanner && scanner.running) resumeScan();
    });
    document.addEventListener('visibilitychange', function () {
      if (!scanner) return;
      if (document.hidden && scanner.running) { scanner.stop(); camMsg('stopped'); }
    });
    bindPhoto();
    bindKeyboardWedge();
  }

  global.App.scan = {
    bind: bind, start: startCam, stop: stopCam,
    duraklat: function (mesaj) { if (scanner && scanner.running) pauseScan(mesaj || 'Duraklatıldı'); },
    devam: function () { resumeScan(); },
    isRunning: function () { return !!(scanner && scanner.running); },
    status: function () { return scanner; }
  };
})(window);
