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
 */
(function () {
  "use strict";
  var C = window.FLYER_CONFIG || {};
  var unset = function (v) { return !v || /^__.*__$/.test(v); };

  var nights = [
    { key: "friday", open: C.FRIDAY_OPEN_LINK, event: C.FRIDAY_EVENT_ID },
    { key: "saturday", open: C.SATURDAY_OPEN_LINK, event: C.SATURDAY_EVENT_ID },
  ];

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
    anySlot = true;
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
