(function (global) {
    "use strict";

    const storageKey = "iarintsoa-hair.cart.v1";
    const deliveryStorageKey = "iarintsoa-hair.delivery.v1";
    const productIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const deliveryMethods = Object.freeze([
        { id: "colissimo", label: "Colissimo La Poste", price: 10, details: "Livraison suivie partout à La Réunion." },
        { id: "relay", label: "Point Relais", price: 5, details: "Selon les points relais disponibles sur l’île." },
        { id: "pickup", label: "Retrait à Saint-Pierre", price: 5, details: "Samedi matin uniquement, sur rendez-vous après confirmation." }
    ]);

    function validateItems(items) {
        if (!Array.isArray(items)) {
            throw new Error("Le panier enregistré n’a pas un format valide.");
        }

        items.forEach((item) => {
            if (!item || typeof item !== "object"
                || typeof item.lineId !== "string"
                || typeof item.productId !== "string" || !productIdPattern.test(item.productId)
                || typeof item.name !== "string" || !item.name.trim()
                || (item.length !== null && (typeof item.length !== "string" || !item.length))
                || (item.lace !== null && typeof item.lace !== "string")
                || (item.image !== null && typeof item.image !== "string")
                || (item.price !== null && (!Number.isFinite(item.price) || item.price < 0))
                || (item.priceIsEstimate !== undefined && typeof item.priceIsEstimate !== "boolean")
                || typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)
                || !Number.isInteger(item.quantity) || item.quantity < 1
                || (item.maxQuantity !== null
                    && (!Number.isInteger(item.maxQuantity) || item.maxQuantity < 1))) {
                throw new Error("Un article du panier enregistré est invalide.");
            }
        });

        return items;
    }

    function getItems() {
        let stored;
        try {
            stored = global.localStorage.getItem(storageKey);
        } catch (error) {
            throw new Error("Le stockage local est inaccessible dans ce navigateur.");
        }
        if (stored === null) return [];

        try {
            return validateItems(JSON.parse(stored));
        } catch (error) {
            const readError = new Error(`Impossible de lire le panier enregistré : ${error.message}`);
            readError.code = "cart-unreadable";
            throw readError;
        }
    }

    function clearItems() {
        try {
            global.localStorage.removeItem(storageKey);
        } catch (error) {
            throw new Error("Impossible de vider le panier dans ce navigateur.");
        }
        global.dispatchEvent(new CustomEvent("iarintsoa-cart-updated"));
    }

    function saveItems(items) {
        validateItems(items);
        try {
            global.localStorage.setItem(storageKey, JSON.stringify(items));
        } catch (error) {
            throw new Error("Impossible d’enregistrer le panier dans ce navigateur.");
        }
        global.dispatchEvent(new CustomEvent("iarintsoa-cart-updated"));
        return items;
    }

    async function refreshMissingPrices() {
        const items = getItems();
        const missingProductIds = Array.from(new Set(
            items.filter((item) => item.price === null).map((item) => item.productId)
        ));
        if (missingProductIds.length === 0) return items;
        if (!global.IARINTSOAProductData) {
            throw new Error("Le catalogue des produits n’est pas chargé ; les prix du panier n’ont pas pu être actualisés.");
        }

        const products = await Promise.all(missingProductIds.map((id) =>
            global.IARINTSOAProductData.fetchProduct(id)
        ));
        const productsById = new Map(products.map((product) => [product.id, product]));
        const currentItems = getItems();
        let changed = false;

        currentItems.forEach((item) => {
            if (item.price !== null) return;
            const product = productsById.get(item.productId);
            if (!product) return;

            const lengthPrice = item.length && product.pricesByLength
                ? product.pricesByLength[item.length]
                : null;
            const hasExactLengthPrice = Number.isFinite(lengthPrice) && lengthPrice >= 0;
            const hasPromotion = product.promotion
                && Number.isFinite(product.promotionPrice)
                && product.price !== null
                && product.promotionPrice < product.price;
            const price = hasExactLengthPrice
                ? lengthPrice
                : hasPromotion ? product.promotionPrice : product.price;
            if (!Number.isFinite(price) || price < 0) return;

            item.price = price;
            item.priceIsEstimate = !hasExactLengthPrice && Boolean(product.priceLabel);
            changed = true;
        });

        return changed ? saveItems(currentItems) : currentItems;
    }

    function addItem(product) {
        if (!product || !productIdPattern.test(product.id)
            || typeof product.name !== "string" || !product.name.trim()
            || (product.length !== null && (!Number.isFinite(product.length) || product.length < 1))
            || (product.lace !== null && typeof product.lace !== "string")
            || (product.price !== null && (!Number.isFinite(product.price) || product.price < 0))
            || (product.priceIsEstimate !== undefined && typeof product.priceIsEstimate !== "boolean")
            || (product.stock !== null && (!Number.isInteger(product.stock) || product.stock < 1))) {
            throw new Error("La sélection du produit ne peut pas être ajoutée au panier.");
        }

        const items = getItems();
        const lineId = [product.id, product.length === null ? "à-confirmer" : product.length, product.lace || ""].join("|");
        const existingItem = items.find((item) => item.lineId === lineId);
        if (existingItem) {
            if (existingItem.maxQuantity !== null && existingItem.quantity >= existingItem.maxQuantity) {
                throw new Error(`La quantité maximale disponible pour ${product.name} est déjà dans votre panier.`);
            }
            existingItem.quantity += 1;
           existingItem.price =
    product.length &&
    product.pricesByLength &&
    product.pricesByLength[String(product.length)]
        ? product.pricesByLength[String(product.length)]
        : product.price;
            existingItem.priceIsEstimate = product.priceIsEstimate === true;
            existingItem.maxQuantity = product.stock;
        } else {
            items.push({
                lineId,
                productId: product.id,
                name: product.name.trim(),
                length: product.length === null ? null : String(product.length),
                lace: product.lace || null,
                image: product.image || null,
               price:
    product.length &&
    product.pricesByLength &&
    product.pricesByLength[String(product.length)]
        ? product.pricesByLength[String(product.length)]
        : product.price,
                priceIsEstimate: product.priceIsEstimate === true,
                currency: product.currency || "EUR",
                quantity: 1,
                maxQuantity: product.stock
            });
        }
        saveItems(items);
        return { items, lineId };
    }

    function  updateQuantity(lineId, quantity) {
    if (typeof lineId !== "string" || !Number.isInteger(quantity) || quantity < 1) {
        throw new Error("La quantité doit être un nombre entier positif.");
    }

    const items = getItems();

    const item = items.find((entry) => entry.lineId === lineId);

    if (!item) {
        throw new Error("Cet article n'est plus présent");
    }

    if (item.maxQuantity != null && quantity > item.maxQuantity) {
        throw new Error("La quantité maximale disponible est atteinte");
    }

    item.quantity = quantity;

    saveItems(items);

    return items;

}

    function removeItem(lineId) {
        if (typeof lineId !== "string") throw new Error("L’article à supprimer est invalide.");
        const items = getItems();
        const remainingItems = items.filter((item) => item.lineId !== lineId);
        if (remainingItems.length === items.length) {
            throw new Error("Cet article n’est plus présent dans le panier.");
        }
        return saveItems(remainingItems);
    }

    function formatPrice(price, currency) {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: currency || "EUR"
        }).format(price);
    }

    function getDeliveryMethod() {
        let stored;
        try {
            stored = global.localStorage.getItem(deliveryStorageKey);
        } catch (error) {
            throw new Error("Le mode de livraison enregistré est inaccessible dans ce navigateur.");
        }
        if (stored === null) return null;

        let deliveryId;
        try {
            deliveryId = JSON.parse(stored);
        } catch (error) {
            throw new Error("Le mode de livraison enregistré est illisible.");
        }
        const method = deliveryMethods.find((option) => option.id === deliveryId);
        if (!method) throw new Error("Le mode de livraison enregistré n’est pas reconnu.");
        return method;
    }

    function saveDeliveryMethod(deliveryId) {
        if (deliveryId !== null && !deliveryMethods.some((method) => method.id === deliveryId)) {
            throw new Error("Veuillez choisir un mode de livraison valide.");
        }
        try {
            if (deliveryId === null) global.localStorage.removeItem(deliveryStorageKey);
            else global.localStorage.setItem(deliveryStorageKey, JSON.stringify(deliveryId));
        } catch (error) {
            throw new Error("Impossible d’enregistrer votre mode de livraison dans ce navigateur.");
        }
    }

    function refreshCartBadges() {
        let count = 0;
        let storageError = false;
        try {
            count = getItems().reduce((total, item) => total + item.quantity, 0);
        } catch (error) {
            storageError = true;
        }

        document.querySelectorAll("[data-cart-count]").forEach((badge) => {
            badge.hidden = count === 0 && !storageError;
            badge.textContent = storageError ? "!" : String(count);
        });
        document.querySelectorAll("[data-cart-link]").forEach((link) => {
            link.setAttribute("aria-label", storageError
                ? "Ouvrir le panier : une erreur de stockage a été détectée"
                : `Ouvrir le panier, ${count} article${count === 1 ? "" : "s"}`);
        });
    }

    function createWhatsAppUrl(message) {
        return `https://wa.me/262693600145?text=${encodeURIComponent(message)}`;
    }

    function mountCartPage() {
        const cartList = document.querySelector("#cart-items");
        if (!cartList) return;

        const emptyState = document.querySelector("#cart-empty");
        const summary = document.querySelector("#cart-summary");
        const totals = document.querySelector("#cart-totals");
        const orderLink = document.querySelector("#cart-order");
        const checkoutLink = document.querySelector("#cart-checkout-link");
        const status = document.querySelector("#cart-page-status");
        const errorState = document.querySelector("#cart-error");
        const deliveryInputs = Array.from(document.querySelectorAll('#delivery-options input[name="delivery-method"]'));
        const summaryNote = document.querySelector("#cart-summary-note");
        let pricingRefreshPending = false;

        function createButton(text, label, className) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = className;
            button.textContent = text;
            button.setAttribute("aria-label", label);
            return button;
        }

        function renderSummary(items, selectedMethod) {
            const subtotals = new Map();
            let hasUnpricedItems = false;
            let hasEstimatedItems = false;
            const orderDetails = [];

            items.forEach((item) => {
                const length = item.length ? `${item.length} pouces` : "à préciser";
                const lace = item.lace ? item.lace.replace(/x/gi, "×") : "à préciser";
                if (item.price === null) {
                    hasUnpricedItems = true;
                    orderDetails.push(`• ${item.name} — Longueur : ${length} — Dentelle : ${lace} — Quantité : ${item.quantity} — Prix unitaire : à confirmer — Sous-total : à confirmer`);
                    return;
                }
                hasEstimatedItems = hasEstimatedItems || item.priceIsEstimate === true;
                subtotals.set(item.currency, (subtotals.get(item.currency) || 0) + item.price * item.quantity);
                orderDetails.push([
                    `• ${item.name}`,
                    `Longueur : ${length}`,
                    `Dentelle : ${lace}`,
                    `Quantité : ${item.quantity}`,
                    `Prix unitaire${item.priceIsEstimate ? " à partir de" : ""} : ${formatPrice(item.price, item.currency)}`,
                    `${item.priceIsEstimate ? "Sous-total estimé" : "Sous-total"} : ${formatPrice(item.price * item.quantity, item.currency)}`
                ].join(" — "));
            });

            deliveryInputs.forEach((input) => {
                input.checked = Boolean(selectedMethod && input.value === selectedMethod.id);
                input.closest(".delivery-option").classList.toggle("is-selected", input.checked);
            });

            totals.replaceChildren();
            function appendPriceRow(label, value, className) {
                const row = document.createElement("p");
                const rowValue = document.createElement("strong");
                row.className = `cart-price-row${className ? ` ${className}` : ""}`;
                row.append(document.createTextNode(label));
                rowValue.textContent = value;
                row.append(rowValue);
                totals.append(row);
            }

            if (subtotals.size === 1) {
                const [currency, subtotal] = Array.from(subtotals.entries())[0];
                appendPriceRow(hasEstimatedItems && !hasUnpricedItems ? "Sous-total estimé" : "Sous-total", formatPrice(subtotal, currency));
            } else if (subtotals.size > 1) {
                subtotals.forEach((subtotal, currency) => {
                    appendPriceRow(`${hasEstimatedItems && !hasUnpricedItems ? "Sous-total estimé" : "Sous-total"} (${currency})`, formatPrice(subtotal, currency));
                });
            } else {
                appendPriceRow("Sous-total", hasUnpricedItems ? "À confirmer" : formatPrice(0, "EUR"));
            }

            appendPriceRow(
                selectedMethod ? `Livraison · ${selectedMethod.label}` : "Livraison",
                selectedMethod ? formatPrice(selectedMethod.price, "EUR") : "À sélectionner"
            );

            const finalTotals = new Map(subtotals);
            if (selectedMethod) {
                finalTotals.set("EUR", (finalTotals.get("EUR") || 0) + selectedMethod.price);
            }
            const totalLabel = selectedMethod
                ? hasUnpricedItems ? "Total provisoire" : hasEstimatedItems ? "Total estimé" : "Total de la commande"
                : "Total avec livraison";
            if (finalTotals.size === 1) {
                const [currency, total] = Array.from(finalTotals.entries())[0];
                appendPriceRow(
                    totalLabel,
                    selectedMethod ? formatPrice(total, currency) : "Choisissez une livraison",
                    "cart-price-row--total"
                );
            } else if (finalTotals.size > 1) {
                finalTotals.forEach((total, currency) => {
                    appendPriceRow(`${totalLabel} (${currency})`, formatPrice(total, currency), "cart-price-row--total");
                });
            } else {
                appendPriceRow(
                    totalLabel,
                    selectedMethod ? formatPrice(selectedMethod.price, "EUR") : "Choisissez une livraison",
                    "cart-price-row--total"
                );
            }

            if (hasUnpricedItems) {
                const note = document.createElement("p");
                note.className = "cart-total-note";
                note.textContent = "Les articles dont le prix est à confirmer ne sont pas inclus dans le total provisoire.";
                totals.append(note);
            } else if (hasEstimatedItems) {
                const note = document.createElement("p");
                note.className = "cart-total-note";
                note.textContent = "Le total est estimé à partir du prix de départ ; le montant final sera confirmé avec la longueur.";
                totals.append(note);
            }

            summaryNote.textContent = selectedMethod
                ? selectedMethod.details
                : "Choisissez une option pour calculer le total et préparer votre demande.";

            if (!selectedMethod) {
                orderLink.href = "#delivery-options";
                orderLink.setAttribute("aria-disabled", "true");
                orderLink.tabIndex = -1;
                orderLink.textContent = "Choisir un mode de livraison";
                return;
            }
            if (pricingRefreshPending) {
                orderLink.href = "#cart-items";
                orderLink.setAttribute("aria-disabled", "true");
                orderLink.tabIndex = -1;
                orderLink.textContent = "Actualisation des prix…";
                return;
            }

            const totalMessage = Array.from(finalTotals, ([currency, amount]) =>
                `${formatPrice(amount, currency)}${finalTotals.size > 1 ? ` (${currency})` : ""}`
            ).join(" · ");
            const subtotalMessage = Array.from(subtotals, ([currency, amount]) =>
                `${formatPrice(amount, currency)}${subtotals.size > 1 ? ` (${currency})` : ""}`
            ).join(" · ") || (hasUnpricedItems ? "à confirmer" : formatPrice(0, "EUR"));
            const message = [
                `Bonjour, je souhaite commander :\n${orderDetails.join("\n")}`,
                `Mode de livraison : ${selectedMethod.label}.`,
                `Précisions : ${selectedMethod.details}`,
                `${hasUnpricedItems ? "Sous-total provisoire" : hasEstimatedItems ? "Sous-total estimé" : "Sous-total"} : ${subtotalMessage}.`,
                `Frais de livraison : ${formatPrice(selectedMethod.price, "EUR")}.`,
                `${hasUnpricedItems ? "Total provisoire" : hasEstimatedItems ? "Total estimé" : "Total"} : ${totalMessage}.`,
                hasUnpricedItems ? "Certains prix restent à confirmer." : "",
                !hasUnpricedItems && hasEstimatedItems ? "Le total est calculé à partir des prix de départ ; le montant final sera confirmé avec la longueur." : "",
                "Pouvez-vous confirmer la disponibilité et les modalités ?"
            ].filter(Boolean).join(" ");
            orderLink.href = createWhatsAppUrl(message);
            orderLink.removeAttribute("aria-disabled");
            orderLink.removeAttribute("tabindex");
            orderLink.textContent = "Commander sur WhatsApp";
        }

        function render() {
            let items;
            try {
                items = getItems();
            } catch (error) {
                cartList.replaceChildren();
                emptyState.hidden = true;
                summary.hidden = true;
                errorState.hidden = false;
                errorState.textContent = error.message;
                if (error.code === "cart-unreadable") {
                    const resetButton = createButton("Vider le panier", "Vider le panier enregistré pour reprendre vos achats", "cart-remove");
                    resetButton.addEventListener("click", () => {
                        try {
                            clearItems();
                            status.textContent = "Votre panier a été vidé. Vous pouvez reprendre vos achats.";
                        } catch (clearError) {
                            status.textContent = clearError.message;
                        }
                    });
                    errorState.textContent = "Votre panier enregistré n’a pas pu être lu ; il provient peut-être d’une ancienne version du site. Videz-le pour reprendre vos achats.";
                    errorState.append(" ", resetButton);
                }
                checkoutLink.href = "#cart-items";
                checkoutLink.setAttribute("aria-disabled", "true");
                checkoutLink.tabIndex = -1;
                return;
            }

            let selectedMethod = null;
            let deliveryError = null;
            try {
                selectedMethod = getDeliveryMethod();
            } catch (error) {
                deliveryError = error;
            }

            errorState.hidden = !deliveryError;
            errorState.textContent = deliveryError ? deliveryError.message : "";
            cartList.replaceChildren();
            emptyState.hidden = items.length > 0;
            summary.hidden = items.length === 0;
            checkoutLink.href = items.length > 0 ? "checkout.html" : "#cart-items";
            if (items.length > 0) {
                checkoutLink.removeAttribute("aria-disabled");
                checkoutLink.removeAttribute("tabindex");
                checkoutLink.textContent = "Commander";
            } else {
                checkoutLink.setAttribute("aria-disabled", "true");
                checkoutLink.tabIndex = -1;
                checkoutLink.textContent = "Votre panier est vide";
            }

            items.forEach((item) => {
                const card = document.createElement("article");
                const image = document.createElement("img");
                const details = document.createElement("div");
                const title = document.createElement("h2");
                const variant = document.createElement("p");
                const unitPrice = document.createElement("p");
                const lineTotal = document.createElement("p");
                const quantityControls = document.createElement("div");
                const quantityInput = document.createElement("input");
                const removeButton = createButton("Supprimer", `Supprimer ${item.name} du panier`, "cart-remove");

                card.className = "cart-item";
                card.dataset.lineId = item.lineId;
                image.className = "cart-item-image";
                image.src = item.image || "image/wig1.jpg";
                image.alt = `Perruque ${item.name}`;
                image.loading = "lazy";
                image.decoding = "async";

                details.className = "cart-item-details";
                title.textContent = item.name;
                variant.className = "cart-item-variant";
                variant.textContent = `${item.length ? `${item.length} pouces` : "Longueur à préciser"}${item.lace ? ` · Dentelle ${item.lace.replace(/x/gi, "×")}` : " · Dentelle à préciser"}`;
                unitPrice.className = "cart-item-unit-price";
                unitPrice.textContent = item.price === null
                    ? "Prix à confirmer"
                    : `${item.priceIsEstimate ? "À partir de " : ""}${formatPrice(item.price, item.currency)} / unité`;
                lineTotal.className = "cart-item-line-total";
                lineTotal.textContent = item.price === null
                    ? "Sous-total à confirmer"
                    : `${item.priceIsEstimate ? "Sous-total estimé" : "Sous-total"} · ${formatPrice(item.price * item.quantity, item.currency)}`;

                quantityControls.className = "cart-quantity";
                const decreaseButton = createButton("−", `Diminuer la quantité de ${item.name}`, "cart-quantity-button");
                decreaseButton.disabled = item.quantity <= 1;
                decreaseButton.addEventListener("click", () => changeQuantity(item, item.quantity - 1));
                quantityInput.type = "number";
                quantityInput.min = "1";
                quantityInput.value = String(item.quantity);
                quantityInput.setAttribute("aria-label", `Quantité de ${item.name}`);
                if (item.maxQuantity !== null) quantityInput.max = String(item.maxQuantity);
                quantityInput.addEventListener("change", () => {
                    const quantity = Number(quantityInput.value);
                    if (!Number.isInteger(quantity) || quantity < 1) {
                        status.textContent = "La quantité doit être au moins égale à 1.";
                        render();
                        return;
                    }
                    changeQuantity(item, quantity);
                });
                const increaseButton = createButton("+", `Augmenter la quantité de ${item.name}`, "cart-quantity-button");
                increaseButton.disabled = item.maxQuantity !== null && item.quantity >= item.maxQuantity;
                increaseButton.addEventListener("click", () => changeQuantity(item, item.quantity + 1));
                quantityControls.append(decreaseButton, quantityInput, increaseButton);
                removeButton.addEventListener("click", () => {
                    try {
                        removeItem(item.lineId);
                        status.textContent = `${item.name} a été supprimé du panier.`;
                    } catch (error) {
                        status.textContent = error.message;
                    }
                });

                details.append(title, variant, unitPrice, lineTotal, quantityControls, removeButton);
                card.append(image, details);
                cartList.append(card);
            });

            renderSummary(items, selectedMethod);
        }

        function changeQuantity(item, quantity) {
            try {
                updateQuantity(item.lineId, quantity);
                status.textContent = `Quantité de ${item.name} mise à jour.`;
            } catch (error) {
                status.textContent = error.message;
                render();
            }
        }

        global.addEventListener("iarintsoa-cart-updated", render);
        global.addEventListener("storage", (event) => {
            if (event.key === storageKey || event.key === deliveryStorageKey) render();
        });
        deliveryInputs.forEach((input) => {
            input.addEventListener("change", () => {
                if (!input.checked) return;
                try {
                    saveDeliveryMethod(input.value);
                    renderSummary(getItems(), getDeliveryMethod());
                    errorState.hidden = true;
                    errorState.textContent = "";
                    const selectedMethod = deliveryMethods.find((method) => method.id === input.value);
                    status.textContent = `${selectedMethod.label} sélectionné. Frais de livraison : ${formatPrice(selectedMethod.price, "EUR")}.`;
                } catch (error) {
                    errorState.hidden = false;
                    errorState.textContent = error.message;
                }
            });
        });
        orderLink.addEventListener("click", (event) => {
            if (orderLink.getAttribute("aria-disabled") !== "true") return;
            event.preventDefault();
            if (pricingRefreshPending) {
                status.textContent = "Les prix du panier sont en cours d’actualisation. Réessayez dans un instant.";
            } else {
                status.textContent = "Choisissez d’abord votre mode de livraison.";
                deliveryInputs[0].focus();
            }
        });
        checkoutLink.addEventListener("click", (event) => {
            if (checkoutLink.getAttribute("aria-disabled") !== "true") return;
            event.preventDefault();
            status.textContent = "Ajoutez un article au panier avant de continuer vers le paiement.";
        });
        try {
            pricingRefreshPending = getItems().some((item) => item.price === null);
        } catch (error) {
            pricingRefreshPending = false;
        }
        render();
        if (pricingRefreshPending) {
            refreshMissingPrices().then(() => {
                pricingRefreshPending = false;
                render();
            }).catch((error) => {
                pricingRefreshPending = false;
                render();
                errorState.hidden = false;
                errorState.textContent = `Les prix enregistrés du panier n’ont pas pu être actualisés. ${error.message}`;
            });
        }
    }

    global.IARINTSOACart = Object.freeze({
        addItem,
        getItems,
        refreshMissingPrices,
        getItemCount: () => getItems().reduce((total, item) => total + item.quantity, 0),
        getDeliveryOptions: () => deliveryMethods,
        getDeliveryMethod,
        setDeliveryMethod: saveDeliveryMethod,
        updateQuantity,
        removeItem,
        formatPrice,
        refreshCartBadges
    });

    global.addEventListener("iarintsoa-cart-updated", refreshCartBadges);
    global.addEventListener("storage", (event) => {
        if (event.key === storageKey) refreshCartBadges();
    });
    refreshCartBadges();
    mountCartPage();
})(window);
