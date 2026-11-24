/* qrmake.js — QR kod üretimi (vendor/qrcode-generator.js üzerine ince katman) */
(function (global) {
  'use strict';

  function hazir() { return typeof global.qrcode === 'function'; }

  /* uzun metinlerde hata düzeltme seviyesini düşür -> kareler büyüsün, okuması kolaylaşsın */
  function olustur(text) {
    if (global.qrcode.stringToBytesFuncs && global.qrcode.stringToBytesFuncs['UTF-8']) {
      global.qrcode.stringToBytes = global.qrcode.stringToBytesFuncs['UTF-8'];
    }
    var qr = global.qrcode(0, String(text).length > 140 ? 'L' : 'M');
    qr.addData(String(text), 'Byte');
    qr.make();
    return qr;
  }

  function tuval(text, cell, margin) {
    var c = document.createElement('canvas');
    if (!hazir()) {
      c.width = c.height = 140;
      var x = c.getContext('2d');
      x.fillStyle = '#fee2e2'; x.fillRect(0, 0, 140, 140);
      x.fillStyle = '#991b1b'; x.font = '12px sans-serif';
      x.fillText('QR motoru yok', 24, 70);
      return c;
    }
    var qr;
    try { qr = olustur(text); } catch (e) {
      c.width = c.height = 140;
      var g = c.getContext('2d');
      g.fillStyle = '#fee2e2'; g.fillRect(0, 0, 140, 140);
      g.fillStyle = '#991b1b'; g.font = '12px sans-serif';
      g.fillText('Metin çok uzun', 24, 70);
      return c;
    }
    var n = qr.getModuleCount();
    cell = cell || 5;
    margin = margin == null ? 3 : margin;
    var size = (n + margin * 2) * cell;
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) {
      for (var k = 0; k < n; k++) {
        if (qr.isDark(r, k)) ctx.fillRect((k + margin) * cell, (r + margin) * cell, cell, cell);
      }
    }
    return c;
  }

  function pngIndir(text, ad, cell, margin) {
    if (!hazir()) return false;
    var a = document.createElement('a');
    a.href = tuval(text, cell || 10, margin == null ? 3 : margin).toDataURL('image/png');
    a.download = (ad || 'qr') + '.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 500);
    return true;
  }

  global.Qr = { canvas: tuval, download: pngIndir, hazir: hazir };
})(window);
