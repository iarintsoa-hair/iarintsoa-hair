/*
 * IARINTSOA Hair — Page d'accueil
 * -------------------------------
 * - Vitrines réelles : best-sellers et boutique filtrable, générées depuis data/products/*.json
 * - Recherche dans tout le catalogue (+ tissages)
 * - En-tête, méga-menu, menu mobile, apparitions douces
 * Aucune donnée n'est injectée comme HTML : tout passe par textContent / attributs.
 */
(function () {
    "use strict";

    const BESTSELLERS = ["jerry-curly-16-pouces", "straight-hd-lace", "jerry-curly-piano", "natural-wave"];
    const PAGE_SIZE = 12;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const euro = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
    const photoSrc = (p) => (typeof p === "string" ? p : p && (p.src || p.dataUrl || p.path));
    const ficheUrl = (id) => `fiche-produit.html?id=${encodeURIComponent(id)}`;
    const api = window.IARINTSOAProductData;

    // ---------- Notification discrète ----------
    const toast = $("#toast");
    let toastTimer;
    function notify(message) {
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
    }

    // ---------- Barre d'annonce : messages alternés ----------
    const messages = $$(".announce p");
    let current = 0;
    if (!reduceMotion && messages.length > 1) {
        setInterval(() => {
            messages[current].classList.remove("is-active");
            current = (current + 1) % messages.length;
            messages[current].classList.add("is-active");
        }, 4200);
    }

    // ---------- En-tête transparent au-dessus du hero, ivoire au défilement ----------
    const header = $("#header");
    const floatWa = $(".float-wa");
    const heroSection = $(".hero");
    let headerTicking = false;
    function updateHeader() {
        headerTicking = false;
        header.classList.toggle("is-solid", window.scrollY > 10);
        floatWa.classList.toggle("is-visible", window.scrollY > heroSection.offsetHeight * .7);
    }
    window.addEventListener("scroll", () => { if (!headerTicking) { headerTicking = true; requestAnimationFrame(updateHeader); } }, { passive: true });
    updateHeader();
    requestAnimationFrame(() => heroSection.classList.add("is-drawn"));
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([entry]) => heroSection.classList.toggle("is-offscreen", !entry.isIntersecting)).observe(heroSection);
    }

    // ---------- Règles de prix (identiques aux fiches) ----------
    const hasPromotion = (p) => Boolean(p.promotion) && Number.isFinite(p.promotionPrice) && p.price !== null && p.promotionPrice < p.price;
    function priceInfo(p) {
        const byLength = p.pricesByLength ? Object.values(p.pricesByLength).filter(Number.isFinite) : [];
        if (byLength.length) return { value: Math.min(...byLength), from: byLength.length > 1, old: null };
        if (hasPromotion(p)) return { value: p.promotionPrice, from: false, old: p.price };
        return { value: Number.isFinite(p.price) ? p.price : null, from: false, old: null };
    }

    // ---------- Classement pour les filtres ----------
    function family(p) {
        const t = `${p.texture || ""} ${p.name}`.toLowerCase();
        if (/bob|pixie/.test(t) || p.lengthNote) return "courtes";
        if (/curl|boucl|kinky|bouncy/.test(t)) return "bouclees";
        if (/wave|vague/.test(t)) return "ondulees";
        return "lisses";
    }
    function lengthGroups(p) {
        const groups = new Set();
        if (p.lengthNote) groups.add("courtes");
        p.lengths.forEach((l) => groups.add(l <= 14 ? "courtes" : l <= 20 ? "mi-longues" : "longues"));
        return groups;
    }
    function laceGroups(p) {
        const text = `${p.lace || ""} ${(p.laceOptions || []).join(" ")}`.toLowerCase();
        const groups = new Set();
        if (/4x4|5x5/.test(text)) groups.add("4x4");
        if (/13x4|frontal/.test(text)) groups.add("frontale");
        if (/\bhd\b/.test(text)) groups.add("hd");
        return groups;
    }
    function matches(p, key, value) {
        if (key === "texture") return value === "tout" || family(p) === value;
        if (key === "longueur") return lengthGroups(p).has(value);
        if (key === "dentelle") return laceGroups(p).has(value);
        if (key === "promo") return hasPromotion(p);
        return true;
    }

    // ---------- Carte produit (même style que la maquette validée) ----------
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (v === null || v === undefined || v === false) return;
            if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, String(v));
        });
        children.flat().forEach((c) => { if (c !== null && c !== undefined) node.append(c); });
        return node;
    }
    function badgeClass(label) {
        if (/best/i.test(label)) return "badge badge--black";
        if (/premium|limited|édition/i.test(label)) return "badge badge--gold";
        return "badge";
    }
    function metaLine(p) {
        const parts = ["Remy"];
        if (p.lengthNote) parts.push(p.lengthNote);
        else if (p.lengths.length) {
            const min = Math.min(...p.lengths), max = Math.max(...p.lengths);
            parts.push(min === max ? `${min}″` : `${min}–${max}″`);
        }
        const laces = (p.laceOptions || []).map((l) => String(l).replace(/(\d)x(\d)/gi, "$1×$2"));
        if (laces.length) parts.push(`Lace ${laces.join(" / ")}`);
        else if (p.lace && !/sans/i.test(p.lace)) parts.push(p.lace);
        return parts.join(" · ");
    }
    function card(p) {
        const url = ficheUrl(p.id);
        const first = p.photos[0], second = p.photos[1];
        const media = el("a", { class: "product-media", href: url, "aria-label": `Voir la fiche ${p.name}` },
            el("img", { src: photoSrc(first), alt: (typeof first === "object" && first.alt) || `Perruque ${p.name}`, loading: "lazy", decoding: "async" }));
        // 2e photo au survol : uniquement avec une souris (sur mobile elle ne serait jamais vue, mais téléchargée)
        if (second && canHover) media.append(el("img", { class: "alt-img", src: photoSrc(second), alt: "", loading: "lazy", decoding: "async" }));
        const badges = el("div", { class: "badges" });
        (Array.isArray(p.badges) ? p.badges : []).forEach((b) => badges.append(el("span", { class: badgeClass(b), text: b })));
        if (hasPromotion(p)) badges.append(el("span", { class: "badge", text: p.promotion }));
        const info = priceInfo(p);
        const price = el("p", { class: "product-price" });
        if (info.value === null) price.append(el("small", { text: "Prix" }), el("strong", { text: "sur demande" }));
        else {
            price.append(el("small", { text: info.from ? "Dès" : "Prix" }), el("strong", { class: info.old ? "promo" : null, text: euro(info.value) }));
            if (info.old) price.append(el("del", { text: euro(info.old) }));
        }
        return el("article", { class: "product-card" },
            el("div", { class: "product-visual" }, media, badges.childElementCount ? badges : null, el("a", { class: "quick-add", href: url, text: "Découvrir" })),
            el("div", { class: "product-info" }, el("h3", null, el("a", { href: url, text: p.name })), el("p", { class: "product-meta", text: metaLine(p) }), price));
    }

    // ---------- Chargement du catalogue ----------
    let products = [];
    const state = { texture: "tout", refine: null, shown: PAGE_SIZE };
    const shopGrid = $("#shop-grid");

    function renderShop() {
        const list = products.filter((p) => matches(p, "texture", state.texture) && (!state.refine || matches(p, ...state.refine.split(":"))));
        shopGrid.replaceChildren(...list.slice(0, state.shown).map(card));
        $("#shop-count").textContent = list.length ? `${list.length} modèle${list.length > 1 ? "s" : ""}` : "";
        $("#shop-empty").hidden = list.length > 0;
        $("#shop-more").hidden = list.length <= state.shown;
        $$("[data-chip]").forEach((chip) => {
            const [key, value] = chip.dataset.chip.split(":");
            chip.setAttribute("aria-pressed", String(key === "texture" ? state.texture === value : state.refine === chip.dataset.chip));
        });
    }
    function applyFilter(filter, scroll) {
        const [key, value] = filter.split(":");
        if (key === "texture") { state.texture = value; state.refine = null; }
        else { state.texture = "tout"; state.refine = filter; }
        state.shown = PAGE_SIZE;
        renderShop();
        if (scroll) $("#boutique").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
    $$("[data-chip]").forEach((chip) => chip.addEventListener("click", () => {
        const [key, value] = chip.dataset.chip.split(":");
        if (key === "texture") state.texture = value;
        else state.refine = state.refine === chip.dataset.chip ? null : chip.dataset.chip;
        state.shown = PAGE_SIZE;
        renderShop();
    }));
    $("#shop-more").addEventListener("click", () => { state.shown += PAGE_SIZE; renderShop(); });
    // Liens du méga-menu, des collections et du pied de page : ouvrent la boutique déjà filtrée
    $$("a[data-filter]").forEach((link) => link.addEventListener("click", (event) => {
        event.preventDefault();
        closeMenus();
        applyFilter(link.dataset.filter, true);
        history.replaceState(null, "", "#boutique");
    }));

    if (!api) {
        $("#shop-count").textContent = "La collection n’a pas pu être chargée. Notre équipe vous répond sur WhatsApp.";
    } else {
        api.fetchCatalog()
            .then((ids) => Promise.all(ids.map((id) => api.fetchProduct(id).catch(() => null))))
            .then((list) => {
                products = list.filter(Boolean);
                const byId = new Map(products.map((p) => [p.id, p]));
                $("#bestseller-grid").replaceChildren(...BESTSELLERS.map((id) => byId.get(id)).filter(Boolean).map(card));
                renderShop();
                // Arrivée depuis une autre page sur index.html#boutique : la boutique est déjà visible
            })
            .catch(() => { $("#shop-count").textContent = "La collection n’a pas pu être chargée. Notre équipe vous répond sur WhatsApp."; });
    }

    // ---------- Recherche (catalogue réel + tissages) ----------
    const searchPanel = $("#search-panel"), searchBackdrop = $(".search-backdrop"), searchInput = $("#search-input"), searchResults = $("#search-results"), searchOpener = $("[data-search-open]");
    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    function searchEntries() {
        const entries = products.map((p) => {
            const info = priceInfo(p);
            return { name: p.name, tags: `${p.texture || ""} ${p.tagline || ""} ${family(p)} ${metaLine(p)}`, price: info.value === null ? "Sur demande" : `${info.from ? "Dès " : ""}${euro(info.value)}`, href: ficheUrl(p.id) };
        });
        entries.push({ name: "Tissages", tags: "tissage paquet 100 g bundle meche", price: "Dès 25 €", href: "tissages.html" });
        return entries;
    }
    function renderSearch() {
        const query = normalize(searchInput.value.trim());
        searchResults.replaceChildren();
        if (!products.length) { searchResults.append(el("li", { class: "label", text: "Chargement…" })); return; }
        const found = searchEntries().filter((s) => !query || normalize(`${s.name} ${s.tags}`).includes(query));
        searchResults.append(el("li", { class: "label", text: query ? `${found.length} résultat${found.length > 1 ? "s" : ""}` : "Notre collection" }));
        found.slice(0, query ? 40 : 10).forEach((s) => searchResults.append(el("li", null, el("a", { href: s.href }, s.name, el("small", { text: s.price })))));
        if (!found.length) searchResults.append(el("li", { class: "search-empty", text: "Aucun modèle trouvé. Notre équipe peut vous conseiller sur WhatsApp." }));
    }
    function setSearch(open) {
        searchPanel.classList.toggle("is-open", open);
        searchBackdrop.classList.toggle("is-open", open);
        searchOpener.setAttribute("aria-expanded", String(open));
        if (open) { renderSearch(); setTimeout(() => searchInput.focus(), 80); } else searchOpener.focus();
    }
    searchOpener.addEventListener("click", () => setSearch(true));
    $$("[data-search-close]").forEach((x) => x.addEventListener("click", () => setSearch(false)));
    searchInput.addEventListener("input", renderSearch);

    // ---------- Méga-menu (clavier et tactile) ----------
    $$(".nav-item > button").forEach((button) => button.addEventListener("click", () => {
        const item = button.parentElement;
        const open = !item.classList.contains("is-open");
        item.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", String(open));
    }));

    // ---------- Menu mobile ----------
    const drawer = $("#drawer");
    const burger = $("[data-drawer-open]");
    function setDrawer(open) {
        drawer.classList.toggle("is-open", open);
        drawer.setAttribute("aria-hidden", String(!open));
        burger.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
        if (open) $(".drawer-top .icon-btn", drawer).focus();
    }
    function closeMenus() {
        if (drawer.classList.contains("is-open")) setDrawer(false);
        $$(".nav-item.is-open").forEach((item) => { item.classList.remove("is-open"); $("button", item).setAttribute("aria-expanded", "false"); });
        if (document.activeElement && document.activeElement.closest(".mega")) document.activeElement.blur();
    }
    burger.addEventListener("click", () => setDrawer(true));
    $$("[data-drawer-close]", drawer).forEach((x) => x.addEventListener("click", () => { if (drawer.classList.contains("is-open")) { setDrawer(false); burger.focus(); } }));
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (searchPanel.classList.contains("is-open")) setSearch(false);
        closeMenus();
    });

    // ---------- Apparitions douces (et dessin des traits de signature) ----------
    const animated = $$(".reveal, .signature-stroke:not(.hero .signature-stroke)");
    if ("IntersectionObserver" in window && !reduceMotion) {
        const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add(entry.target.classList.contains("signature-stroke") ? "is-drawn" : "is-in");
            observer.unobserve(entry.target);
        }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
        animated.forEach((x) => observer.observe(x));
    } else {
        $$(".reveal").forEach((x) => x.classList.add("is-in"));
    }

    window.IARINTSOAHome = { notify };
})();
