/* =============================================================
   Secrets of Cint — hero film
   Plays the "A new life candle experience" film muted and looping
   (browsers only autoplay silent video). The Sound button unmutes it
   and restarts from the match strike so the music lands in sync.
   The film fades up from black on first play; it pauses off-screen and
   honours reduced motion by holding the poster.
   ============================================================= */
(function () {
  "use strict";
  var video = document.getElementById("heroFilm");
  var btn = document.getElementById("heroSound");
  if (!video) return;

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var userPaused = still;
  if (still) { video.removeAttribute("autoplay"); video.pause(); video.setAttribute("data-still", ""); }

  function play() { var p = video.play(); if (p && p.catch) p.catch(function () { video.setAttribute("data-still", ""); }); }
  video.addEventListener("playing", function () { video.classList.add("playing"); });
  // If autoplay is blocked (low-power mode, data saver), show the poster instead of a black box.
  setTimeout(function () { if (video.paused && !video.classList.contains("playing")) video.setAttribute("data-still", ""); }, 2500);

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

  // Depth: the film drifts a little slower than the copy as the hero scrolls away.
  // Damped (lerped toward the true scroll) so it never feels twitchy; capped at 18px; transform only; off under reduced motion.
  var film = video.closest(".hero-film");
  if (film && !still && window.innerWidth > 900) {
    var target = 0, current = 0, ticking = false;
    function settle() {
      current += (target - current) * 0.12;
      film.style.setProperty("--drift", current.toFixed(2) + "px");
      if (Math.abs(target - current) > 0.05) requestAnimationFrame(settle); else ticking = false;
    }
    window.addEventListener("scroll", function () {
      target = Math.min(18, Math.max(0, window.scrollY) * 0.06);
      if (!ticking) { ticking = true; requestAnimationFrame(settle); }
    }, { passive: true });
  }
})();
