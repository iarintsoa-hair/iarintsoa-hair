/*
 * IARINTSOA Hair — Menu mobile des pages intérieures (fiches, tissages, panier, commande, informations légales, 404).
 */
(function () {
    "use strict";
    const menu = document.getElementById("menu-mobile");
    const opener = document.querySelector("[data-menu-open]");
    if (!menu || !opener) return;
    function setMenu(open) {
        menu.classList.toggle("is-open", open);
        menu.setAttribute("aria-hidden", String(!open));
        opener.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
        if (open) menu.querySelector("[data-menu-close].icon-btn").focus(); else opener.focus();
    }
    opener.addEventListener("click", () => setMenu(true));
    menu.querySelectorAll("[data-menu-close]").forEach((x) => x.addEventListener("click", () => setMenu(false)));
    menu.querySelectorAll("nav a").forEach((a) => a.addEventListener("click", () => { menu.classList.remove("is-open"); menu.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false); });
})();
