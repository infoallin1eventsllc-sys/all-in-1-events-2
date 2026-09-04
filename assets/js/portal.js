/* =============================================================
   Secrets of Cint — Owner Photo Control portal
   Discreet, PIN-gated (soft gate, not real security). Lets the owner
   swap any photo by file upload or image URL; updates the site live
   (browser-local via window.SOC), and exports a ready-to-publish ZIP.
   ============================================================= */
(function () {
  "use strict";
  var SOC = window.SOC;
  if (!SOC) return;

  var PIN = "1234";

  /* Every editable image on the site: id must match img[data-product]
     and the product ids in main.js. `file` is the asset filename used
     when publishing (drop the exported ZIP into assets/images/). */
  var SLOTS = [
    { id: "hero",               name: "Hero banner (top of page)", file: "hero.jpg" },
    { id: "spotlight",          name: "Signature spotlight",       file: "spotlight.jpg" },
    { id: "harlem-smock",       name: "Harlem Smock",              file: "real-harlem-smock.jpg" },
    { id: "moon-flower",        name: "Moon Flower",               file: "moon-flower.jpg" },
    { id: "inferno-dreams",     name: "Inferno Dreams",            file: "real-inferno-dreams.jpg" },
    { id: "exotic-peach",       name: "Exotic Peach",              file: "real-exotic-peach.jpg" },
    { id: "brewed-elixir",      name: "Brewed Elixir",             file: "real-brewed-elixir.jpg" },
    { id: "for-him",            name: "For Him",                   file: "for-him.jpg" },
    { id: "vintage-bloom",      name: "Vintage Bloom",             file: "vintage-bloom.jpg" },
    { id: "stress-relief",      name: "Stress Relief",             file: "stress-relief.jpg" },
    { id: "exotic-peach-spray", name: "Exotic Peach Room Spray",   file: "real-exotic-peach-spray.jpg" },
    { id: "amber-blush-spray",  name: "Amber Blush Room Spray",    file: "real-amber-blush.jpg" },
    { id: "stress-relief-spray",name: "Stress Relief Room Spray",  file: "stress-relief-spray.jpg" },
    { id: "moon-flower-spray",  name: "Moon Flower Room Spray",    file: "real-moon-flower-spray.jpg" },
    { id: "citrus-grove",       name: "No.7 Citrus Grove",         file: "real-citrus-grove.jpg" }
  ];
  var SLOT_BY_ID = {};
  SLOTS.forEach(function (s) { SLOT_BY_ID[s.id] = s; });

  function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
  // Resolve a default asset. On the deployed site this is the real file path;
  // inside the self-contained preview, images are provided via window.SOC_ASSETS.
  function assetUrl(file) { return (window.SOC_ASSETS && window.SOC_ASSETS[file]) || ("assets/images/" + file); }
  function defaultSrc(id) { return assetUrl(SLOT_BY_ID[id].file); }
  function currentSrc(id) { return SOC.get(id) || defaultSrc(id); }
  function toast(m) {
    var t = document.getElementById("toast"), s = document.getElementById("toastMsg");
    if (!t || !s) return; s.textContent = m; t.classList.add("show");
    clearTimeout(window.__soct); window.__soct = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- overlay + views ---------- */
  var overlay, pinView, panelView, built = false;

  function buildOverlay() {
    if (built) return;
    built = true;
    overlay = el("div", "soc-overlay");
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    buildPin();
    buildPanel();
  }

  function buildPin() {
    pinView = el("div", "soc-pin");
    pinView.innerHTML =
      '<div class="lock">🔒</div>' +
      '<h3>Owner Login</h3>' +
      '<p>Enter your 4-digit PIN to manage photos.</p>' +
      '<input id="socPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN" />' +
      '<div class="err" id="socErr"></div>' +
      '<div class="row"><button class="btn ghost" id="socCancel">Cancel</button><button class="btn" id="socEnter">Enter</button></div>';
    overlay.appendChild(pinView);
    var input = pinView.querySelector("#socPin");
    var err = pinView.querySelector("#socErr");
    function submit() {
      if (input.value === PIN) { err.textContent = ""; input.value = ""; showPanel(); }
      else { err.textContent = "Incorrect PIN. Try again."; input.value = ""; input.focus(); }
    }
    pinView.querySelector("#socEnter").addEventListener("click", submit);
    pinView.querySelector("#socCancel").addEventListener("click", close);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function buildPanel() {
    panelView = el("div", "soc-panel");
    var head = el("div", "soc-head");
    head.innerHTML =
      '<div><h2>📸 Owner Photo Control</h2><div class="sub">Update any photo — changes show on the site instantly.</div></div>' +
      '<div class="soc-tools">' +
        '<button class="btn" id="socExport">Export ZIP to publish</button>' +
        '<button class="btn sec" id="socResetAll">Reset all</button>' +
        '<button class="btn sec" id="socClose">Close</button>' +
      '</div>';
    panelView.appendChild(head);

    var note = el("div", "soc-note");
    note.innerHTML = 'Uploads preview <b>live in this browser</b> right away. To publish them for <b>all visitors</b>, click <b>Export ZIP</b> and hand the file to your developer (drop into <code>assets/images/</code> &amp; redeploy). Tip: square or upright photos crop best.';
    panelView.appendChild(note);

    var grid = el("div", "soc-grid");
    SLOTS.forEach(function (s) { grid.appendChild(buildSlot(s)); });
    panelView.appendChild(grid);
    overlay.appendChild(panelView);

    head.querySelector("#socClose").addEventListener("click", close);
    head.querySelector("#socResetAll").addEventListener("click", resetAll);
    head.querySelector("#socExport").addEventListener("click", exportZip);
  }

  function buildSlot(s) {
    var slot = el("div", "soc-slot");
    var thumbWrap = el("div", "soc-thumb");
    var thumb = el("img"); thumb.src = currentSrc(s.id); thumb.alt = s.name;
    thumbWrap.appendChild(thumb);

    var body = el("div", "body");
    var nm = el("div", "nm"); nm.textContent = s.name;
    var fn = el("div", "fn"); fn.textContent = s.file;
    var live = el("span", "live"); live.textContent = SOC.get(s.id) ? "● Custom photo set" : "";
    body.appendChild(nm); body.appendChild(fn); body.appendChild(live);

    // file drop / picker
    var drop = el("label", "soc-drop");
    drop.textContent = "Click or drop a photo here";
    var file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    drop.appendChild(file);
    function handleFile(f) {
      if (!f || !/^image\//.test(f.type)) { toast("Please choose an image file"); return; }
      var r = new FileReader();
      r.onload = function () { apply(s.id, r.result, thumb, live); };
      r.readAsDataURL(f);
    }
    file.addEventListener("change", function () { handleFile(file.files[0]); });
    ["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { handleFile(e.dataTransfer.files[0]); });

    // image URL
    var urlRow = el("div", "soc-url");
    var url = el("input"); url.type = "url"; url.placeholder = "…or paste an image URL";
    var urlBtn = el("button"); urlBtn.type = "button"; urlBtn.textContent = "Apply";
    urlRow.appendChild(url); urlRow.appendChild(urlBtn);
    urlBtn.addEventListener("click", function () {
      var v = url.value.trim();
      if (!/^https?:\/\//i.test(v)) { toast("Enter a valid image URL (https://…)"); return; }
      apply(s.id, v, thumb, live); url.value = "";
    });
    url.addEventListener("keydown", function (e) { if (e.key === "Enter") urlBtn.click(); });

    var reset = el("button", "reset"); reset.type = "button"; reset.textContent = "Reset to original";
    reset.addEventListener("click", function () {
      SOC.remove(s.id);
      var imgs = document.querySelectorAll('img[data-product="' + s.id + '"]');
      for (var i = 0; i < imgs.length; i++) imgs[i].src = defaultSrc(s.id);
      thumb.src = defaultSrc(s.id); live.textContent = "";
      toast(s.name + " reset");
    });

    body.appendChild(drop); body.appendChild(urlRow); body.appendChild(reset);
    slot.appendChild(thumbWrap); slot.appendChild(body);
    return slot;
  }

  function apply(id, src, thumb, live) {
    SOC.set(id, src);          // persists + updates every img[data-product=id] live
    if (thumb) thumb.src = src;
    if (live) live.textContent = "● Custom photo set";
    toast(SLOT_BY_ID[id].name + " updated");
  }

  function resetAll() {
    if (!window.confirm("Reset ALL photos back to the originals?")) return;
    SOC.clear();
    location.reload();
  }

  /* ---------- export ---------- */
  function exportZip() {
    if (!window.JSZip) { toast("ZIP library not loaded"); return; }
    var ids = Object.keys(SOC.map);
    if (!ids.length) { toast("No new photos to export yet"); return; }
    var zip = new JSZip();
    var pending = 0, added = 0, skipped = 0, done = false;
    function finish() {
      if (done) return; done = true;
      if (!added) { toast("Could not package photos (external URLs can't be exported)"); return; }
      zip.generateAsync({ type: "blob" }).then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "secrets-of-cint-photos.zip";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast("Exported " + added + " photo" + (added > 1 ? "s" : "") + (skipped ? " (" + skipped + " URL skipped)" : ""));
      });
    }
    ids.forEach(function (id) {
      var s = SLOT_BY_ID[id]; if (!s) return;
      var src = SOC.map[id];
      var m = /^data:.*?;base64,(.*)$/.exec(src || "");
      if (m) { zip.file(s.file, m[1], { base64: true }); added++; }
      else {  // external URL — try to fetch it into the zip
        pending++;
        fetch(src).then(function (r) { return r.blob(); })
          .then(function (b) { return b.arrayBuffer(); })
          .then(function (buf) { zip.file(s.file, buf); added++; })
          .catch(function () { skipped++; })
          .finally(function () { pending--; if (pending === 0) finish(); });
      }
    });
    if (pending === 0) finish();
  }

  /* ---------- open/close ---------- */
  function showPin() { panelView.style.display = "none"; pinView.style.display = "block"; overlay.classList.add("open"); document.body.style.overflow = "hidden"; setTimeout(function () { var i = pinView.querySelector("#socPin"); if (i) i.focus(); }, 60); }
  function showPanel() { pinView.style.display = "none"; panelView.style.display = "flex"; }
  function close() { overlay.classList.remove("open"); document.body.style.overflow = ""; }

  var trigger = document.getElementById("ownerLogin");
  if (trigger) trigger.addEventListener("click", function () { buildOverlay(); showPin(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay && overlay.classList.contains("open")) close(); });
})();
