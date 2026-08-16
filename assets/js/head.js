/* Render-blocking, tiny: marks that JS is available so scroll-reveal
   animations only hide content when we can actually animate it back in.
   Without JS, the `.js` class is never added and all content stays visible. */
document.documentElement.classList.add("js");
