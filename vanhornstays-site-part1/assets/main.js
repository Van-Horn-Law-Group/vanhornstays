(function () {
  "use strict";

  // Header turns solid after scrolling
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (!header || header.classList.contains("always-solid")) return;
    header.classList.toggle("solid", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu
  var nav = document.querySelector(".nav");
  var menuBtn = document.querySelector(".menu-btn");
  if (nav && menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Scroll reveal
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  // Lightbox
  var data = document.getElementById("lb-data");
  var lb = document.querySelector(".lb");
  if (data && lb) {
    var imgs = JSON.parse(data.getAttribute("data-images"));
    var alt = data.getAttribute("data-alt") || "";
    var idx = 0;
    var big = lb.querySelector("img");
    var ct = lb.querySelector(".ct");
    var lastFocus = null;
    function show(i) {
      idx = (i + imgs.length) % imgs.length;
      big.src = imgs[idx];
      big.alt = alt + " photo " + (idx + 1);
      ct.textContent = (idx + 1) + " / " + imgs.length;
    }
    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
      lb.querySelector(".x").focus();
    }
    function close() {
      lb.classList.remove("open");
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    }
    document.querySelectorAll("[data-lb]").forEach(function (b) {
      b.addEventListener("click", function () { open(parseInt(b.getAttribute("data-lb"), 10) || 0); });
    });
    lb.querySelector(".x").addEventListener("click", close);
    lb.querySelector(".pv").addEventListener("click", function () { show(idx - 1); });
    lb.querySelector(".nx").addEventListener("click", function () { show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    });
  }

  // Inquiry form
  var form = document.getElementById("inquiry");
  if (form) {
    var status = form.querySelector(".status");
    var today = new Date().toISOString().slice(0, 10);
    var arrive = form.elements["arrive"];
    var depart = form.elements["depart"];
    if (arrive) arrive.min = today;
    if (arrive && depart) {
      arrive.addEventListener("change", function () {
        depart.min = arrive.value || today;
        if (depart.value && depart.value < arrive.value) depart.value = arrive.value;
      });
    }
    var q = new URLSearchParams(window.location.search).get("stay");
    if (q && form.elements["stay"]) {
      for (var i = 0; i < form.elements["stay"].options.length; i++) {
        if (form.elements["stay"].options[i].value === q) form.elements["stay"].selectedIndex = i;
      }
    }
    function say(kind, msg) {
      status.className = "status " + kind;
      status.textContent = msg;
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.elements["company"].value) return; // honeypot
      var f = {};
      ["name", "email", "phone", "stay", "arrive", "depart", "guests", "pets", "message"].forEach(function (k) {
        f[k] = form.elements[k] ? form.elements[k].value.trim() : "";
      });
      if (!f.name || !f.email || !/^\S+@\S+\.\S+$/.test(f.email)) {
        say("err", "Please add your name and a valid email so we can reply.");
        return;
      }
      var endpoint = window.VHS_ENDPOINT;
      if (endpoint) {
        say("ok", "Sending…");
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) })
          .then(function (r) { if (!r.ok) throw new Error("bad"); say("ok", "Thank you, " + f.name.split(" ")[0] + ". Gabriela or Chad will reply by email, usually within a few hours."); form.reset(); })
          .catch(function () { say("err", "That didn't send. Please try again or message us through the Airbnb listing."); });
        return;
      }
      // Interim fallback until the form endpoint is live: open the guest's email app, addressed to us.
      var to = (window.VHS_MAIL || []).map(function (s) { return atob(s); }).join(",");
      var body = "Name: " + f.name + "\nEmail: " + f.email + "\nPhone: " + f.phone + "\nStay: " + f.stay +
        "\nArrive: " + f.arrive + "\nDepart: " + f.depart + "\nGuests: " + f.guests + "\nPets: " + f.pets + "\n\n" + f.message;
      window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent("Stay inquiry: " + f.stay) + "&body=" + encodeURIComponent(body);
      say("ok", "Your email app should open with your request ready to send. If it doesn't, please book or message us through the listing links.");
    });
  }
})();
