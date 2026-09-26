// Applies the chosen look before the page paints: "grounded" (default) or
// "futuristic". A demo link can force one with ?look=futuristic.
(function () {
  var q = new URLSearchParams(location.search).get("look");
  var saved = null;
  try { saved = localStorage.getItem("haven.look"); } catch (e) {}
  var look = q === "futuristic" || q === "grounded" ? q : saved || "grounded";
  document.documentElement.setAttribute("data-look", look);
})();
