(() => {
  "use strict";
  document.documentElement.classList.add("js");

  /* ================= Config ================= */
  const ENDPOINT = "/api/leads.php";   // OVH mail handler, see api/leads.php
  const EVENT_DAY = new Date("2027-02-24T00:00:00+01:00");

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  /* ================= Language ================= */
  const MSG = {
    en: { sending: "Sending…", invalid: "Please complete the required fields.", reportOk: "Thank you for your interest in the report. Our team will contact you by email soon.", partnerOk: "Thank you. We will reply to your enquiry shortly.", error: "Something went wrong. Please try again in a moment." },
    it: { sending: "Invio in corso…", invalid: "Compila i campi obbligatori.", reportOk: "Grazie per l'interesse verso il report. Il nostro team ti contatterà presto via email.", partnerOk: "Grazie. Ti risponderemo a breve.", error: "Qualcosa non ha funzionato. Riprova tra poco." }
  };
  const TITLE = { en: "Italian Tech Landscape 2026 · The official report on Italian tech", it: "Italian Tech Landscape 2026 · Il report ufficiale del Tech Made in Italy" };
  // Each language has its own URL (/ and /it/) so search engines index both
  const PAGE_LANG = document.documentElement.lang === "it" ? "it" : "en";
  const LANG_URL = { en: "/", it: "/it/" };
  let lang = "en";
  const storedLang = () => { try { return localStorage.getItem("itl-lang"); } catch (e) { return null; } };
  const storeLang = (l) => { try { localStorage.setItem("itl-lang", l); } catch (e) { /* ignore */ } };

  function applyLang(next) {
    lang = next;
    document.documentElement.lang = next;
    document.title = TITLE[next];
    $$("[data-en]").forEach((el) => {
      const text = el.dataset[next] ?? el.dataset.en;
      if (el.tagName === "META") el.content = text; else el.textContent = text;
    });
    $$("[data-en-label]").forEach((el) => (el.label = el.dataset[next + "Label"] ?? el.dataset.enLabel));
    $$("[data-en-aria]").forEach((el) => el.setAttribute("aria-label", el.dataset[next + "Aria"] ?? el.dataset.enAria));
    $$("[data-set-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setLang === next)));
    buildFill();
    storeLang(next);
  }

  /* ================= Number formatting (1.652 style, as in the report) ================= */
  const fmt = (v, dec = 0) => {
    const [i, d] = v.toFixed(dec).split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d ? "," + d : "");
  };

  /* ================= Word fill statement ================= */
  const fillEl = $("#fill");
  let fillSpans = [];
  function buildFill() {
    if (!fillEl) return;
    const src = fillEl.dataset["fill" + (lang === "it" ? "It" : "En")];
    fillEl.textContent = "";
    fillSpans = src.trim().split(/\s+/).map((w) => {
      const s = document.createElement("span");
      if (w.startsWith("*")) { s.className = "hl"; w = w.slice(1); }
      s.textContent = w;
      fillEl.append(s, " ");
      return s;
    });
    measure();
  }

  /* ================= Char split (band title) ================= */
  $$("[data-chars]").forEach((el) => {
    // per-language text lives in data-chars-<lang> (not data-<lang>, so applyLang never replaces the letter spans)
    const text = el.getAttribute("data-chars-" + PAGE_LANG) || el.textContent;
    el.setAttribute("aria-label", text);
    el.textContent = "";
    [...text].forEach((c, i) => {
      const s = document.createElement("span");
      s.className = "ch";
      s.setAttribute("aria-hidden", "true");
      s.style.setProperty("--i", i);
      s.textContent = c === " " ? " " : c;
      el.append(s);
    });
  });

  /* ================= Reveal on enter ================= */
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: .12, rootMargin: "0px 0px -6% 0px" });
  $$(".rv, .tr, .figure, .step, .bars, .stack, [data-chars]").forEach((el) => io.observe(el));
  // A .wipe starts fully clipped, and a fully clipped element never reports as intersecting: watch its parent instead
  const wipeIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { $$(":scope > .wipe", e.target).forEach((w) => w.classList.add("in")); wipeIO.unobserve(e.target); }
  }), { threshold: .12, rootMargin: "0px 0px -6% 0px" });
  new Set($$(".wipe").map((w) => w.parentElement)).forEach((p) => wipeIO.observe(p));

  /* ================= Speakers: reveal as a diagonal wave across whatever grid is showing ================= */
  (function speakers(list) {
    if (!list) return;
    const cards = $$(".speaker", list);
    const sio = new IntersectionObserver((entries) => {
      const cols = getComputedStyle(list).gridTemplateColumns.split(" ").length || 1;
      const batch = entries.filter((e) => e.isIntersecting);
      // only cards entering together share the wave; a row that arrives later on scroll starts its own
      const firstRow = Math.min(...batch.map((e) => Math.floor(cards.indexOf(e.target) / cols)));
      batch.forEach((e) => {
        const i = cards.indexOf(e.target), col = i % cols, row = Math.floor(i / cols) - firstRow;
        const d = Math.min(.6, (col + row * .6) * .07);
        e.target.style.setProperty("--d", d.toFixed(3));
        e.target.classList.add("in");
        sio.unobserve(e.target);
        // clear the delay once the entrance is over, so hover responds immediately
        setTimeout(() => e.target.style.setProperty("--d", "0"), d * 1000 + 2400);
      });
    }, { threshold: .2 });
    cards.forEach((c) => sio.observe(c));
  })($("#speaker-list"));

  /* ================= Counters ================= */
  function countUp(el) {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0);
    const pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    const out = (v) => pre + fmt(v, dec) + suf;
    if (reduced.matches) { el.textContent = out(to); return; }
    const t0 = performance.now(), dur = to > 1000 ? 2200 : 1700;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = out(to * (1 - Math.pow(1 - t, 4)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const counterIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { countUp(e.target); counterIO.unobserve(e.target); }
  }), { threshold: .6 });
  $$("[data-count]").forEach((el) => {
    if (!reduced.matches) el.textContent = (el.dataset.prefix || "") + "0" + (el.dataset.suffix || "");
    counterIO.observe(el);
  });

  /* ================= Countdown (days only: the start time is not announced) ================= */
  const cd = $("#countdown");
  const days = Math.ceil((EVENT_DAY - Date.now()) / 864e5);
  if (days > 0) {
    cd.hidden = false;
    const n = $("#cd-days");
    n.dataset.count = days;
    n.textContent = reduced.matches ? days : "0";
    counterIO.observe(n);
  }

  /* ================= Scroll: header, progress, parallax, word fill, nav ================= */
  const header = $("#header");
  const bar = $(".progress");
  const parallax = $$("[data-parallax]");
  const navLinks = $$(".site-nav a");
  const navTargets = navLinks.map((a) => $(a.getAttribute("href")));
  let ticking = false;

  function measure() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    header.classList.toggle("is-scrolled", y > 40);
    const max = document.documentElement.scrollHeight - vh;
    bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0).toFixed(4) + ")";

    if (!reduced.matches) parallax.forEach((img) => {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const p = (r.top + r.height / 2 - vh / 2) / vh;
      img.style.transform = "translate3d(0," + (p * img.dataset.parallax * -100).toFixed(2) + "%,0)";
    });
    {
      // the word fill only changes opacity, so it also runs with Reduce Motion
      if (fillEl && fillSpans.length) {
        const r = fillEl.getBoundingClientRect();
        const p = clamp((vh * .82 - r.top) / (r.height + vh * .3), 0, 1);
        const n = fillSpans.length;
        fillSpans.forEach((s, i) => {
          const k = clamp((p * 1.1 - i / n) * n, 0, 1);
          s.style.opacity = (.16 + .84 * k).toFixed(3);
        });
      }
    }

    let current = -1;
    navTargets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < vh * .4) current = i; });
    navLinks.forEach((a, i) => a.setAttribute("aria-current", String(i === current)));
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(measure); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);

  /* ================= Mobile CTA bar: shows once the hero buttons scroll away ================= */
  const mbar = $("#mbar"), heroActions = $(".hero-actions");
  if (mbar && heroActions) new IntersectionObserver(([e]) => mbar.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(heroActions);

  /* ================= Logo marquees: duplicate the list for a seamless loop ================= */
  $$(".marquee-track").forEach((track) => {
    const list = track.querySelector("ul");
    const copy = list.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("img").forEach((img) => (img.alt = ""));
    track.append(copy);
    // a tap or click pauses and resumes the logos (moving content needs a pause control)
    const mq = track.parentElement;
    mq.addEventListener("click", () => mq.classList.toggle("paused"));
  });

  /* ================= Press clippings: infinite drag slider (moves only when dragged) ================= */
  (function slider(root) {
    if (!root) return;
    const track = $(".slider-track", root);
    const originals = $$(".clip", track);
    originals.forEach((c) => {
      const k = c.cloneNode(true);
      k.setAttribute("aria-hidden", "true");
      k.tabIndex = -1;
      k.dataset.clone = "";
      track.append(k);
    });
    let x = 0, v = 0, w = 0, last = 0, visible = false, raf = 0;
    let down = false, sx = 0, sxv = 0, moved = 0, lastPx = 0, lastT = 0;
    const loop = () => { w = track.scrollWidth / 2; };
    const wrap = () => { if (w) { while (x <= -w) x += w; while (x > 0) x -= w; } };
    const tick = (t) => {
      const dt = Math.min(48, t - (last || t)); last = t;
      if (!down) {
        x += v * dt; v *= Math.pow(.94, dt / 16);
        if (Math.abs(v) < .001) v = 0;
      }
      wrap();
      track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(root);
    addEventListener("resize", loop); addEventListener("load", loop); loop();
    $$("img", track).forEach((img) => img.addEventListener("load", loop, { once: true }));

    root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      down = true; moved = 0; sx = e.clientX; sxv = x; lastPx = e.clientX; lastT = performance.now(); v = 0;
    });
    addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) { root.classList.add("dragging"); if (!root.hasPointerCapture?.(e.pointerId)) try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      x = sxv + dx; wrap();
      const now = performance.now(); v = (e.clientX - lastPx) / Math.max(1, now - lastT); lastPx = e.clientX; lastT = now;
    });
    const up = () => { if (!down) return; down = false; root.classList.remove("dragging"); v = clamp(v, -3, 3); };
    addEventListener("pointerup", up); addEventListener("pointercancel", up);
    root.addEventListener("click", (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    // Keyboard: keep the focused card in view
    root.addEventListener("focusin", (e) => {
      const c = e.target.closest(".clip"); if (!c) return;
      const r = c.getBoundingClientRect(), R = root.getBoundingClientRect();
      if (r.left < R.left + 20) x += (R.left + 20 - r.left);
      if (r.right > R.right - 20) x -= (r.right - (R.right - 20));
      wrap();
    });
  })($("#clips"));

  /* ================= Gallery: drag-to-scroll, buttons, progress ================= */
  (function gallery(sc) {
    if (!sc) return;
    const gbar = $("#g-bar");
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth;
      const vis = sc.clientWidth / sc.scrollWidth;
      const p = max > 0 ? sc.scrollLeft / max : 0;
      gbar.style.transform = "translateX(" + (p * (1 - vis) * 100 / vis).toFixed(2) + "%) scaleX(1)";
      gbar.style.width = (vis * 100).toFixed(2) + "%";
    };
    gbar.style.transformOrigin = "left";
    sc.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update); update();
    $$("[data-g]").forEach((b) => b.addEventListener("click", () => {
      sc.scrollBy({ left: +b.dataset.g * sc.clientWidth * .75, behavior: reduced.matches ? "auto" : "smooth" });
    }));
    // Mouse drag with inertia (touch uses native scrolling)
    let down = false, sx = 0, sl = 0, moved = 0, vel = 0, lx = 0, lt = 0, glide = 0;
    sc.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true; moved = 0; sx = lx = e.clientX; sl = sc.scrollLeft; lt = performance.now(); vel = 0; cancelAnimationFrame(glide);
    });
    addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
      if (moved > 5) sc.classList.add("dragging");
      sc.scrollLeft = sl - dx;
      const now = performance.now(); vel = (e.clientX - lx) / Math.max(1, now - lt); lx = e.clientX; lt = now;
    });
    addEventListener("pointerup", () => {
      if (!down) return; down = false;
      setTimeout(() => sc.classList.remove("dragging"), 0);
      if (reduced.matches) return;
      let v = clamp(vel, -4, 4) * 16;
      const go = () => { sc.scrollLeft -= v; v *= .93; if (Math.abs(v) > .4) glide = requestAnimationFrame(go); };
      glide = requestAnimationFrame(go);
    });
    sc.addEventListener("click", (e) => { if (moved > 5) { e.preventDefault(); e.stopPropagation(); } }, true);
    sc.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") sc.scrollBy({ left: 300, behavior: "smooth" });
      if (e.key === "ArrowLeft") sc.scrollBy({ left: -300, behavior: "smooth" });
    });
    // Images fade/scale in as they enter the scroller
    const gio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); gio.unobserve(e.target); }
    }), { root: sc, rootMargin: "0px 200px 0px 200px", threshold: .05 });
    $$(".g-item", sc).forEach((el) => gio.observe(el));
  })($("#g-scroller"));

  /* ================= Lightbox (gallery + press) ================= */
  const lb = $("#lightbox"), lbImg = $("#lb-img"), lbCap = $("#lb-cap"), lbCount = $("#lb-count");
  let set = [], idx = 0;
  function show(i, swap) {
    idx = (i + set.length) % set.length;
    const img = set[idx].querySelector("img");
    const cap = set[idx].querySelector(".clip-cap");
    const paint = () => {
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = cap ? cap.querySelector("strong").textContent + " · " + cap.lastChild.textContent : img.alt;
      lbCount.textContent = (idx + 1) + " / " + set.length;
      lbImg.classList.remove("swap");
    };
    if (swap && !reduced.matches) { lbImg.classList.add("swap"); setTimeout(paint, 180); } else paint();
  }
  document.addEventListener("click", (e) => {
    const item = e.target.closest("[data-lb]");
    if (!item) return;
    set = $$('[data-lb="' + item.dataset.lb + '"]:not([data-clone])');
    // a cloned press card opens the matching original
    const i = item.hasAttribute("data-clone") ? $$('[data-lb="press"][data-clone]').indexOf(item) : set.indexOf(item);
    lb.showModal();
    show(i);
  });
  $$("[data-lb-step]").forEach((b) => b.addEventListener("click", () => show(idx + +b.dataset.lbStep, true)));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(idx + 1, true);
    if (e.key === "ArrowLeft") show(idx - 1, true);
  });
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb-stage")) lb.close(); });

  /* ================= Report gate ================= */
  const gate = $("#gate");
  const store = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } return v; };
  $$("[data-open-gate]").forEach((b) => b.addEventListener("click", () => { gate.showModal(); $("#r-first").focus(); }));

  /* ================= Ticket invite: after 30 s on the page (tab visible), once per session =================
     Skipped if the visitor already went to the checkout, or is busy in a dialog or a form field. */
  (function ticketInvite(dlg) {
    if (!dlg) return;
    const seen = (set) => { try { if (set) sessionStorage.setItem("itl-invite-seen", "1"); return sessionStorage.getItem("itl-invite-seen") === "1"; } catch (e) { return false; } };
    const bought = () => store("itl-ticket-click") === "1";
    $$('a[href*="checkout.isweek.it"]').forEach((a) => a.addEventListener("click", () => { store("itl-ticket-click", "1"); if (dlg.open) dlg.close(); }));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    if (seen() || bought()) return;
    let left = 30000, t0 = 0, timer = 0;
    const run = () => { if (!document.hidden && !timer) { t0 = Date.now(); timer = setTimeout(fire, left); } };
    const pause = () => { if (timer) { clearTimeout(timer); timer = 0; left -= Date.now() - t0; } };
    const fire = () => {
      timer = 0;
      if (seen() || bought()) return;
      const busy = document.querySelector("dialog[open]") || document.activeElement?.matches("input, select, textarea");
      if (busy) { left = 5000; run(); return; }
      seen(true);
      dlg.showModal();
    };
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : run()));
    run();
  })($("#invite"));
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  gate.addEventListener("click", (e) => { if (e.target === gate) gate.close(); });

  /* ================= Forms → /api/leads ================= */
  function setStatus(form, text, kind) {
    const el = $(".form-status", form);
    el.textContent = text;
    el.className = "form-status" + (kind ? " " + kind : "");
  }
  function validate(form) {
    let ok = true;
    $$("[required]", form).forEach((f) => {
      const valid = f.checkValidity() && (f.type !== "checkbox" || f.checked);
      f.setAttribute("aria-invalid", String(!valid));
      if (!valid && ok) f.focus();
      if (!valid) ok = false;
    });
    return ok;
  }
  function serialise(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    data.newsletter = form.querySelector('[name="newsletter"]')?.checked === true;
    data.consent = form.querySelector('[name="consent"]')?.checked === true;
    data.lang = lang;
    data.page = location.pathname;
    data.submittedAt = new Date().toISOString();
    return data;
  }
  $$("form.form").forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = MSG[lang];
    if (!validate(form)) { setStatus(form, m.invalid, "err"); return; }
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    setStatus(form, m.sending, "");
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(serialise(form)) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      if (form.id === "report-form") {
        // No PDF and no email to the visitor: the team is notified and gets in touch. Show the thank-you panel.
        setStatus(form, m.reportOk, "ok");
        store("itl-downloaded", "1");
        const done = $("#report-done");
        if (done) { form.hidden = true; done.hidden = false; done.focus(); }
      }
      else { setStatus(form, m.partnerOk, "ok"); form.reset(); }
    } catch (err) {
      setStatus(form, m.error, "err");
    } finally {
      submit.disabled = false;
    }
  }));

  /* ================= Hero network: companies linked by shared categories ================= */
  (function network(canvas) {
    const ctx = canvas.getContext("2d");
    let nodes = [], w = 0, h = 0, raf = 0, visible = true;
    const seed = () => {
      const count = Math.round(Math.min(120, Math.max(40, (w * h) / 15000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .14, vy: (Math.random() - .5) * .14,
        r: Math.random() < .12 ? 2.6 : 1.4, hot: Math.random() < .28, ph: Math.random() * 6.28
      }));
    };
    // Seed once; on a real size change, stretch the existing layout instead of reshuffling it.
    // Phones fire resize whenever the address bar shows or hides, and those calls must not move anything.
    const resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      if (Math.round(r.width) === Math.round(w) && Math.round(r.height) === Math.round(h)) return false;
      const sx = w ? r.width / w : 1, sy = h ? r.height / h : 1;
      w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (nodes.length) nodes.forEach((n) => { n.x *= sx; n.y *= sy; }); else seed();
      return true;
    };
    const draw = (t = 0) => {
      ctx.clearRect(0, 0, w, h);
      const link = Math.min(170, Math.max(110, w / 7));
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            const hot = a.hot && b.hot;
            ctx.strokeStyle = hot ? `rgba(62,209,209,${(1 - d / link) * .5})` : `rgba(199,207,220,${(1 - d / link) * .26})`;
            ctx.lineWidth = hot ? 1 : .7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const pulse = n.hot ? .65 + .35 * Math.sin(t / 900 + n.ph) : .7;
        ctx.fillStyle = n.hot ? `rgba(62,209,209,${pulse})` : "rgba(199,207,220,.7)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
    };
    let last = 0;
    const step = (t) => {
      // time-based, so the drift keeps the same speed at 120, 60 or 30 fps (Low Power Mode)
      const k = last ? Math.min(3, (t - last) / 16.67) : 1; last = t;
      for (const n of nodes) {
        n.x += n.vx * k; n.y += n.vy * k;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0; resize();
      if (reduced.matches || !visible || document.hidden) { draw(); return; }
      raf = requestAnimationFrame(step);
    };
    let timer;
    addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => { if (resize() && !raf) draw(); }, 150); });
    reduced.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else { cancelAnimationFrame(raf); raf = 0; } }).observe(canvas);
    start();
  })($("#network"));

  /* ================= Init ================= */
  $$("[data-set-lang]").forEach((b) => b.addEventListener("click", () => {
    const next = b.dataset.setLang;
    storeLang(next);
    if (next !== PAGE_LANG) location.href = LANG_URL[next] + location.hash;
  }));
  // On the English URL, send visitors who chose Italian (or whose browser is Italian, first visit) to /it/.
  // The Italian URL never redirects, so a shared /it/ link always opens in Italian.
  const preferred = storedLang() || ((navigator.language || "").toLowerCase().startsWith("it") ? "it" : "en");
  if (PAGE_LANG === "en" && preferred === "it" && location.pathname === "/") { location.replace(LANG_URL.it + location.hash); return; }
  applyLang(PAGE_LANG);
  measure();
})();
