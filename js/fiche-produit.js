/*
 * IARINTSOA Hair — Modèle de fiche produit réutilisable
 * -----------------------------------------------------
 * Remplit fiche-produit.html à partir de data/products/<id>.json (format « iarintsoa-product » v1).
 * Ajouter une perruque = ajouter son JSON (+ photos) et son identifiant dans data/products/index.json.
 * Aucune donnée n'est injectée comme HTML : tout passe par textContent (sécurité).
 */
(function () {
    "use strict";

    // ---------- Constantes de la marque ----------
    const PHONE = "262693600145";
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
    const euro = (n, currency) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR" }).format(n);
    const waUrl = (message) => `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;

    const LACE_TEXT = {
        "4x4": "Raie centrale, pose facile et rapide.",
        "5x5": "Raie plus libre, rendu plus naturel.",
        "6x6": "Grande liberté de raie, rendu très naturel.",
        "13x4": "D’une oreille à l’autre : liberté totale.",
        "13x6": "Frontal profond : raie libre, naissance ultra naturelle.",
        "360": "Dentelle tout autour : coiffures hautes possibles.",
        "full": "Dentelle intégrale : liberté de coiffage maximale."
    };
    const GUIDE_MARKS = { 8: "Oreilles", 10: "Menton", 12: "Épaules", 14: "Clavicules", 16: "Haut de la poitrine", 18: "Poitrine", 20: "Sous la poitrine", 22: "Milieu du dos", 24: "Taille", 26: "Sous la taille", 28: "Hanches", 30: "Bas des hanches" };
    const ICONS = ["i-strand", "i-gem", "i-chat", "i-pin"];

    // ---------- Petits utilitaires DOM (texte uniquement) ----------
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (v === null || v === undefined || v === false) return;
            if (k === "class") node.className = v;
            else if (k === "text") node.textContent = v;
            else node.setAttribute(k, v === true ? "" : String(v));
        });
        children.flat().forEach((c) => { if (c !== null && c !== undefined) node.append(c); });
        return node;
    }
    function icon(id) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "icon");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `#${id}`);
        svg.append(use);
        return svg;
    }
    const laceLabel = (l) => (/^13x/i.test(l) ? "Frontal " : "") + String(l).replace(/(\d)x(\d)/gi, "$1×$2");
    const photoSrc = (p) => (typeof p === "string" ? p : p && (p.src || p.dataUrl || p.path));
    const toast = $("#toast");
    let toastTimer;
    function notify(message) {
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
    }

    // ---------- Règles de prix (identiques au site actuel, + supplément de dentelle optionnel) ----------
    function hasPromotion(p) { return Boolean(p.promotion) && Number.isFinite(p.promotionPrice) && p.price !== null && p.promotionPrice < p.price; }
    function lengthPrice(p, len) { const v = p.pricesByLength && p.pricesByLength[String(len)]; return Number.isFinite(v) ? v : null; }
    function laceExtra(p, lace) { const v = p.lacePrices && p.lacePrices[lace]; return Number.isFinite(v) ? v : 0; }
    function unitPrice(p, len, lace) {
        const base = len !== null && lengthPrice(p, len) !== null ? lengthPrice(p, len) : hasPromotion(p) ? p.promotionPrice : p.price;
        return base === null || base === undefined ? null : base + laceExtra(p, lace);
    }
    function minPrice(p) {
        const values = p.pricesByLength ? Object.values(p.pricesByLength).filter(Number.isFinite) : [];
        if (values.length) return Math.min(...values);
        return hasPromotion(p) ? p.promotionPrice : p.price;
    }

    // ---------- État de la sélection ----------
    const state = { product: null, length: null, lace: null, qty: 1 };
    const maxQty = () => (Number.isInteger(state.product.stock) && state.product.stock > 0 ? Math.min(state.product.stock, 10) : 10);

    // ---------- Chargement ----------
    const id = new URLSearchParams(location.search).get("id") || "jerry-curly-hd-lace";
    const api = window.IARINTSOAProductData;
    if (!api) { showError(); return; }
    api.fetchProduct(id).then(render).catch(showError);

    function showError() {
        $("#page-loading").hidden = true;
        $("#page-error").hidden = false;
        document.title = "Modèle introuvable | IARINTSOA Hair";
    }

    function render(p) {
        state.product = p;
        state.length = p.lengths.length ? (p.lengths.includes(p.defaultLength) ? p.defaultLength : p.lengths[Math.floor((p.lengths.length - 1) / 2)]) : null;
        const laces = Array.isArray(p.laceOptions) && p.laceOptions.length ? p.laceOptions : [];
        state.lace = laces.length ? (laces.includes(p.defaultLace) ? p.defaultLace : laces.find((l) => typeof p.lace === "string" && p.lace.toLowerCase().startsWith(l.toLowerCase())) || laces[0]) : null;
        state.lace = forcedLace(p, state.length) || state.lace;

        renderMeta(p);
        renderGallery(p);
        renderIdentity(p);
        renderLengths(p);
        renderLaces(p, laces);
        renderSpecs(p, laces);
        renderWhy(p);
        renderGuide(p);
        renderCare(p);
        renderReviews(p);
        renderFaq(p, laces);
        renderSimilar(p);
        bindPurchase();
        update();

        $("#page-loading").hidden = true;
        $("#page-content").hidden = false;
        startReveal();
    }

    // ---------- SEO : titre, description, données structurées ----------
    function renderMeta(p) {
        document.title = `${p.name} — Perruque cheveux humains Remy | IARINTSOA Hair`;
        $('meta[name="description"]').content = `${p.tagline || p.description}`.slice(0, 155);
        const offers = p.pricesByLength && Object.keys(p.pricesByLength).length
            ? { "@type": "AggregateOffer", priceCurrency: p.currency || "EUR", lowPrice: String(Math.min(...Object.values(p.pricesByLength))), highPrice: String(Math.max(...Object.values(p.pricesByLength))), offerCount: String(Object.keys(p.pricesByLength).length) }
            : Number.isFinite(minPrice(p)) ? { "@type": "Offer", priceCurrency: p.currency || "EUR", price: String(minPrice(p)) } : undefined;
        if (offers && Number.isInteger(p.stock)) offers.availability = p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
        else if (offers && p.available === true) offers.availability = "https://schema.org/InStock";
        const data = { "@context": "https://schema.org", "@type": "Product", name: `Perruque ${p.name}`, brand: { "@type": "Brand", name: "IARINTSOA Hair" }, description: p.description, image: p.photos.map((ph) => new URL(photoSrc(ph), location.href).href) };
        if (offers) data.offers = offers;
        const script = el("script", { type: "application/ld+json" });
        script.textContent = JSON.stringify(data);
        document.head.append(script);
    }

    // ---------- Galerie : photos + vidéo optionnelle, zoom, plein écran, glisser sur mobile ----------
    let slides = [];
    let active = 0;
    let lbCurrent = 0;
    function renderGallery(p) {
        const track = $("#stage-track");
        p.photos.forEach((ph, i) => {
            const img = el("img", { src: photoSrc(ph), alt: (typeof ph === "object" && ph.alt) || `Perruque ${p.name}, photo ${i + 1}`, decoding: "async", loading: i === 0 ? null : "lazy", fetchpriority: i === 0 ? "high" : null });
            track.append(el("figure", { class: `slide${i === 0 ? " is-active" : ""}` }, img));
        });
        if (p.video && p.video.src) {
            const poster = p.video.poster || photoSrc(p.photos[0]);
            track.append(el("figure", { class: "slide slide--video", "data-poster": poster, "data-video": p.video.src },
                el("img", { class: "video-poster", src: poster, alt: `Vidéo de présentation ${p.name}`, loading: "lazy", decoding: "async" }),
                el("button", { class: "video-play", type: "button", "aria-label": `Lire la vidéo ${p.name}` }, icon("i-play")),
                el("p", { class: "video-label", text: `${p.name} en mouvement` })));
        }
        slides = $$(".slide", track);
        const isVideo = (s) => s.classList.contains("slide--video");
        slides.forEach((slide, i) => {
            const img = $("img", slide);
            const btn = el("button", { type: "button", class: isVideo(slide) ? "thumb--video" : null, "aria-label": isVideo(slide) ? "Afficher la vidéo" : `Afficher la photo ${i + 1}` },
                el("img", { src: img.getAttribute("src"), alt: "", width: 84, height: 105, loading: "lazy", decoding: "async" }));
            btn.addEventListener("click", () => show(i));
            $("#thumbs").append(el("li", null, btn));
            $("#dots").append(el("span"));
        });
        // Zoom au survol (souris uniquement) et plein écran au toucher
        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        slides.forEach((slide) => {
            if (isVideo(slide)) return;
            const img = $("img", slide);
            slide.addEventListener("mousemove", (e) => {
                if (!finePointer.matches || isMobile()) return;
                const r = slide.getBoundingClientRect();
                img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
                slide.classList.add("is-zooming");
            });
            slide.addEventListener("mouseleave", () => slide.classList.remove("is-zooming"));
            slide.addEventListener("click", () => { if (!finePointer.matches || isMobile()) openLightbox(); });
        });
        $("#stage-track").addEventListener("scroll", () => {
            if (!isMobile()) return;
            const t = $("#stage-track");
            const i = Math.round(t.scrollLeft / t.clientWidth);
            if (i !== active) show(i, true);
        }, { passive: true });
        // Plein écran
        const lbTrack = $("#lightbox-track");
        slides.forEach((slide) => {
            const img = $("img", slide);
            lbTrack.append(el("figure", null, el("img", { src: img.getAttribute("src"), alt: img.alt, loading: "lazy", decoding: "async" })));
        });
        lbTrack.addEventListener("scroll", updateLbCount, { passive: true });
        $("#open-lightbox").addEventListener("click", openLightbox);
        $$("[data-step]", $("#lightbox")).forEach((b) => b.addEventListener("click", () => stepLightbox(Number(b.dataset.step))));
        $("#lightbox").addEventListener("close", () => { $$("video", lbTrack).forEach((v) => v.pause()); show(lbCurrent); });
        document.addEventListener("keydown", (e) => {
            if (!$("#lightbox").open) return;
            if (e.key === "ArrowRight") stepLightbox(1);
            if (e.key === "ArrowLeft") stepLightbox(-1);
        });
        // Une seule photo : miniatures invisibles mais leur colonne reste en place (mise en page inchangée)
        if (slides.length < 2) { $("#thumbs").style.visibility = "hidden"; $("#dots").hidden = true; }
        setupVideo();
        show(0);
    }
    function show(i, fromScroll) {
        active = (i + slides.length) % slides.length;
        slides.forEach((s, k) => {
            s.classList.toggle("is-active", k === active);
            const v = $("video", s);
            if (v && k !== active) { v.pause(); s.classList.remove("is-playing"); }
        });
        $$("#thumbs button").forEach((b, k) => b.setAttribute("aria-current", String(k === active)));
        $$("#dots span").forEach((d, k) => d.classList.toggle("is-active", k === active));
        $("#stage-counter").textContent = `${active + 1} / ${slides.length}`;
        if (isMobile() && !fromScroll) $("#stage-track").scrollTo({ left: slides[active].offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
    }
    function lbIndex() { const t = $("#lightbox-track"); return t.clientWidth ? Math.round(t.scrollLeft / t.clientWidth) : lbCurrent; }
    function updateLbCount() { lbCurrent = lbIndex(); $("#lightbox-count").textContent = `${lbCurrent + 1} / ${slides.length}`; }
    function openLightbox() {
        $("#lightbox").showModal();
        $("#lightbox-track").scrollTo({ left: active * $("#lightbox-track").clientWidth, behavior: "auto" });
        updateLbCount();
    }
    function stepLightbox(step) {
        const i = Math.min(slides.length - 1, Math.max(0, lbIndex() + step));
        $("#lightbox-track").scrollTo({ left: i * $("#lightbox-track").clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    }
    // Vidéo : activée si le fichier existe, sinon « Vidéo bientôt disponible » (jamais d'erreur visible)
    function setupVideo() {
        const slide = $(".slide--video");
        if (!slide) return;
        const src = slide.dataset.video;
        const lbFigure = $("#lightbox-track").children[slides.indexOf(slide)];
        let available = false;
        fetch(src, { method: "HEAD" }).then((r) => { available = r.ok; }).catch(() => {}).finally(() => {
            lbFigure.replaceChildren();
            if (available) {
                lbFigure.append(el("video", { controls: true, playsinline: true, preload: "none", poster: slide.dataset.poster, src }));
            } else {
                $(".video-label", slide).textContent = "Vidéo bientôt disponible";
                lbFigure.append(el("div", { class: "lb-soon" }, el("img", { src: slide.dataset.poster, alt: "" }), el("p", { text: "Vidéo bientôt disponible" })));
            }
        });
        $(".video-play", slide).addEventListener("click", (e) => {
            e.stopPropagation();
            if (!available) { notify("La vidéo de ce modèle sera bientôt disponible."); return; }
            let v = $("video", slide);
            if (!v) {
                v = el("video", { src, poster: slide.dataset.poster, controls: true, playsinline: true, preload: "metadata" });
                slide.prepend(v);
            }
            slide.classList.add("is-playing");
            v.play().catch(() => {});
        });
    }

    // ---------- Identité : badges, nom, accroche, note ----------
    function badgeClass(label) {
        if (/best/i.test(label)) return "badge badge--black";
        if (/premium|limited|édition/i.test(label)) return "badge badge--gold";
        return "badge";
    }
    function renderIdentity(p) {
        const badges = Array.isArray(p.badges) ? p.badges.slice() : [];
        if (p.featured && !badges.some((b) => /best/i.test(b))) badges.unshift("Best Seller");
        if (!badges.some((b) => /premium/i.test(b))) badges.push("Premium");
        badges.forEach((b) => $("#stage-badges").append(el("span", { class: badgeClass(b), text: b })));
        if (hasPromotion(p)) $("#buy-badges").append(el("span", { class: "badge badge--fuchsia", text: p.promotion }));
        $("#buy-badges").append(el("span", { class: "badge", text: "Cheveux humains Remy" }));
        $("#product-title").textContent = p.name;
        $("#crumb-product").textContent = p.name;
        $("#why-name").textContent = p.name;
        $("#faq-name").textContent = p.name;
        const texture = `${p.texture || ""} ${p.name}`;
        $("#crumb-collection").textContent = /curl|boucl/i.test(texture) ? "Perruques bouclées" : /wave|ond/i.test(texture) ? "Perruques ondulées" : /straight|lisse|bob|carr/i.test(texture) ? "Perruques lisses" : "Perruques";
        $("#product-tagline").textContent = p.tagline || "";
        const reviews = Array.isArray(p.reviews) ? p.reviews : [];
        const link = $("#rating-link");
        if (reviews.length) {
            const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
            link.append(el("span", { class: "stars", "aria-hidden": "true", text: "★★★★★".slice(0, Math.round(avg)) + "☆☆☆☆☆".slice(Math.round(avg)) }), el("span", { text: `${avg.toFixed(1).replace(".", ",")} · ${reviews.length} avis` }));
        } else {
            link.append(el("span", { text: "Soyez la première à partager votre avis" }));
        }
        const pills = [p.texture && `Texture ${p.texture}`, Number.isFinite(p.density) && `Densité ${p.density} %`, typeof p.lace === "string" && /transparent/i.test(p.lace) && "Lace transparente"].concat((p.characteristics || []).slice(0, 2)).filter(Boolean);
        [...new Set(pills)].slice(0, 4).forEach((t) => $("#spec-pills").append(el("span", { text: t })));
    }

    // ---------- Longueurs ----------
    function renderLengths(p) {
        if (!p.lengths.length) {
            $("#length-option").hidden = true;
            $("#length-request").hidden = false;
            $("#guide").hidden = true;
            // Modèle à longueur unique (ex. « Coupe courte ») : on le dit au lieu de « sur demande »
            if (p.lengthNote) $("#length-request").firstChild.textContent = `${p.lengthNote} : modèle en longueur unique. `;
            return;
        }
        p.lengths.forEach((len) => {
            const input = el("input", { type: "radio", name: "length", value: len, checked: len === state.length });
            $("#lengths").append(el("label", { class: "choice" }, input, el("span", { class: "choice-box" }, el("b", { text: `${len}″` }), el("small", { text: `${Math.round(len * 2.54)} cm` }))));
        });
        $("#lengths").addEventListener("change", (e) => {
            state.length = Number(e.target.value);
            const forced = forcedLace(p, state.length);
            if (forced) { state.lace = forced; syncLaces(p); }
            update();
        });
        $("#open-size").addEventListener("click", () => $("#size-dialog").showModal());
    }

    // ---------- Dentelles (supplément optionnel via lacePrices) ----------
    function renderLaces(p, laces) {
        if (!laces.length) { $("#lace-option").hidden = true; return; }
        laces.forEach((lace) => {
            const extra = laceExtra(p, lace);
            const desc = (p.laceDescriptions && p.laceDescriptions[lace]) || LACE_TEXT[String(lace).toLowerCase()] || "Dentelle transparente, finition naturelle.";
            const input = el("input", { type: "radio", name: "lace", value: lace, checked: lace === state.lace });
            $("#laces").append(el("label", { class: "choice" }, input, el("span", { class: "choice-box" },
                el("b", { text: String(lace).replace(/x/gi, "×") }), el("em", { text: extra > 0 ? `+ ${euro(extra, p.currency)}` : /^13x/i.test(lace) ? "Frontal · inclus" : "Inclus" }), el("small", { text: desc }))));
        });
        $("#laces").addEventListener("change", (e) => { state.lace = e.target.value; update(); });
        syncLaces(p);
    }
    // Dentelle imposée par la longueur (champ optionnel laceByLength, ex. { "20": "13x4", "24": "4x4" })
    function forcedLace(p, len) {
        const lace = p.laceByLength && len !== null ? p.laceByLength[String(len)] : null;
        return typeof lace === "string" && Array.isArray(p.laceOptions) && p.laceOptions.includes(lace) ? lace : null;
    }
    // Seule la dentelle disponible pour la longueur choisie reste visible
    function syncLaces(p) {
        const forced = forcedLace(p, state.length);
        $$("#laces input").forEach((input) => {
            input.checked = input.value === state.lace;
            input.closest("label").hidden = Boolean(forced) && input.value !== forced;
        });
    }

    // ---------- Description et caractéristiques techniques ----------
    function renderSpecs(p, laces) {
        String(p.description).split(/\n{2,}/).forEach((para) => $("#desc").append(el("p", { text: para.trim() })));
        const minLen = p.lengths.length ? Math.min(...p.lengths) : null;
        const maxLen = p.lengths.length ? Math.max(...p.lengths) : null;
        const rows = [
            ["Cheveux", "100 % humains Remy, cuticules alignées"],
            ["Texture", p.texture || p.name],
            ["Densité", Number.isFinite(p.density) ? `${p.density} %` : "Confirmée avec notre équipe"],
            ["Longueurs", minLen === null ? p.lengthNote || "Sur demande"
                : minLen === maxLen ? `${minLen} pouces (${Math.round(minLen * 2.54)} cm)`
                : `${minLen} à ${maxLen} pouces (${Math.round(minLen * 2.54)} à ${Math.round(maxLen * 2.54)} cm)`],
            ["Dentelle", p.laceByLength && laces.length ? Object.entries(p.laceByLength).map(([len, l]) => `${String(l).replace(/x/gi, "×")} (${len}″)`).join(", ") + (typeof p.lace === "string" && /transparent/i.test(p.lace) ? " — transparente" : "") : laces.length ? laces.map((l) => String(l).replace(/x/gi, "×")).join(", ") + (typeof p.lace === "string" && /transparent/i.test(p.lace) ? " — transparente" : "") : p.lace || "Confirmée avec notre équipe"]
        ];
        // « Couleur : Noir naturel » → ligne « Couleur | Noir naturel » ; sinon ligne « Détail »
        (p.characteristics || []).filter((c) => !/remy|cuticule/i.test(c)).forEach((c) => {
            const m = /^([^:]{2,30}?)\s*:\s*(.+)$/.exec(c);
            rows.push(m ? [m[1], m[2]] : ["Détail", c]);
        });
        rows.forEach(([k, v]) => $("#spec-table").append(el("tr", null, el("th", { text: k }), el("td", { text: v }))));
    }

    // ---------- Pourquoi choisir cette perruque ? ----------
    function renderWhy(p) {
        const items = Array.isArray(p.highlights) && p.highlights.length ? p.highlights : [
            { title: "100 % cheveux humains Remy", text: "Cuticules alignées : douceur, brillance et mouvement naturels." },
            Number.isFinite(p.density) ? { title: `Densité ${p.density} %`, text: "Un volume généreux et naturel, contrôlé avant chaque envoi." } : { title: "Qualité contrôlée", text: "Densité, dentelle et finitions vérifiées avec exigence." },
            { title: "Une naissance naturelle", text: "Choisissez votre dentelle selon la liberté de coiffage souhaitée." },
            { title: "Accompagnée à La Réunion", text: "Conseil personnalisé sur WhatsApp et livraison sur toute l’île." }
        ];
        items.slice(0, 4).forEach((it, i) => $("#why-grid").append(el("article", { class: "why-card" }, icon(ICONS[i % ICONS.length]), el("h3", { text: it.title }), el("p", { text: it.text }))));
    }

    // ---------- Guide des longueurs (silhouette + tableau, page et fenêtre) ----------
    function renderGuide(p) {
        if (!p.lengths.length) return;
        const marks = p.lengths.filter((l) => l >= 8 && l <= 30);
        const svgNS = "http://www.w3.org/2000/svg";
        const build = () => {
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "silhouette");
            svg.setAttribute("viewBox", "0 0 450 360");
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", "Silhouette avec les repères de longueur");
            const head = document.createElementNS(svgNS, "path");
            head.setAttribute("class", "body"); head.setAttribute("d", "M160 40a36 40 0 1 1 72 0c0 22-10 40-36 42-26-2-36-20-36-42Z");
            const torso = document.createElementNS(svgNS, "path");
            torso.setAttribute("class", "body"); torso.setAttribute("d", "M178 80h36l4 22c40 6 62 22 66 50l8 190H100l8-190c4-28 26-44 66-50l4-22Z");
            svg.append(head, torso);
            marks.forEach((len) => {
                const y = Math.min(350, 128 + (len - 10) * 11);
                const g = document.createElementNS(svgNS, "g");
                g.setAttribute("class", "mark"); g.dataset.len = len;
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", "70"); line.setAttribute("x2", "250"); line.setAttribute("y1", y); line.setAttribute("y2", y);
                const text = document.createElementNS(svgNS, "text");
                text.setAttribute("x", "258"); text.setAttribute("y", y + 4);
                text.textContent = `${len}″ · ${GUIDE_MARKS[len] || ""}`;
                g.append(line, text);
                svg.append(g);
            });
            return svg;
        };
        const table = () => {
            const tbody = el("tbody");
            p.lengths.forEach((len) => {
                const price = unitPrice(p, len, state.lace);
                tbody.append(el("tr", { "data-len": len }, el("td", null, `${len}″ `, el("small", { style: "color:var(--muted);font-family:var(--sans);font-size:12px", text: `${Math.round(len * 2.54)} cm` })), el("td", { text: GUIDE_MARKS[len] || "—" }), el("td", { text: price === null ? "Sur demande" : euro(price, p.currency) })));
            });
            return [el("table", { class: "guide-table" }, el("thead", null, el("tr", null, el("th", { text: "Longueur" }), el("th", { text: "Repère" }), el("th", { text: "Prix" }))), tbody),
                el("p", { class: "guide-note", text: "Repères indicatifs : la longueur réelle varie selon la taille et la texture (les boucles et ondulations raccourcissent visuellement la longueur)." })];
        };
        $("#guide-figure").append(build());
        $("#guide-table-wrap").append(...table());
        $("#dialog-figure").append(build());
        $("#dialog-table-wrap").append(...table());
    }

    // ---------- Conseils d'entretien ----------
    function renderCare(p) {
        const curly = /curl|boucl|wave|ond/i.test(`${p.texture} ${p.name}`);
        const steps = Array.isArray(p.care) && p.care.length ? p.care : [
            { title: "Démêler", text: "Des pointes vers les racines, avec les doigts ou un peigne à dents larges, jamais à sec." },
            { title: "Laver", text: "Shampoing doux et soin hydratant adaptés aux cheveux humains, sans frotter." },
            { title: "Sécher", text: curly ? "À l’air libre, sur un support, pour garder un mouvement défini et éviter les frisottis." : "À l’air libre ou au séchoir à température douce, avec un protecteur thermique." },
            { title: "Ranger", text: "Sur une tête de mannequin ou dans un sac en satin, à l’abri de la chaleur." }
        ];
        steps.slice(0, 4).forEach((s) => $("#care-steps").append(el("div", { class: "care-step" }, el("h3", { text: s.title }), el("p", { text: s.text }))));
    }

    // ---------- Avis : uniquement de vrais avis fournis dans les données ----------
    function renderReviews(p) {
        const reviews = Array.isArray(p.reviews) ? p.reviews.filter((r) => r && r.text) : [];
        const list = $("#review-list");
        if (!reviews.length) {
            $("#score").append(el("p", { style: "color:var(--muted);margin-top:18px", text: "Les avis sont publiés après chaque commande confirmée." }));
            list.append(el("div", { class: "reviews-empty" },
                el("strong", { text: "Soyez la première à partager votre avis" }),
                el("p", { text: `Vous portez déjà la ${p.name} ? Votre expérience aidera d’autres femmes à trouver leur signature.` }),
                el("a", { class: "btn btn--whatsapp", href: waUrl(`Bonjour, je souhaite partager mon avis sur la perruque ${p.name}.`), target: "_blank", rel: "noopener noreferrer" }, icon("i-wa"), " Partager mon avis")));
            return;
        }
        const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
        $("#score").append(el("p", { class: "score-value", style: "margin-top:26px", text: avg.toFixed(1).replace(".", ",") }),
            el("div", { class: "stars", "aria-label": `Note moyenne : ${avg.toFixed(1)} sur 5`, text: "★★★★★" }));
        const bars = el("div", { class: "bars", "aria-hidden": "true" });
        [5, 4, 3, 2, 1].forEach((n) => {
            const pct = Math.round(reviews.filter((r) => Math.round(r.rating) === n).length / reviews.length * 100);
            bars.append(el("div", null, `${n}★`, el("i", { style: `--w:${pct}%` })));
        });
        $("#score").append(bars);
        reviews.forEach((r) => {
            const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
            list.append(el("article", { class: "review" },
                el("div", { class: "review-top" }, el("span", { class: "stars", "aria-label": `${rating} sur 5`, text: "★".repeat(rating) + "☆".repeat(5 - rating) }), el("span", { class: "verified" }, icon("i-check"), "Cliente vérifiée")),
                el("blockquote", { text: `« ${r.text} »` }),
                el("footer", { text: [r.name, r.variant].filter(Boolean).join(" — ") })));
        });
    }

    // ---------- FAQ (questions communes + questions propres au produit) ----------
    function renderFaq(p, laces) {
        const sameLacePrice = !p.lacePrices || Object.values(p.lacePrices).every((v) => !v);
        const items = [
            laces.length > 1 && !p.laceByLength && { q: "Quelle dentelle choisir ?", a: `La 4×4 offre une raie centrale et une pose facile ; la 5×5 laisse la raie plus libre ; le frontal 13×4 couvre d’une oreille à l’autre pour une ligne frontale totalement naturelle.${sameLacePrice ? " Toutes les dentelles sont au même prix." : ""}` },
            p.lengths.length ? { q: "Comment choisir ma longueur ?", a: "Consultez le guide des longueurs : 10–14″ pour un carré, 16–20″ pour une longueur épaules à poitrine, 22–26″ pour une longueur spectaculaire." } : p.lengthNote ? { q: "Quelle est la longueur de cette perruque ?", a: `${p.lengthNote} : ce modèle est proposé en une seule longueur, prête à porter. Notre équipe vous conseille sur WhatsApp si besoin.` } : { q: "Quelles longueurs sont disponibles ?", a: "Les longueurs de ce modèle sont confirmées sur demande : écrivez-nous sur WhatsApp, nous vous conseillons la longueur idéale." },
            { q: "Les cheveux sont-ils 100 % naturels ?", a: "Oui : cheveux humains Remy aux cuticules alignées, pour un toucher doux et un rendu naturel." },
            { q: "Peut-on la coiffer à la chaleur ?", a: "Les cheveux humains se coiffent à la chaleur : appliquez un protecteur thermique et commencez à température modérée." },
            { q: "Quels sont les modes de livraison ?", a: "Partout à La Réunion : Colissimo suivi (10 €), Point Relais (5 €) ou retrait à Saint-Pierre le samedi matin sur rendez-vous (5 €). Le délai vous est confirmé avec votre commande." },
            { q: "Comment se passe le paiement ?", a: "Votre commande et son montant sont d’abord confirmés avec notre équipe ; la demande de paiement vous est ensuite transmise. Aucun paiement n’est prélevé sans votre accord." }
        ].filter(Boolean).concat(Array.isArray(p.faq) ? p.faq.filter((f) => f && f.q && f.a) : []);
        items.forEach((f, i) => $("#faq-list").append(el("details", { open: i === 0 }, el("summary", { text: f.q.replace(/ \?$/, " ?") }), el("p", { text: f.a }))));
    }

    // ---------- Produits similaires (lus depuis leurs propres fiches) ----------
    function renderSimilar(p) {
        const ids = (p.similarProducts || []).filter((x) => x !== p.id).slice(0, 3);
        if (!ids.length) { $("#similaires").hidden = true; return; }
        Promise.all(ids.map((sid) => api.fetchProduct(sid).catch(() => null))).then((list) => {
            const found = list.filter(Boolean);
            if (!found.length) { $("#similaires").hidden = true; return; }
            found.forEach((s) => {
                const from = minPrice(s);
                $("#similar-grid").append(el("a", { class: "similar-card", href: `fiche-produit.html?id=${encodeURIComponent(s.id)}` },
                    el("div", { class: "media" }, el("img", { src: photoSrc(s.photos[0]), alt: "", loading: "lazy", decoding: "async" })),
                    el("h3", { text: s.name }),
                    el("p", { text: Number.isFinite(from) ? `À partir de ${euro(from, s.currency)}` : "Prix sur demande" })));
            });
        });
    }

    // ---------- Achat : quantité, panier (vrai panier du site), WhatsApp ----------
    function bindPurchase() {
        $("#qty-minus").addEventListener("click", () => { state.qty = Math.max(1, state.qty - 1); update(); });
        $("#qty-plus").addEventListener("click", () => { state.qty = Math.min(maxQty(), state.qty + 1); update(); });
        $("#add-to-cart").addEventListener("click", addToCart);
        $("#mb-add").addEventListener("click", addToCart);
    }
    function addToCart() {
        const p = state.product;
        const cart = window.IARINTSOACart;
        const price = unitPrice(p, state.length, state.lace);
        if (!cart) { notify("Le panier n’est pas disponible pour le moment."); return; }
        try {
            const exactLength = state.length !== null && lengthPrice(p, state.length) !== null;
            for (let i = 0; i < state.qty; i++) {
                cart.addItem({ id: p.id, name: p.name, length: state.length, lace: state.lace, image: photoSrc(p.photos[0]), price, priceIsEstimate: !exactLength && Boolean(p.priceLabel) && price !== null, currency: p.currency || "EUR", stock: p.stock });
            }
            notify(`${p.name}${state.length ? ` ${state.length}″` : ""}${state.lace ? ` · ${laceLabel(state.lace)}` : ""} ajoutée au panier.`);
        } catch (error) {
            notify(error.code === "cart-unreadable" ? "Votre panier enregistré n’a pas pu être lu : ouvrez le panier pour le réinitialiser." : error.message);
        }
    }

    // ---------- Mise à jour de toute la sélection ----------
    function update() {
        const p = state.product;
        const unit = unitPrice(p, state.length, state.lace);
        const total = unit === null ? null : unit * state.qty;
        const lace = state.lace ? laceLabel(state.lace) : null;
        const exactLength = state.length !== null && lengthPrice(p, state.length) !== null;
        const priceEl = $("#price");
        if (!reduceMotion) { priceEl.classList.add("is-updating"); setTimeout(() => priceEl.classList.remove("is-updating"), 180); }
        priceEl.textContent = total === null ? "Prix sur demande" : `${!exactLength && p.priceLabel ? `${p.priceLabel} ` : ""}${euro(total, p.currency)}`;
        const oldPrice = $("#price-old");
        oldPrice.hidden = !(hasPromotion(p) && !exactLength);
        oldPrice.textContent = oldPrice.hidden ? "" : euro(p.price * state.qty, p.currency);
        const extra = state.lace ? laceExtra(p, state.lace) : 0;
        $("#price-caption").textContent = total === null ? "Confirmé avec notre équipe" : [
            state.qty > 1 ? `${state.qty} × ${euro(unit, p.currency)}` : null,
            state.length !== null ? `pour ${state.length} pouces` : p.lengthNote ? p.lengthNote.toLowerCase() : "prix de départ",
            lace ? (extra > 0 ? `dentelle ${lace} (+ ${euro(extra, p.currency)})` : "dentelle incluse") : null
        ].filter(Boolean).join(" · ");
        const min = minPrice(p);
        $("#tax-note").textContent = p.pricesByLength && Object.keys(p.pricesByLength).length
            ? `De ${euro(Math.min(...Object.values(p.pricesByLength)), p.currency)} à ${euro(Math.max(...Object.values(p.pricesByLength)), p.currency)} selon la longueur. Le montant final est confirmé avec vous avant tout paiement.`
            : Number.isFinite(min) ? "Le montant final est confirmé avec vous avant tout paiement." : "Le prix de ce modèle vous est communiqué sur WhatsApp.";
        if (state.length !== null) $("#length-output").textContent = `${state.length} pouces · ${Math.round(state.length * 2.54)} cm`;
        if (lace) $("#lace-output").textContent = lace;
        $$("[data-price-short]").forEach((e) => { e.textContent = total === null ? "sur demande" : `${Math.round(total)} €`; });
        $$("[data-price-full]").forEach((e) => { e.textContent = total === null ? "Prix sur demande" : euro(total, p.currency); });
        $$("[data-selection]").forEach((e) => { e.textContent = [state.length !== null ? `${state.length}″` : null, lace, state.qty > 1 ? `×${state.qty}` : null].filter(Boolean).join(" · ") || p.name; });
        $("#qty").textContent = String(state.qty);
        $("#qty-minus").disabled = state.qty <= 1;
        $("#qty-plus").disabled = state.qty >= maxQty();
        $$(".mark").forEach((m) => m.classList.toggle("is-active", Number(m.dataset.len) === state.length));
        $$(".guide-table tr[data-len]").forEach((r) => r.classList.toggle("is-active", Number(r.dataset.len) === state.length));
        // Disponibilité
        const av = $("#availability");
        const add = $("#add-to-cart");
        if (p.stock === 0) { av.dataset.state = "out"; av.textContent = "Rupture de stock — écrivez-nous pour le prochain arrivage"; }
        else if (Number.isInteger(p.stock) && p.stock <= 3) { av.dataset.state = "low"; av.textContent = `Plus que ${p.stock} en stock`; }
        else if (Number.isInteger(p.stock) || p.available === true) { av.dataset.state = "in"; av.textContent = "En stock — expédition après confirmation"; }
        else { av.dataset.state = "ask"; av.textContent = "Disponibilité confirmée avec vous avant validation"; }
        add.disabled = p.stock === 0;
        $("#mb-add").disabled = p.stock === 0;
        // WhatsApp : toujours la sélection en cours
        const message = [
            `Bonjour, je souhaite commander la perruque ${p.name}`,
            `— Longueur : ${state.length !== null ? `${state.length} pouces (${Math.round(state.length * 2.54)} cm)` : p.lengthNote || "à préciser"}`,
            lace ? `— Dentelle : ${lace}` : null,
            `— Quantité : ${state.qty}`,
            `— Prix : ${total === null ? "à confirmer" : euro(total, p.currency)}`,
            "Livraison à La Réunion. Pouvez-vous me confirmer la disponibilité ?"
        ].filter(Boolean).join("\n");
        $$("[data-wa-link]").forEach((a) => { a.href = waUrl(message); });
    }

    // ---------- Fenêtres (guide, plein écran) ----------
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
    $("#size-dialog").addEventListener("click", (e) => { if (e.target === $("#size-dialog")) $("#size-dialog").close(); });

    // ---------- Recherche (catalogue lu depuis data/products) ----------
    let catalog = null;
    const searchPanel = $("#search-panel"), searchInput = $("#search-input"), searchResults = $("#search-results"), searchOpener = $("[data-search-open]");
    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    function loadCatalog() {
        if (catalog) return Promise.resolve(catalog);
        return api.fetchCatalog().then((ids) => Promise.all(ids.map((cid) => api.fetchProduct(cid).catch(() => null)))).then((list) => {
            catalog = list.filter(Boolean).map((s) => ({ name: s.name, tags: `${s.texture || ""} ${s.tagline || ""}`, price: Number.isFinite(minPrice(s)) ? `Dès ${euro(minPrice(s), s.currency)}` : "Sur demande", href: `fiche-produit.html?id=${encodeURIComponent(s.id)}` }));
            catalog.push({ name: "Tissages", tags: "tissage paquet 100 g bundle meche", price: "Dès 25 €", href: "tissages.html" });
            return catalog;
        });
    }
    function renderSearch() {
        const query = normalize(searchInput.value.trim());
        searchResults.replaceChildren();
        if (!catalog) { searchResults.append(el("li", { class: "label", text: "Chargement…" })); return; }
        const found = catalog.filter((s) => !query || normalize(`${s.name} ${s.tags}`).includes(query));
        searchResults.append(el("li", { class: "label", text: query ? `${found.length} résultat${found.length > 1 ? "s" : ""}` : "Notre collection" }));
        found.forEach((s) => searchResults.append(el("li", null, el("a", { href: s.href }, s.name, el("small", { text: s.price })))));
        if (!found.length) searchResults.append(el("li", { class: "search-empty", text: "Aucun modèle trouvé. Notre équipe peut vous conseiller sur WhatsApp." }));
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

    // ---------- Barre d'achat mobile + bouton WhatsApp flottant ----------
    let barVisible = false, barTicking = false;
    function updateBar() {
        barTicking = false;
        if (!state.product) return;
        const visible = $("#purchase").getBoundingClientRect().bottom < 0;
        if (visible === barVisible) return;
        barVisible = visible;
        const bar = $("#mobile-bar");
        bar.classList.toggle("is-visible", visible);
        bar.setAttribute("aria-hidden", String(!visible));
        $$("a, button", bar).forEach((x) => { x.tabIndex = visible ? 0 : -1; });
        $("#float-wa").classList.toggle("is-tucked", visible && isMobile());
    }
    window.addEventListener("scroll", () => { if (!barTicking) { barTicking = true; requestAnimationFrame(updateBar); } }, { passive: true });

    // ---------- Apparitions douces ----------
    function startReveal() {
        const reveals = $$(".reveal");
        if ("IntersectionObserver" in window && !reduceMotion) {
            const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
            reveals.forEach((x) => io.observe(x));
        } else reveals.forEach((x) => x.classList.add("is-in"));
    }
})();
