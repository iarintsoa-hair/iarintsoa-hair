/*
 * IARINTSOA Hair — Script commun des pages simples (informations légales…)
 * Recherche dans le catalogue (+ tissages) et apparitions douces.
 */
(function () {
    "use strict";
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const euro = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const li = (cls, text) => { const e = document.createElement("li"); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

    // ---------- Recherche ----------
    const panel = $("#search-panel"), input = $("#search-input"), results = $("#search-results"), opener = $("[data-search-open]");
    let catalog = null;
    function minPrice(p) {
        const v = p.pricesByLength ? Object.values(p.pricesByLength).filter(Number.isFinite) : [];
        if (v.length) return Math.min(...v);
        return p.promotion && Number.isFinite(p.promotionPrice) && p.promotionPrice < p.price ? p.promotionPrice : p.price;
    }
    function load() {
        const api = window.IARINTSOAProductData;
        if (catalog || !api) return Promise.resolve(catalog || []);
        return api.fetchCatalog().then((ids) => Promise.all(ids.map((id) => api.fetchProduct(id).catch(() => null)))).then((list) => {
            catalog = list.filter(Boolean).map((p) => ({ name: p.name, tags: `${p.texture || ""} ${p.tagline || ""}`, price: Number.isFinite(minPrice(p)) ? `Dès ${euro(minPrice(p))}` : "Sur demande", href: `fiche-produit.html?id=${encodeURIComponent(p.id)}` }));
            catalog.push({ name: "Tissages", tags: "tissage paquet 100 g bundle meche", price: "Dès 25 €", href: "tissages.html" });
            return catalog;
        });
    }
    function render() {
        const q = normalize(input.value.trim());
        results.replaceChildren();
        if (!catalog) { results.append(li("label", "Chargement…")); return; }
        const found = catalog.filter((s) => !q || normalize(`${s.name} ${s.tags}`).includes(q));
        results.append(li("label", q ? `${found.length} résultat${found.length > 1 ? "s" : ""}` : "Notre collection"));
        found.slice(0, q ? 40 : 10).forEach((s) => {
            const item = li(); const a = document.createElement("a"); const small = document.createElement("small");
            a.href = s.href; a.textContent = s.name; small.textContent = s.price; a.append(small); item.append(a); results.append(item);
        });
        if (!found.length) results.append(li("search-empty", "Aucun modèle trouvé. Notre équipe peut vous conseiller sur WhatsApp."));
    }
    function setSearch(open) {
        panel.classList.toggle("is-open", open);
        $(".search-backdrop").classList.toggle("is-open", open);
        opener.setAttribute("aria-expanded", String(open));
        if (open) { render(); load().then(render).catch(() => {}); setTimeout(() => input.focus(), 80); } else opener.focus();
    }
    if (panel && opener) {
        opener.addEventListener("click", () => setSearch(true));
        $$("[data-search-close]").forEach((x) => x.addEventListener("click", () => setSearch(false)));
        input.addEventListener("input", render);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("is-open")) setSearch(false); });
    }

    // ---------- Apparitions douces ----------
    const reveals = $$(".reveal");
    if ("IntersectionObserver" in window && !reduceMotion) {
        const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
        reveals.forEach((x) => io.observe(x));
    } else reveals.forEach((x) => x.classList.add("is-in"));
})();
