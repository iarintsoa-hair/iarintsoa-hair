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

    async function fetchProduct(id) {
        if (!isProductId(id)) {
            throw new Error("Identifiant produit invalide.");
        }

        const response = await fetch(`data/products/${id}.json`, { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`Le fichier data/products/${id}.json est introuvable (${response.status}).`);
        }

        return validateProductDocument(await response.json(), id);
    }

    async function fetchCatalog() {
        const response = await fetch("data/products/index.json", { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`Le catalogue data/products/index.json est introuvable (${response.status}).`);
        }

        return validateCatalogDocument(await response.json()).products;
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
