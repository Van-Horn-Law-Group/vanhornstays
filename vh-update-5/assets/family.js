(function () {
  "use strict";
  // Availability + request service (Google Apps Script web app, runs as the owner).
  var SYNC_URL = "https://script.google.com/macros/s/AKfycbyWxgv5m19IJfDjoXHeRwkxRW6liG9yZ8MSnsXT_yd-hH_RoXGGQwZuTjm34zhuRwqy/exec";

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
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
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
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)).then(function (d) { init(data.config, hex(d)); });
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

  // ---- styles for the availability calendar ----------------------------------------------
  var css = document.createElement("style");
  css.textContent =
    ".avail{margin:.2rem 0 .4rem}.avail-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem}" +
    ".avail-head b{font-family:var(--serif,Georgia,serif);font-size:1.15rem;color:var(--navy,#1f3b4d)}" +
    ".avail-nav{display:flex;gap:.35rem}.avail-nav button{border:1px solid var(--line,#e6dccb);background:#fff;border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:1rem;color:var(--navy,#1f3b4d)}" +
    ".avail-nav button:disabled{opacity:.35;cursor:default}.avail-months{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}" +
    ".avail-m h4{margin:.1rem 0 .35rem;font:500 .95rem var(--sans,Arial,sans-serif);color:var(--ink,#1b2f3e)}" +
    ".avail-g{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.avail-g span{font-size:.7rem;text-align:center;color:var(--muted,#5f6b72)}" +
    ".avail-g button{border:0;border-radius:6px;padding:.38rem 0;font:inherit;font-size:.85rem;background:#fff;color:var(--ink,#1b2f3e);cursor:pointer;box-shadow:inset 0 0 0 1px var(--line,#e6dccb)}" +
    ".avail-g button.booked{background:#ece7de;color:#a59f95;text-decoration:line-through;cursor:not-allowed;box-shadow:none}" +
    ".avail-g button.past{background:transparent;color:#c9c2b5;cursor:default;box-shadow:none}" +
    ".avail-g button.sel{background:var(--navy,#1f3b4d);color:#fff;box-shadow:none}.avail-g button.inr{background:#d9e3e8;box-shadow:none}" +
    ".avail-key{display:flex;gap:1rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted,#5f6b72);margin-top:.5rem}" +
    ".avail-key i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:.3rem}" +
    ".quote .warn{color:var(--clay-dark,#a8623f);font-weight:500}";
  document.head.appendChild(css);

  // ---- calculator + availability ------------------------------------------------------------
  function init(cfg, key) {
    var $ = function (id) { return document.getElementById(id); };
    var home = $("f-home"), din = $("f-in"), dout = $("f-out"), guests = $("f-guests");
    var quote = $("quote"), status = $("calc-status"), sendBtn = $("send");
    var availBox = $("avail");
    var today = new Date().toISOString().slice(0, 10);
    din.min = today;
    var busy = null, busyErr = false, monthOffset = 0, sending = false;

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
    function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
    function pretty(s) { return parse(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

    function isBooked(h, night) {
      var r = (busy && busy[h]) || [];
      for (var i = 0; i < r.length; i++) if (night >= r[i][0] && night < r[i][1]) return true;
      return false;
    }
    function clashes(h, a, b) {
      var out = [], d = parse(a), end = parse(b);
      while (d < end) { var s = iso(d); if (isBooked(h, s)) out.push(s); d.setDate(d.getDate() + 1); }
      return out;
    }

    function loadBusy() {
      if (!SYNC_URL || SYNC_URL.indexOf("__") === 0) { busyErr = true; drawCal(); render(); return; }
      fetch(SYNC_URL + "?action=busy&k=" + key).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error("busy");
        busy = j.busy; busyErr = false; drawCal(); render();
      }).catch(function () { busyErr = true; drawCal(); render(); });
    }

    function drawCal() {
      if (!availBox) return;
      var h = home.value, base = new Date(), html = "";
      base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
      html += '<div class="avail-head"><b>' + (busyErr ? "Availability couldn't load" : busy ? "Open dates" : "Checking open dates…") +
        '</b><div class="avail-nav"><button type="button" data-nav="-1" aria-label="Earlier months"' + (monthOffset <= 0 ? " disabled" : "") +
        '>‹</button><button type="button" data-nav="1" aria-label="Later months"' + (monthOffset >= 15 ? " disabled" : "") + ">›</button></div></div>";
      if (busyErr) html += '<p class="fine" style="margin:0 0 .5rem">Pick your dates anyway and send the request. We\'ll check the calendar and confirm.</p>';
      html += '<div class="avail-months">';
      for (var m = 0; m < 2; m++) {
        var first = new Date(base.getFullYear(), base.getMonth() + m, 1);
        html += '<div class="avail-m"><h4>' + first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + '</h4><div class="avail-g">';
        ["S", "M", "T", "W", "T", "F", "S"].forEach(function (d) { html += "<span>" + d + "</span>"; });
        for (var i = 0; i < first.getDay(); i++) html += "<span></span>";
        var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        for (var d = 1; d <= days; d++) {
          var s = iso(new Date(first.getFullYear(), first.getMonth(), d)), cls = "";
          if (s < today) cls = "past";
          else if (isBooked(h, s)) cls = "booked";
          if (din.value && s === din.value) cls += " sel";
          else if (dout.value && s === dout.value) cls += " sel";
          else if (din.value && dout.value && s > din.value && s < dout.value) cls += " inr";
          html += '<button type="button" class="' + cls.trim() + '" data-d="' + s + '"' + (cls.indexOf("past") === 0 ? " disabled" : "") +
            ' aria-label="' + s + (cls.indexOf("booked") >= 0 ? " booked" : "") + '">' + d + "</button>";
        }
        html += "</div></div>";
      }
      html += '</div><div class="avail-key"><span><i style="background:#fff;box-shadow:inset 0 0 0 1px #e6dccb"></i>Open</span>' +
        '<span><i style="background:#ece7de"></i>Booked</span><span><i style="background:#1f3b4d"></i>Your dates</span></div>';
      availBox.innerHTML = html;
    }

    if (availBox) availBox.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-nav]");
      if (nav) { monthOffset = Math.max(0, Math.min(15, monthOffset + (+nav.getAttribute("data-nav")) * 2)); drawCal(); return; }
      var b = e.target.closest("[data-d]");
      if (!b || b.disabled) return;
      var s = b.getAttribute("data-d");
      if (b.classList.contains("booked") && !(din.value && !dout.value && s > din.value)) return; // a booked night can still be a checkout day
      if (!din.value || dout.value || s <= din.value) { din.value = s; dout.value = ""; }
      else dout.value = s;
      dout.min = din.value || today;
      drawCal(); render();
    });

    function calc() {
      if (!din.value || !dout.value) return null;
      var a = parse(din.value), b = parse(dout.value);
      var nights = Math.round((b - a) / 86400000);
      if (nights < 1) return { error: "Departure needs to be after arrival." };
      var h = cfg.homes[home.value];
      var groups = {}, order = [], total = 0;
      for (var i = 0; i < nights; i++) {
        var d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i);
        var s = seasonOf(h.city, d), rate = h.rate[s.key];
        var g = groups[s.key];
        if (!g) { g = groups[s.key] = { label: s.label, rate: rate, n: 0 }; order.push(s.key); }
        g.n++; total += rate;
      }
      var guestsN = parseInt(guests.value, 10) || 1;
      return { nights: nights, groups: groups, order: order, nightly: total, cleaning: h.cleaning, total: total + h.cleaning, h: h,
        over: guestsN > h.sleeps, sleeps: h.sleeps, clash: busy ? clashes(home.value, din.value, dout.value) : [] };
    }

    function render() {
      var q = calc();
      if (sendBtn) sendBtn.disabled = false;
      if (!q) { quote.textContent = "Choose your dates to see the estimate."; return null; }
      if (q.error) { quote.textContent = q.error; return null; }
      var rows = "";
      q.order.forEach(function (k) {
        var g = q.groups[k];
        rows += "<tr><td>" + g.n + (g.n === 1 ? " night" : " nights") + " at " + money(g.rate) + " (" + g.label.toLowerCase() + ")</td><td>" + money(g.n * g.rate) + "</td></tr>";
      });
      rows += "<tr><td>Cleaning fee</td><td>" + money(q.cleaning) + "</td></tr>";
      rows += '<tr class="total"><td>Estimated total</td><td>' + money(q.total) + "</td></tr>";
      var warn = "";
      if (q.clash.length) {
        warn = '<p class="warn" style="margin:.6rem 0 0">' + q.h.name + " is already booked " +
          (q.clash.length === 1 ? "the night of " + pretty(q.clash[0]) : "on " + q.clash.length + " of those nights (from " + pretty(q.clash[0]) + ")") +
          ". Pick open dates on the calendar.</p>";
        if (sendBtn) sendBtn.disabled = true;
      }
      quote.innerHTML = "<table>" + rows + "</table>" + warn + '<p class="fine" style="margin:.6rem 0 0">Taxes are not included. We will add the applicable ones when we confirm.</p>' + (q.over ? '<p class="fine" style="margin:.6rem 0 0">' + q.h.name + " sleeps " + q.sleeps + ". Let us know how you'd like to handle the extra guests.</p>" : "");
      return q;
    }

    function summary(q) {
      var lines = ["Family and friends request", "",
        "Name: " + ($("f-name").value || ""), "Phone: " + (($("f-phone") || {}).value || ""), "Email: " + (($("f-contact") || {}).value || ""), "Home: " + q.h.name,
        "Dates: " + din.value + " to " + dout.value + " (" + q.nights + " nights)",
        "Guests: " + guests.value,
        "Estimated total: " + money(q.total) + " (nightly " + money(q.nightly) + " + cleaning " + money(q.cleaning) + "), before taxes", "",
        $("f-note").value || ""];
      return lines.join("\n");
    }
    function mailFallback(q) {
      var to = (window.VHS_MAIL || []).map(function (s) { return atob(s); }).join(",");
      window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Family and friends request: " + q.h.name) + "&body=" + encodeURIComponent(summary(q));
      status.textContent = "We couldn't send it from the page, so your email app should open with the request ready to send.";
    }

    [home, din, dout, guests].forEach(function (el) { el.addEventListener("input", function () { drawCal(); render(); }); el.addEventListener("change", function () { drawCal(); render(); }); });
    din.addEventListener("change", function () {
      dout.min = din.value || today;
      if (dout.value && dout.value <= din.value) dout.value = "";
      drawCal(); render();
    });

    $("calc").addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var q = render();
      if (!q) { status.textContent = "Add your dates first."; return; }
      if (q.clash.length) { status.textContent = "Those dates aren't open. Pick open dates on the calendar."; return; }
      var name = ($("f-name").value || "").trim(), contact = (($("f-contact") || {}).value || "").trim();
      var phone = (($("f-phone") || {}).value || "").trim(), digits = phone.replace(/\D/g, "");
      if (!name) { status.textContent = "Add your name."; $("f-name").focus(); return; }
      if (digits.length < 10 || digits.length > 15) { status.textContent = "Add a cell phone number (with area code) so we can reach you."; if ($("f-phone")) $("f-phone").focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) { status.textContent = "Add your email so we can send your confirmation."; $("f-contact").focus(); return; }
      if (!SYNC_URL || SYNC_URL.indexOf("__") === 0) { mailFallback(q); return; }
      sending = true; sendBtn.disabled = true; sendBtn.textContent = "Sending…"; status.textContent = "";
      fetch(SYNC_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "request", k: key, home: home.value, "in": din.value, out: dout.value, guests: guests.value,
          name: name, phone: phone, contact: contact, note: $("f-note").value || "", estimate: money(q.total) + " (" + q.nights + " nights + cleaning)" })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.ok) {
          status.innerHTML = "<b>Sent.</b> Gaby and Chad have your request and will confirm with you at " + contact.replace(/[<>&]/g, "") + " or " + phone.replace(/[<>&]/g, "") + ".";
          sendBtn.textContent = "Request sent";
          return;
        }
        if (j.error === "booked") { status.textContent = "Someone just booked some of those nights. Pick other dates."; loadBusy(); }
        else if (j.error === "past") status.textContent = "Arrival can't be in the past.";
        else if (j.error === "contact") status.textContent = "Add your name, cell phone and email so we can confirm.";
        else if (j.error === "phone") status.textContent = "Add a cell phone number (with area code) so we can reach you.";
        else mailFallback(q);
        sendBtn.disabled = false; sendBtn.textContent = "Send request";
      }).catch(function () {
        mailFallback(q); sendBtn.disabled = false; sendBtn.textContent = "Send request";
      }).then(function () { sending = false; });
    });
    $("copy").addEventListener("click", function () {
      var q = render();
      if (!q) { status.textContent = "Add your dates first."; return; }
      var body = summary(q);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(body).then(function () { status.textContent = "Copied. Paste it into a text or email to us."; },
          function () { status.textContent = "Couldn't copy automatically. Select the estimate and send it to us."; });
      } else { status.textContent = "Couldn't copy automatically. Select the estimate and send it to us."; }
    });
    drawCal(); render(); loadBusy();
  }
})();
