(function (global) {
    "use strict";

    const productIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    function validateProductDocument(documentData, expectedId) {
        if (!documentData || typeof documentData !== "object"
            || documentData.format !== "iarintsoa-product" || documentData.version !== 1) {
            throw new Error("Format JSON produit non reconnu.");
        }

        const product = documentData.product;
        if (!product || typeof product !== "object" || product.id !== expectedId || !productIdPattern.test(product.id)
            || typeof product.name !== "string" || !product.name.trim()) {
            throw new Error(`Données produit invalides pour « ${expectedId} ».`);
        }
        if (typeof product.description !== "string" || product.price === undefined || product.stock === undefined
            || product.lace === undefined || product.density === undefined) {
            throw new Error(`Des champs obligatoires sont absents du produit « ${expectedId} ».`);
        }
        if (!Array.isArray(product.photos) || product.photos.length === 0) {
            throw new Error(`Ajoutez au moins une photo au produit « ${expectedId} ».`);
        }

        product.photos.forEach((photo) => {
            const src = typeof photo === "string" ? photo : photo && (photo.src || photo.dataUrl || photo.path);
            if (typeof src !== "string" || !src.trim()) {
                throw new Error(`Une photo du produit « ${expectedId} » n’a pas de chemin valide.`);
            }
        });

        if (!Array.isArray(product.lengths) || !product.lengths.every((length) => Number.isFinite(length) && length > 0)
            || new Set(product.lengths).size !== product.lengths.length) {
            throw new Error(`La liste des longueurs est invalide pour le produit « ${expectedId} ».`);
        }
        if (product.pricesByLength !== undefined) {
            if (!product.pricesByLength || typeof product.pricesByLength !== "object" || Array.isArray(product.pricesByLength)) {
                throw new Error(`Les tarifs par longueur du produit « ${expectedId} » sont invalides.`);
            }
            const availableLengths = new Set(product.lengths.map(String));
            Object.entries(product.pricesByLength).forEach(([length, price]) => {
                if (!availableLengths.has(length) || !Number.isFinite(price) || price < 0) {
                    throw new Error(`Le tarif de ${length} pouces du produit « ${expectedId} » est invalide.`);
                }
            });
        }
        if (product.laceOptions !== undefined
            && (!Array.isArray(product.laceOptions)
                || !product.laceOptions.every((lace) => typeof lace === "string" && lace.trim())
                || new Set(product.laceOptions).size !== product.laceOptions.length)) {
            throw new Error(`Les options de lace du produit « ${expectedId} » sont invalides.`);
        }
        if (!Array.isArray(product.characteristics) || !product.characteristics.every((item) => typeof item === "string")) {
            throw new Error(`Les caractéristiques du produit « ${expectedId} » doivent être une liste de textes.`);
        }
        if (!Array.isArray(product.similarProducts) || !product.similarProducts.every((similarId) => typeof similarId === "string" && productIdPattern.test(similarId))) {
            throw new Error(`La liste des produits similaires est invalide pour le produit « ${expectedId} ».`);
        }
        if (product.price !== null && (!Number.isFinite(product.price) || product.price < 0)) {
            throw new Error(`Le prix du produit « ${expectedId} » est invalide.`);
        }
        if (product.stock !== null && (!Number.isInteger(product.stock) || product.stock < 0)) {
            throw new Error(`Le stock du produit « ${expectedId} » doit être un entier positif ou null.`);
        }
        if (product.lace !== null && typeof product.lace !== "string") {
            throw new Error(`La valeur lace du produit « ${expectedId} » est invalide.`);
        }
        if (product.density !== null && (!Number.isFinite(product.density) || product.density < 0)) {
            throw new Error(`La densité du produit « ${expectedId} » est invalide.`);
        }
        if (product.currency !== undefined && (typeof product.currency !== "string" || !/^[A-Z]{3}$/.test(product.currency))) {
            throw new Error(`La devise du produit « ${expectedId} » est invalide.`);
        }
        if (product.featured !== undefined && typeof product.featured !== "boolean") {
            throw new Error(`La mise en vedette du produit « ${expectedId} » doit être un booléen.`);
        }
        if (product.promotionPrice !== undefined && product.promotionPrice !== null
            && (!Number.isFinite(product.promotionPrice) || product.promotionPrice < 0
                || product.price === null || product.promotionPrice >= product.price)) {
            throw new Error(`Le prix promotionnel du produit « ${expectedId} » doit être inférieur au prix normal.`);
        }
        if (product.promotion !== undefined && product.promotion !== null && typeof product.promotion !== "string") {
            throw new Error(`La promotion du produit « ${expectedId} » doit être un texte ou null.`);
        }

        return product;
    }

    function validateCatalogDocument(catalog) {
        if (!catalog || typeof catalog !== "object"
            || catalog.format !== "iarintsoa-product-catalog" || catalog.version !== 1 || !Array.isArray(catalog.products)) {
            throw new Error("Format JSON non reconnu dans data/products/index.json.");
        }
        if (!catalog.products.every((id) => typeof id === "string" && productIdPattern.test(id))
            || new Set(catalog.products).size !== catalog.products.length) {
            throw new Error("Le catalogue contient un identifiant produit invalide ou dupliqué.");
        }
        return catalog;
    }

    // ------------------------------------------------------------------
    // Catalogue unique : data/catalogue.json, modifié par l'administration (/admin, Decap CMS).
    // Chaque perruque y est convertie vers le format attendu par les pages, puis vérifiée
    // par validateProductDocument (mêmes règles qu'avant). Une fiche invalide est écartée
    // sans casser la boutique ; une fiche « masquée » n'apparaît nulle part.
    // ------------------------------------------------------------------
    const CATALOGUE_URL = "data/catalogue.json";
    let cataloguePromise = null;

    function slugify(text) {
        return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    // Photos téléversées depuis l'administration : redimensionnées à la volée par Netlify une fois en ligne
    const onlineSite = typeof location !== "undefined" && location.protocol === "https:"
        && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    function optimizedPhoto(src) {
        return onlineSite && /^\/?image\/produits\/ajouts\//.test(src)
            ? `/.netlify/images?url=/${encodeURI(src.replace(/^\//, ""))}&w=1200&q=78`
            : src;
    }

    function toNumber(value) {
        const n = typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : value;
        return Number.isFinite(n) ? n : null;
    }

    function normalizeItem(item) {
        const id = productIdPattern.test(item.id || "") ? item.id : slugify(item.name);
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const lengths = [...new Set(variants.map((v) => toNumber(v && v.length)).filter((l) => l !== null && l > 0))].sort((a, b) => a - b);
        const pricesByLength = {};
        variants.forEach((v) => {
            const length = toNumber(v && v.length), price = toNumber(v && v.price);
            if (length !== null && lengths.includes(length) && price !== null && price >= 0) pricesByLength[String(length)] = price;
        });
        const lengthPrices = Object.values(pricesByLength);
        const basePrice = toNumber(item.price);
        const price = basePrice !== null ? basePrice : lengthPrices.length ? Math.min(...lengthPrices) : null;
        const promoPrice = toNumber(item.promotionPrice);
        const promoValid = Boolean(item.promotion) && promoPrice !== null && price !== null && promoPrice < price;
        const laceDescriptions = {};
        (Array.isArray(item.laceInfo) ? item.laceInfo : []).forEach((x) => { if (x && x.lace && x.text) laceDescriptions[x.lace] = x.text; });
        const product = {
            id,
            name: String(item.name || "").trim(),
            tagline: item.tagline || "",
            price,
            currency: "EUR",
            priceLabel: null,
            promotion: promoValid ? item.promotion : null,
            promotionPrice: promoValid ? promoPrice : null,
            texture: item.texture || "",
            description: String(item.description || ""),
            photos: (Array.isArray(item.photos) ? item.photos : [])
                .map((ph) => (typeof ph === "string" ? { src: ph, alt: "" } : ph))
                .filter((ph) => ph && typeof ph.src === "string" && ph.src.trim())
                .map((ph) => ({ src: optimizedPhoto(ph.src.trim()), alt: ph.alt || "" })),
            lengths,
            lace: item.lace || null,
            laceOptions: (Array.isArray(item.laceOptions) ? item.laceOptions : []).filter((l) => typeof l === "string" && l.trim()),
            density: toNumber(item.density),
            stock: item.availability === "epuise" ? 0 : null,
            available: item.availability === "en-stock",
            badges: (Array.isArray(item.badges) ? item.badges : []).filter(Boolean),
            characteristics: (Array.isArray(item.characteristics) ? item.characteristics : []).filter((c) => typeof c === "string" && c.trim()),
            similarProducts: (Array.isArray(item.similarProducts) ? item.similarProducts : []).filter((s) => typeof s === "string" && productIdPattern.test(s)),
            featured: false
        };
        if (lengthPrices.length) product.pricesByLength = pricesByLength;
        const defaultLength = toNumber(item.defaultLength);
        if (defaultLength !== null && lengths.includes(defaultLength)) product.defaultLength = defaultLength;
        if (item.lengthNote) product.lengthNote = item.lengthNote;
        if (Object.keys(laceDescriptions).length) product.laceDescriptions = laceDescriptions;
        if (Array.isArray(item.highlights) && item.highlights.length) product.highlights = item.highlights.filter((h) => h && h.title && h.text);
        if (Array.isArray(item.faq) && item.faq.length) product.faq = item.faq.filter((f) => f && f.q && f.a);
        product.laceOptions = [...new Set(product.laceOptions)];
        return validateProductDocument({ format: "iarintsoa-product", version: 1, product }, id);
    }

    function loadCatalogue() {
        if (!cataloguePromise) {
            cataloguePromise = fetch(CATALOGUE_URL, { cache: "no-cache" }).then((response) => {
                if (!response.ok) throw new Error(`Le catalogue ${CATALOGUE_URL} est introuvable (${response.status}).`);
                return response.json();
            }).then((doc) => {
                const items = doc && Array.isArray(doc.products) ? doc.products : [];
                const products = new Map();
                items.forEach((item, index) => {
                    if (!item || item.hidden === true) return;
                    try {
                        const product = normalizeItem(item);
                        if (products.has(product.id)) throw new Error(`identifiant « ${product.id} » déjà utilisé`);
                        products.set(product.id, product);
                    } catch (error) {
                        if (global.console) global.console.warn(`Perruque n° ${index + 1} (${item.name || "sans nom"}) ignorée : ${error.message}`);
                    }
                });
                return products;
            });
            cataloguePromise.catch(() => { cataloguePromise = null; });
        }
        return cataloguePromise;
    }

    async function fetchProduct(id) {
        if (!isProductId(id)) {
            throw new Error("Identifiant produit invalide.");
        }
        const product = (await loadCatalogue()).get(id);
        if (!product) {
            throw new Error(`Le modèle « ${id} » est introuvable.`);
        }
        return JSON.parse(JSON.stringify(product));
    }

    async function fetchCatalog() {
        return Array.from((await loadCatalogue()).keys());
    }

    function isProductId(id) {
        return typeof id === "string" && productIdPattern.test(id);
    }

    global.IARINTSOAProductData = Object.freeze({
        fetchProduct,
        fetchCatalog,
        isProductId,
        validateCatalogDocument,
        validateProductDocument
    });
})(window);
