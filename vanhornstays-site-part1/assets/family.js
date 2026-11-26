(function () {
  "use strict";
  var gate = document.getElementById("gate");
  var shell = document.getElementById("fam-root");
  var blob = document.getElementById("fam-data");
  if (!gate || !shell || !blob) return;
  var ITER = parseInt(blob.getAttribute("data-iter"), 10) || 600000;

  function b64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decrypt(pw) {
    var raw = b64(blob.textContent.trim());
    var salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" }, k,
        { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    }).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  var form = document.getElementById("gate-form");
  var err = document.getElementById("gate-err");
  var btn = form.querySelector("button");

  function unlock(data, pw) {
    shell.innerHTML = data.html;
    gate.hidden = true;
    shell.hidden = false;
    try { sessionStorage.setItem("vhs_fam", pw); } catch (e) {}
    init(data.config);
    window.scrollTo(0, 0);
  }

  function attempt(pw, silent) {
    if (!window.crypto || !crypto.subtle) {
      err.textContent = "This page needs a secure connection (https) to open.";
      return;
    }
    if (!silent) { btn.disabled = true; btn.textContent = "Checking…"; }
    decrypt(pw).then(function (data) { unlock(data, pw); })
      .catch(function () {
        if (!silent) err.textContent = "That password didn't work. Check it and try again.";
        try { sessionStorage.removeItem("vhs_fam"); } catch (e) {}
      })
      .then(function () { btn.disabled = false; btn.textContent = "Open"; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var pw = document.getElementById("pw").value.trim().toLowerCase().replace(/\s+/g, "-");
    if (pw) attempt(pw, false);
  });
  try { var saved = sessionStorage.getItem("vhs_fam"); if (saved) attempt(saved, true); } catch (e) {}

  // ---- calculator -------------------------------------------------------------------------
  function init(cfg) {
    var $ = function (id) { return document.getElementById(id); };
    var home = $("f-home"), din = $("f-in"), dout = $("f-out"), guests = $("f-guests"), tier = $("f-tier");
    var quote = $("quote"), status = $("calc-status");
    var today = new Date().toISOString().slice(0, 10);
    din.min = today;

    function seasonOf(city, d) {
      var m = d.getMonth() + 1, day = d.getDate(), v = m * 100 + day;
      var list = cfg.seasons[city];
      for (var i = 0; i < list.length; i++) {
        for (var j = 0; j < list[i].ranges.length; j++) {
          var r = list[i].ranges[j], a = r[0] * 100 + r[1], b = r[2] * 100 + r[3];
          if (a <= b ? (v >= a && v <= b) : (v >= a || v <= b)) return list[i];
        }
      }
      return list[0];
    }
    function money(n) { return "$" + n.toLocaleString("en-US"); }
    function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }

    function calc() {
      if (!din.value || !dout.value) return null;
      var a = parse(din.value), b = parse(dout.value);
      var nights = Math.round((b - a) / 86400000);
      if (nights < 1) return { error: "Departure needs to be after arrival." };
      var h = cfg.homes[home.value], t = tier.value;
      var groups = {}, order = [], total = 0;
      for (var i = 0; i < nights; i++) {
        var d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i);
        var s = seasonOf(h.city, d), rate = h[t][s.key];
        var g = groups[s.key];
        if (!g) { g = groups[s.key] = { label: s.label, rate: rate, n: 0 }; order.push(s.key); }
        g.n++; total += rate;
      }
      var guestsN = parseInt(guests.value, 10) || 1;
      return { nights: nights, groups: groups, order: order, nightly: total, cleaning: h.cleaning, total: total + h.cleaning, h: h, over: guestsN > h.sleeps, sleeps: h.sleeps };
    }

    function render() {
      var q = calc();
      if (!q) { quote.textContent = "Choose your dates to see the estimate."; return null; }
      if (q.error) { quote.textContent = q.error; return null; }
      var rows = "";
      q.order.forEach(function (k) {
        var g = q.groups[k];
        rows += "<tr><td>" + g.n + (g.n === 1 ? " night" : " nights") + " at " + money(g.rate) + " (" + g.label.toLowerCase() + ")</td><td>" + money(g.n * g.rate) + "</td></tr>";
      });
      rows += "<tr><td>Cleaning fee</td><td>" + money(q.cleaning) + "</td></tr>";
      rows += '<tr class="total"><td>Estimated total</td><td>' + money(q.total) + "</td></tr>";
      quote.innerHTML = "<table>" + rows + "</table>" + (q.over ? '<p class="fine" style="margin:.6rem 0 0">' + q.h.name + " sleeps " + q.sleeps + ". Let us know how you'd like to handle the extra guests.</p>" : "");
      return q;
    }

    function summary() {
      var q = render();
      if (!q) { status.textContent = "Add your dates first."; return null; }
      var lines = ["Family and friends request", "",
        "Name: " + ($("f-name").value || ""), "Home: " + q.h.name,
        "Dates: " + din.value + " to " + dout.value + " (" + q.nights + " nights)",
        "Guests: " + guests.value, "Rate: " + (tier.value === "family" ? "Family" : "Friends"),
        "Estimated total: " + money(q.total) + " (nightly " + money(q.nightly) + " + cleaning " + money(q.cleaning) + ")", "",
        $("f-note").value || ""];
      return lines.join("\n");
    }

    [home, din, dout, guests, tier].forEach(function (el) { el.addEventListener("input", render); el.addEventListener("change", render); });
    din.addEventListener("change", function () {
      dout.min = din.value || today;
      if (dout.value && dout.value <= din.value) dout.value = "";
      render();
    });

    $("calc").addEventListener("submit", function (e) {
      e.preventDefault();
      var body = summary();
      if (!body) return;
      var to = (window.VHS_MAIL || []).map(function (s) { return atob(s); }).join(",");
      window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Family and friends request: " + cfg.homes[home.value].name) + "&body=" + encodeURIComponent(body);
      status.textContent = "Your email app should open with the request ready to send. If it doesn't, use Copy request and paste it into a text or email to us.";
    });
    $("copy").addEventListener("click", function () {
      var body = summary();
      if (!body) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(body).then(function () { status.textContent = "Copied. Paste it into a text or email to us."; },
          function () { status.textContent = "Couldn't copy automatically. Select the estimate and send it to us."; });
      } else { status.textContent = "Couldn't copy automatically. Select the estimate and send it to us."; }
    });
    render();
  }
})();
