/* Thank-you page after the Stripe checkout (/it/grazie/?session_id={CHECKOUT_SESSION_ID}).
   Sends Meta "Purchase" once per Stripe session, and only with cookie consent (same "itl-consent" key as site.js).
   The session id is the event ID, so a reload, or a later server-side Conversions API event, is not counted twice. */
(function () {
  "use strict";
  const PIXEL_ID = "1657438149087365";
  const store = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } return v; };
  const sid = new URLSearchParams(location.search).get("session_id") || "";
  const valid = /^cs_(live|test)_[A-Za-z0-9]{10,}$/.test(sid);

  function loadPixel() {
    if (window.fbq) return;
    const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const s = document.createElement("script");
    s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.append(s);
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  }
  function purchase() {
    loadPixel();
    if (!valid || store("itl-purchase") === sid) return;
    window.fbq("track", "Purchase", { value: 99, currency: "EUR", content_name: "ITL 2027 ticket", content_type: "product" }, { eventID: sid });
    store("itl-purchase", sid);
  }

  const banner = document.getElementById("cookie");
  const choice = store("itl-consent");
  if (choice === "granted") purchase();
  else if (choice !== "denied" && banner) banner.hidden = false;
  if (banner) banner.querySelectorAll("[data-consent]").forEach((b) => b.addEventListener("click", () => {
    store("itl-consent", b.dataset.consent);
    banner.hidden = true;
    if (b.dataset.consent === "granted") purchase();
  }));
})();
