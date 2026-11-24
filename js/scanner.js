/* scanner.js — kamera görüntüsünden QR kod okuma
 * Android Chrome'da yerleşik BarcodeDetector (hızlı), yoksa jsQR (her cihazda çalışır).
 * Gereksinim: HTTPS veya localhost (tarayıcı kamera izni için şart).
 */
(function (global) {
  'use strict';

  var FORMATS = ['qr_code', 'data_matrix', 'aztec_code', 'pdf417', 'code_128'];

  function hasJsQR() { return typeof global.jsQR === 'function'; }

  function makeDetector() {
    if (!('BarcodeDetector' in global)) return Promise.resolve(null);
    var D = global.BarcodeDetector;
    return Promise.resolve(D.getSupportedFormats ? D.getSupportedFormats() : Promise.resolve(['qr_code']))
      .then(function (fmts) {
        fmts = fmts || [];
        var use = FORMATS.filter(function (f) { return fmts.indexOf(f) > -1; });
        if (!use.length) use = ['qr_code'];
        try { return new D({ formats: use }); } catch (e) { return null; }
      })
      .catch(function () { return null; });
  }

  function Scanner() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.detector = null;
    this.native = false;
    this.stream = null;
    this.track = null;
    this.facing = 'environment';
    this.running = false;
    this.busy = false;
    this.torchOn = false;
    this.torchCapable = false;
    this.zoomCapable = null;
    this.onCode = function () { };
    this.onStatus = function () { };
    this.lastText = null;
    this.lastAt = 0;
    this.lastValueAt = 0;
    this._raf = 0;
    this._frame = 0;
    this._ready = null;
  }

  Scanner.prototype.init = function () {
    var self = this;
    if (this._ready) return this._ready;
    this.canvas = document.createElement('canvas');
    try {
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    } catch (e) {
      this.ctx = this.canvas.getContext('2d');
    }
    this._ready = makeDetector().then(function (det) {
      self.detector = det;
      self.native = !!det;
      if (!det && !hasJsQR()) self.onStatus('no-decoder');
      return det;
    });
    return this._ready;
  };

  Scanner.prototype.start = function (videoEl) {
    var self = this;
    this.video = videoEl;
    return this.init().then(function () {
      if (!global.isSecureContext) { self.onStatus('no-secure'); return false; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        self.onStatus(navigator.mediaDevices ? 'no-camera' : 'no-camera');
        return false;
      }
      self.onStatus('requesting');
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: self.facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    }).then(function (stream) {
      if (!stream) return false;
      self.stream = stream;
      self.track = stream.getVideoTracks()[0] || null;
      self._readCapabilities();
      if (self.video.srcObject !== stream) self.video.srcObject = stream;
      var play = self.video.play ? self.video.play() : Promise.resolve();
      return (play && play.catch ? play.catch(function () { }) : Promise.resolve()).then(function () {
        self.running = true;
        self.onStatus('live');
        self._loop();
        return true;
      });
    }).catch(function (err) {
      var name = (err && err.name) || '';
      var st = 'error';
      if (name === 'NotAllowedError' || name === 'SecurityError') st = 'denied';
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') st = 'no-camera';
      else if (name === 'NotReadableError' || name === 'AbortError') st = 'busy';
      self.onStatus(st, String(err && err.message || err));
      return false;
    });
  };

  Scanner.prototype._readCapabilities = function () {
    this.torchCapable = false;
    this.zoomCapable = null;
    if (!this.track || !this.track.getCapabilities) return;
    try {
      var c = this.track.getCapabilities();
      this.torchCapable = !!(c.torch && c.torch.length);
      if (c.zoom && c.zoom.length) this.zoomCapable = { min: c.zoom[0], max: c.zoom[c.zoom.length - 1], step: c.zoom[1] != null && c.zoom[1] - c.zoom[0] ? c.zoom[1] - c.zoom[0] : 0.1 };
    } catch (e) { /* yok sayılır */ }
  };

  Scanner.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } });
    }
    this.stream = null;
    this.track = null;
    this.torchOn = false;
    if (this.video) { try { this.video.srcObject = null; } catch (e) { } }
    this.onStatus('stopped');
  };

  Scanner.prototype.setTorch = function (on) {
    var self = this;
    if (!this.track || !this.track.applyConstraints) return Promise.resolve(false);
    return this.track.applyConstraints({ advanced: [{ torch: !!on }] })
      .then(function () { self.torchOn = !!on; return true; })
      .catch(function () { return false; });
  };

  Scanner.prototype.setZoom = function (value) {
    var self = this;
    if (!this.track || !this.track.applyConstraints || !this.zoomCapable) return Promise.resolve(false);
    var z = Math.max(this.zoomCapable.min, Math.min(this.zoomCapable.max, value));
    return this.track.applyConstraints({ advanced: [{ zoom: z }] })
      .then(function () { return true; }).catch(function () { return false; });
  };

  Scanner.prototype.flip = function () {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    if (!this.running) return Promise.resolve(true);
    var self = this, old = this.stream;
    return this.stop().then(function () {
      return new Promise(function (r) { setTimeout(r, 220); });
    }).then(function () { return self.start(self.video); });
  };

  Scanner.prototype._loop = function () {
    var self = this;
    if (!this.running) return;
    this._frame++;
    if (!this.busy) {
      this.busy = true;
      Promise.resolve(this._decode()).then(function (res) {
        self.busy = false;
        if (res) self._emit(res);
      }).catch(function () { self.busy = false; });
    }
    this._raf = requestAnimationFrame(function () { self._loop(); });
  };

  /* kareyi çöz: önce tam kare, olmazsa merkezi kırp (hız + başarı dengesi) */
  Scanner.prototype._decode = function () {
    var v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return Promise.resolve(null);

    if (this.native) {
      var det = this.detector;
      return Promise.resolve(det.detect(v)).then(function (list) {
        if (list && list.length) {
          var best = null;
          for (var i = 0; i < list.length; i++) {
            var t = list[i].rawValue || list[i].value;
            if (t) { if (!best || t.length > best.length) best = t; }
          }
          if (best) return best;
        }
        return null;
      }).catch(function () { return null; });
    }

    if (!hasJsQR()) return Promise.resolve(null);
    var ctx = this.ctx, canvas = this.canvas;
    var maxSide = 900;
    var scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    var w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    if (w < 8 || h < 8) return Promise.resolve(null);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(v, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h);
    var r = global.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) return r.data;

    /* ikinci deneme: merkezi kırp ve büyüt (uzaktaki/bozuk kodlar için) */
    var cw = Math.round(w * 0.62), ch = Math.round(h * 0.62);
    var cx = Math.round((w - cw) / 2), cy = Math.round((h - ch) / 2);
    var big = 720;
    canvas.width = big; canvas.height = big;
    ctx.drawImage(v, cx / scale, cy / scale, cw / scale, ch / scale, 0, 0, big, big);
    var img2 = ctx.getImageData(0, 0, big, big);
    var r2 = global.jsQR(img2.data, big, big, { inversionAttempts: 'attemptBoth' });
    return r2 && r2.data ? r2.data : null;
  };

  Scanner.prototype._emit = function (text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return;
    var now = Date.now();
    /* aynı kodu tekrar okumayı engelle (kare tekrarı) */
    if (text === this.lastText && now - this.lastValueAt < 2500) return;
    this.lastText = text;
    this.lastValueAt = now;
    this.onCode(text);
  };

  /* --- fotoğraf / galeri üzerinden okuma (kamera istemeyen yedek yol) --- */
  Scanner.decodeImage = function (source) {
    return makeDetector().then(function (det) {
      return loadImage(source).then(function (img) {
        var w = img.naturalWidth || img.videoWidth || img.width;
        var h = img.naturalHeight || img.videoHeight || img.height;
        if (det) {
          return det.detect(img).then(function (list) {
            if (list && list.length) {
              var best = '';
              list.forEach(function (d) {
                var t = d.rawValue || d.value || '';
                if (t.length > best.length) best = t;
              });
              if (best) return best;
            }
            return jsqrFromImage(img, w, h);
          });
        }
        return jsqrFromImage(img, w, h);
      });
    });
  };

  function jsqrFromImage(img, w, h) {
    if (!hasJsQR() || !w || !h) return null;
    var maxSide = 1000;
    var s = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.round(w * s), ch = Math.round(h * s);
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    var d = ctx.getImageData(0, 0, cw, ch);
    var r = global.jsQR(d.data, cw, ch, { inversionAttempts: 'attemptBoth' });
    return r && r.data ? r.data : null;
  }

  function loadImage(source) {
    if (typeof source === 'string') {
      return new Promise(function (resolve, reject) {
        var i = new Image();
        i.onload = function () { resolve(i); };
        i.onerror = function () { reject(new Error('görüntü yüklenemedi')); };
        i.src = source;
      });
    }
    if (global.createImageBitmap) {
      return global.createImageBitmap(source).then(function (bmp) {
        var c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        return c;
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(source);
      var i = new Image();
      i.onload = function () { URL.revokeObjectURL(url); resolve(i); };
      i.onerror = function () { URL.revokeObjectURL(url); reject(new Error('görüntü yüklenemedi')); };
      i.src = url;
    });
  }

  global.Scanner = Scanner;
})(typeof window !== 'undefined' ? window : globalThis);
