/*!
 * flyer-core.js: the page logic every concept shares. No dependencies.
 *
 * Reads window.FLYER_CONFIG (set in the page's config block), turns each
 * night's RSVP element into an embed slot, loads squadquest-rsvp.js, greets
 * a guest by name, and scrolls to the night a flyer QR code (?o=) points at.
 *
 * Markup it looks for:
 *   [data-night="friday"|"saturday"]   a night's section
 *     [data-rsvp]                        where that night's RSVP goes
 *   [data-hello]                         greeting line, hidden until a guest loads
 *
 * Before each slot it adds [data-confirm], the night's confirmation line,
 * filled from the embed's squadquest:answer event.
 */
(function () {
  "use strict";
  var C = window.FLYER_CONFIG || {};
  var unset = function (v) { return !v || /^__.*__$/.test(v); };

  var nights = [
    { key: "friday", open: C.FRIDAY_OPEN_LINK, event: C.FRIDAY_EVENT_ID },
    { key: "saturday", open: C.SATURDAY_OPEN_LINK, event: C.SATURDAY_EVENT_ID },
  ];

  // ── the confirmation: "You're in for Friday!" above the night's buttons ──
  // It sits outside the slot, so the embed's re-renders never wipe it. The
  // text is the live region; it stays in the page (empty) until an answer.
  var ICON =
    '<svg viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">' +
    '<circle r="15" fill="none" stroke="#1b1638" stroke-width="1.6" stroke-dasharray="2 3"/>' +
    '<circle r="8.5" fill="#ff7417" stroke="#1b1638" stroke-width="1.6"/>' +
    '<g class="confirm-earth"><circle cx="0" cy="-15" r="4.2" fill="#2a7de1" stroke="#1b1638" stroke-width="1.4"/>' +
    '<path d="M-2-16.6c1.4-.8 3 .2 2 1.6s-2 .8-2-1.6z" fill="#3fb45c"/></g></svg>';

  var anySlot = false;
  nights.forEach(function (n) {
    var slot = document.querySelector('[data-night="' + n.key + '"] [data-rsvp]');
    if (!slot) return;
    // a slot needs an open link or an event id; without either it would
    // render every event on a guest's list, so it stays plain page content
    if (unset(n.open) && unset(n.event)) return;
    if (!unset(n.open)) slot.setAttribute("data-open", n.open);
    if (!unset(n.event)) slot.setAttribute("data-event", n.event);
    slot.setAttribute("data-squadquest-rsvp", "");
    slot.innerHTML = '<p class="rsvp-loading">Loading RSVP…</p>';
    slot.parentNode.insertBefore(confirmLine(n.key), slot);
    anySlot = true;
  });

  function confirmLine(key) {
    var box = document.createElement("div");
    box.className = "confirm";
    box.setAttribute("data-confirm", key);
    var icon = '<span class="confirm-icon" aria-hidden="true">' + ICON;
    for (var i = 0; i < 8; i++) icon += '<i class="confirm-star" style="--a:' + (i * 45 + 22) + 'deg"></i>';
    box.innerHTML = icon + '</span><p class="confirm-text"></p>';
    return box;
  }

  function dayName(key) { return key.charAt(0).toUpperCase() + key.slice(1); }

  function confirmText(key, rsvp, plus) {
    var day = dayName(key);
    if (rsvp === "yes") return "You're in for " + day + (plus > 0 ? ", plus " + plus : "") + "!";
    if (rsvp === "maybe") return "Got it: maybe for " + day + ". Change it any time.";
    if (rsvp === "no") return "Got it: you can't make " + day + ". Change it any time.";
    return "";
  }

  // replay a one-shot CSS animation (it only runs without reduced motion)
  function play(box, cls) {
    box.classList.remove("is-burst", "is-pulse");
    void box.offsetWidth;
    box.classList.add(cls);
  }

  document.addEventListener("squadquest:answer", function (e) {
    var d = e.detail || {};
    var section = e.target.closest && e.target.closest("[data-night]");
    var box = section && section.querySelector("[data-confirm]");
    if (!box) return;
    var key = section.getAttribute("data-night");
    var line = box.querySelector(".confirm-text");
    var text = confirmText(key, d.rsvp, d.plus || 0);
    // only the text changes, and only when it differs, so it is said once
    if (line.textContent !== text) line.textContent = text;
    // live only after the first load, so a returning guest's line is not read out on arrival
    if (!line.hasAttribute("aria-live")) line.setAttribute("aria-live", "polite");
    box.classList.toggle("is-shown", !!text);
    box.setAttribute("data-status", d.rsvp || "");
    // a page load restores the line quietly; a tap gets the moment
    if (d.cause === "answer" && text) play(box, d.rsvp === "yes" ? "is-burst" : "is-pulse");
    else box.classList.remove("is-burst", "is-pulse");
  });

  // a flyer QR code can carry ?o=<open link>: bring that night into view
  var o = new URLSearchParams(location.search).get("o");
  nights.forEach(function (n) {
    if (o && o === n.open) {
      var section = document.querySelector('[data-night="' + n.key + '"]');
      section.classList.add("is-target");
      requestAnimationFrame(function () { section.scrollIntoView({ block: "start" }); });
    }
  });

  // who is answering on this device: "Hi Robin." with a "Not you?" way out
  document.addEventListener("squadquest:identity", function (e) {
    var d = e.detail || {};
    var hello = document.querySelector("[data-hello]");
    if (!hello) return;
    if (!d.name) { hello.hidden = true; hello.textContent = ""; return; }
    hello.textContent = "Hi " + d.name + ". ";
    var notMe = document.createElement("button");
    notMe.type = "button";
    notMe.className = "not-me";
    notMe.textContent = "Not you?";
    notMe.addEventListener("click", function () {
      if (window.SquadQuestRSVP) window.SquadQuestRSVP.forget();
      var first = document.querySelector('[data-night] [data-rsvp] button');
      if (first) first.focus();
    });
    hello.appendChild(notMe);
    hello.hidden = false;
  });

  if (!anySlot || unset(C.API_BASE)) return; // the page keeps its fallback text
  var embed = document.createElement("script");
  embed.src = C.EMBED_SRC || "squadquest-rsvp.js";
  embed.dataset.api = C.API_BASE;
  if (!unset(C.ANON_KEY)) embed.dataset.anonKey = C.ANON_KEY;
  embed.dataset.timezone = C.TIMEZONE || "America/New_York";
  document.body.appendChild(embed);
})();
