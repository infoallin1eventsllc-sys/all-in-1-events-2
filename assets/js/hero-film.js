/* =============================================================
   Secrets of Cint — hero film
   Plays the "A new life candle experience" film muted and looping
   (browsers only autoplay silent video). The Sound button unmutes it
   and restarts from the match strike so the music lands in sync.
   Pauses off-screen; honours reduced motion by showing the poster.
   ============================================================= */
(function () {
  "use strict";
  var video = document.getElementById("heroFilm");
  var btn = document.getElementById("heroSound");
  if (!video) return;

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var userPaused = still;
  if (still) { video.removeAttribute("autoplay"); video.pause(); }

  function play() { var p = video.play(); if (p && p.catch) p.catch(function () {}); }

  if (btn) {
    btn.addEventListener("click", function () {
      var on = video.muted;
      video.muted = !on;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
      btn.querySelector(".lbl").textContent = on ? "Sound off" : "Sound on";
      if (on) { video.currentTime = 0; userPaused = false; play(); }
    });
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      if (userPaused && video.muted) return;
      if (es[0].isIntersecting) play(); else video.pause();
    }, { threshold: 0.2 }).observe(video);
  }
})();
