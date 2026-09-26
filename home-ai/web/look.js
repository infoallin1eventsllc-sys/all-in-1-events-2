// Applies the chosen look before the page paints: "grounded" (default),
// "futuristic" or "vivid", and the appearance (auto, light or dark). A demo
// link can force them with ?look=vivid&theme=dark.
(function () {
  var params = new URLSearchParams(location.search);
  var looks = ["grounded", "futuristic", "vivid"];
  var saved = null, theme = null;
  try { saved = localStorage.getItem("haven.look"); theme = localStorage.getItem("haven.theme"); } catch (e) {}
  var q = params.get("look"), t = params.get("theme");
  var look = looks.indexOf(q) >= 0 ? q : looks.indexOf(saved) >= 0 ? saved : "grounded";
  document.documentElement.setAttribute("data-look", look);
  theme = t === "light" || t === "dark" ? t : theme;
  if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
})();
