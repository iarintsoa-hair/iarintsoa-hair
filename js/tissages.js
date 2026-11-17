/*
 * IARINTSOA Hair — Page Tissages
 * ------------------------------
 * Choix de la texture, de la longueur et du nombre de paquets (100 g) → prix et message WhatsApp pré-rempli.
 * Les données (textures, prix) sont écrites dans tissages.html (data-desc, data-price) : rien n'est injecté en HTML.
 */
(function () {
    "use strict";

    const PHONE = "262693600145";
    const MAX_QTY = 10;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const euro = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
    const state = { qty: 1 };

    const toast = $("#toast");
    let toastTimer;
    function notify(message) {
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
    }

    // ---------- Sélection : texture, longueur, paquets → prix + WhatsApp ----------
    function update() {
        const texture = $('input[name="texture"]:checked');
        const length = $('input[name="length"]:checked');
        const len = Number(length.value);
        const unit = Number(length.dataset.price);
        const total = unit * state.qty;
        $("#tx-texture-output").textContent = texture.value;
        $("#tx-name").textContent = texture.value;
        $("#tx-desc").textContent = texture.dataset.desc;
        $("#length-output").textContent = `${len} pouces · ${Math.round(len * 2.54)} cm`;
        const price = $("#price");
        if (!reduceMotion) { price.classList.add("is-updating"); setTimeout(() => price.classList.remove("is-updating"), 180); }
        price.textContent = euro(total);
        $("#price-caption").textContent = `${state.qty} paquet${state.qty > 1 ? "s" : ""} de 100 g · ${len} pouces${state.qty > 1 ? ` · ${euro(unit)} le paquet` : ""}`;
        $$("[data-price-short]").forEach((e) => { e.textContent = `${Math.round(total)} €`; });
        $("#qty").textContent = String(state.qty);
        $("#qty-minus").disabled = state.qty <= 1;
        $("#qty-plus").disabled = state.qty >= MAX_QTY;
        $$(".guide-table tr[data-len]").forEach((r) => r.classList.toggle("is-active", Number(r.dataset.len) === len));
        const message = [
            "Bonjour, je souhaite commander un tissage",
            `— Texture : ${texture.value} (${texture.dataset.desc.toLowerCase()})`,
            `— Longueur : ${len} pouces (${Math.round(len * 2.54)} cm)`,
            `— Paquets de 100 g : ${state.qty}`,
            `— Prix : ${euro(total)} (${euro(unit)} le paquet)`,
            "Livraison à La Réunion. Pouvez-vous me confirmer la disponibilité ?"
        ].join("\n");
        $$("[data-wa-link]").forEach((a) => { a.href = `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`; });
    }
    $("#tx-grid").addEventListener("change", update);
    $("#lengths").addEventListener("change", update);
    $("#qty-minus").addEventListener("click", () => { state.qty = Math.max(1, state.qty - 1); update(); });
    $("#qty-plus").addEventListener("click", () => { state.qty = Math.min(MAX_QTY, state.qty + 1); update(); });
    update();

    // ---------- Recherche (perruques du catalogue + tissages) ----------
    let catalog = null;
    const searchPanel = $("#search-panel"), searchInput = $("#search-input"), searchResults = $("#search-results"), searchOpener = $("[data-search-open]");
    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const li = (cls, text) => { const e = document.createElement("li"); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    function loadCatalog() {
        if (catalog) return Promise.resolve(catalog);
        const api = window.IARINTSOAProductData;
        if (!api) return Promise.resolve([]);
        return api.fetchCatalog().then((ids) => Promise.all(ids.map((id) => api.fetchProduct(id).catch(() => null)))).then((list) => {
            catalog = list.filter(Boolean).map((p) => ({ name: p.name, tags: `${p.texture || ""} ${p.tagline || ""} perruque`, price: "Perruque", href: `fiche-produit.html?id=${encodeURIComponent(p.id)}` }));
            catalog.unshift({ name: "Tissages", tags: "tissage paquet 100 g bundle meche", price: "Dès 25 €", href: "tissages.html" });
            return catalog;
        });
    }
    function renderSearch() {
        const query = normalize(searchInput.value.trim());
        searchResults.replaceChildren();
        if (!catalog) { searchResults.append(li("label", "Chargement…")); return; }
        const found = catalog.filter((s) => !query || normalize(`${s.name} ${s.tags}`).includes(query));
        searchResults.append(li("label", query ? `${found.length} résultat${found.length > 1 ? "s" : ""}` : "Notre collection"));
        found.forEach((s) => {
            const item = li(); const a = document.createElement("a"); const small = document.createElement("small");
            a.href = s.href; a.textContent = s.name; small.textContent = s.price; a.append(small); item.append(a); searchResults.append(item);
        });
        if (!found.length) searchResults.append(li("search-empty", "Aucun modèle trouvé. Notre équipe peut vous conseiller sur WhatsApp."));
    }
    function setSearch(open) {
        searchPanel.classList.toggle("is-open", open);
        $(".search-backdrop").classList.toggle("is-open", open);
        searchOpener.setAttribute("aria-expanded", String(open));
        if (open) { renderSearch(); loadCatalog().then(renderSearch).catch(() => {}); setTimeout(() => searchInput.focus(), 80); } else searchOpener.focus();
    }
    searchOpener.addEventListener("click", () => setSearch(true));
    $$("[data-search-close]").forEach((x) => x.addEventListener("click", () => setSearch(false)));
    searchInput.addEventListener("input", renderSearch);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && searchPanel.classList.contains("is-open")) setSearch(false); });

    // ---------- WhatsApp flottant : rangé quand le panneau de commande est visible sur mobile ----------
    const floatWa = $("#float-wa");
    let ticking = false;
    window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            const r = $("#purchase").getBoundingClientRect();
            floatWa.classList.toggle("is-tucked", window.matchMedia("(max-width: 760px)").matches && r.top < window.innerHeight && r.bottom > 0);
        });
    }, { passive: true });

    // ---------- Apparitions douces ----------
    const reveals = $$(".reveal");
    if ("IntersectionObserver" in window && !reduceMotion) {
        const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
        reveals.forEach((x) => io.observe(x));
    } else reveals.forEach((x) => x.classList.add("is-in"));
})();
