(function (global) {
    "use strict";

    const customerStorageKey = "iarintsoa-hair.checkout.v1";
    const cart = global.IARINTSOACart;
    const form = document.querySelector("#checkout-form");
    const fieldNames = ["firstName", "lastName", "phone", "email", "address", "postalCode", "commune"];
    const status = document.querySelector("#checkout-status");
    const errorState = document.querySelector("#checkout-error");
    const checkoutItems = document.querySelector("#checkout-items");
    const totals = document.querySelector("#checkout-totals");
    const summaryNote = document.querySelector("#checkout-summary-note");
    const deliveryOptions = document.querySelector("#checkout-delivery-options");
    const submitButton = document.querySelector("#checkout-submit");
    const whatsappButton = document.querySelector("#checkout-whatsapp");
    let items = [];
    let selectedDelivery = null;
    let subtotalByCurrency = new Map();
    let finalTotalsByCurrency = new Map();
    let hasUnpricedItems = false;
    let hasEstimatedItems = false;
    let missingPriceRefresh = null;

    function showError(message) {
        errorState.hidden = false;
        errorState.textContent = message;
    }

    function clearError() {
        errorState.hidden = true;
        errorState.textContent = "";
    }

    function refreshMissingPrices() {
        if (!missingPriceRefresh) {
            const refresh = cart.refreshMissingPrices();
            missingPriceRefresh = refresh.then((refreshedItems) => {
                missingPriceRefresh = null;
                return refreshedItems;
            }, (error) => {
                missingPriceRefresh = null;
                throw error;
            });
        }
        return missingPriceRefresh;
    }

    function readSavedCustomer() {
        let stored;
        try {
            stored = global.localStorage.getItem(customerStorageKey);
        } catch (error) {
            throw new Error("Les informations client ne peuvent pas être lues dans ce navigateur.");
        }
        if (stored === null) return null;

        try {
            const data = JSON.parse(stored);
            if (!data || typeof data !== "object"
                || !fieldNames.every((name) => typeof data[name] === "string")
                || typeof data.termsAccepted !== "boolean") {
                throw new Error("Format de coordonnées invalide.");
            }
            return data;
        } catch (error) {
            throw new Error(`Impossible de restaurer les informations client : ${error.message}`);
        }
    }

    function getCustomerData() {
        const data = {};
        fieldNames.forEach((name) => {
            data[name] = form.elements.namedItem(name).value.trim();
        });
        data.termsAccepted = document.querySelector("#checkout-terms").checked;
        return data;
    }

    function saveCustomerData() {
        try {
            global.localStorage.setItem(customerStorageKey, JSON.stringify(getCustomerData()));
            return true;
        } catch (error) {
            status.textContent = "Impossible d’enregistrer vos informations dans ce navigateur. Elles ne seront pas conservées après fermeture.";
            return false;
        }
    }

    function restoreCustomerData() {
        try {
            const data = readSavedCustomer();
            if (!data) return;
            fieldNames.forEach((name) => {
                form.elements.namedItem(name).value = data[name];
            });
            // La case CGV n'est jamais restaurée : l'acceptation doit être un geste volontaire à chaque commande.
        } catch (error) {
            showError(error.message);
        }
    }

    function createSvgIcon(methodId) {
        const namespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(namespace, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        if (methodId === "colissimo") {
            svg.innerHTML = '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/><path d="M6 9h5m-5 3h4"/>';
        } else if (methodId === "relay") {
            svg.innerHTML = '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/><path d="M8 3 6 5m10-2 2 2"/>';
        } else {
            svg.innerHTML = '<path d="m3 11 9-8 9 8v10H3z"/><path d="M9 21v-7h6v7m-6-12h.01m6 0h.01"/><path d="M5 5h4"/>';
        }
        return svg;
    }

    function renderDeliveryOptions() {
        const legend = deliveryOptions.querySelector("legend");
        deliveryOptions.replaceChildren(legend);
        cart.getDeliveryOptions().forEach((method) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            const details = document.createElement("small");
            const price = document.createElement("strong");

            label.className = "delivery-option";
            label.htmlFor = `checkout-delivery-${method.id}`;
            input.type = "radio";
            input.name = "checkout-delivery";
            input.id = `checkout-delivery-${method.id}`;
            input.value = method.id;
            input.required = true;
            input.checked = Boolean(selectedDelivery && selectedDelivery.id === method.id);
            input.addEventListener("change", () => {
                if (!input.checked) return;
                try {
                    cart.setDeliveryMethod(method.id);
                    selectedDelivery = cart.getDeliveryMethod();
                    renderTotals();
                    clearError();
                    status.textContent = `${method.label} sélectionné. Frais : ${cart.formatPrice(method.price, "EUR")}.`;
                } catch (error) {
                    showError(error.message);
                }
            });

            copy.className = "delivery-option-copy";
            title.textContent = method.label;
            details.textContent = method.details;
            copy.append(title, details);
            price.className = "delivery-option-price";
            price.textContent = cart.formatPrice(method.price, "EUR");
            label.append(input, createSvgIcon(method.id), copy, price);
            deliveryOptions.append(label);
            label.classList.toggle("is-selected", input.checked);
        });
    }

    function appendTotalRow(label, value, total) {
        const row = document.createElement("p");
        const amount = document.createElement("strong");
        row.className = `checkout-price-row${total ? " checkout-price-row--grand-total" : ""}`;
        row.append(document.createTextNode(label));
        amount.textContent = value;
        row.append(amount);
        totals.append(row);
    }

    function renderItems() {
        checkoutItems.replaceChildren();
        items.forEach((item) => {
            const row = document.createElement("article");
            const image = document.createElement("img");
            const copy = document.createElement("div");
            const title = document.createElement("strong");
            const variant = document.createElement("span");
            const unitPrice = document.createElement("span");
            const amount = document.createElement("div");
            const amountLabel = document.createElement("span");
            const amountValue = document.createElement("strong");

            row.className = "checkout-order-item";
            image.className = "checkout-item-image";
            image.src = item.image || "image/wig1.jpg";
            image.alt = `Perruque ${item.name}`;
            image.loading = "lazy";
            image.decoding = "async";
            copy.className = "checkout-item-copy";
            title.textContent = item.name;
            variant.textContent = `${item.length ? `${item.length} pouces` : "Longueur à préciser"}${item.lace ? ` · Dentelle ${item.lace.replace(/x/gi, "×")}` : " · Dentelle à préciser"} · Qté ${item.quantity}`;
            unitPrice.className = "checkout-item-unit-price";
            unitPrice.textContent = item.price === null
                ? "Prix unitaire · à confirmer"
                : `Prix unitaire${item.priceIsEstimate ? " à partir de" : ""} · ${cart.formatPrice(item.price, item.currency)}`;
            amount.className = "checkout-item-price";
            amountLabel.textContent = item.priceIsEstimate ? "Sous-total estimé" : "Sous-total";
            amountValue.textContent = item.price === null
                ? "À confirmer"
                : `${item.priceIsEstimate ? "≈ " : ""}${cart.formatPrice(item.price * item.quantity, item.currency)}`;
            amount.append(amountLabel, amountValue);
            copy.append(title, variant, unitPrice);
            row.append(image, copy, amount);
            checkoutItems.append(row);
        });
    }

    function renderTotals() {
        totals.replaceChildren();
        subtotalByCurrency = new Map();
        hasUnpricedItems = false;
        hasEstimatedItems = false;
        if (items.length === 0) {
            finalTotalsByCurrency = new Map([["EUR", 0]]);
            appendTotalRow("Sous-total", cart.formatPrice(0, "EUR"), false);
            appendTotalRow("Livraison", "—", false);
            appendTotalRow("Total TTC", cart.formatPrice(0, "EUR"), true);
            summaryNote.textContent = "Ajoutez un article pour préparer votre commande.";
            return;
        }

        items.forEach((item) => {
            if (item.price === null) {
                hasUnpricedItems = true;
                return;
            }
            hasEstimatedItems = hasEstimatedItems || item.priceIsEstimate === true;
            subtotalByCurrency.set(item.currency,
                (subtotalByCurrency.get(item.currency) || 0) + item.price * item.quantity);
        });

        if (subtotalByCurrency.size === 1) {
            const [currency, subtotal] = Array.from(subtotalByCurrency.entries())[0];
            appendTotalRow(hasEstimatedItems && !hasUnpricedItems ? "Sous-total estimé" : "Sous-total", cart.formatPrice(subtotal, currency), false);
        } else if (subtotalByCurrency.size > 1) {
            subtotalByCurrency.forEach((subtotal, currency) => {
                appendTotalRow(`${hasEstimatedItems && !hasUnpricedItems ? "Sous-total estimé" : "Sous-total"} (${currency})`, cart.formatPrice(subtotal, currency), false);
            });
        } else {
            appendTotalRow("Sous-total", hasUnpricedItems ? "À confirmer" : cart.formatPrice(0, "EUR"), false);
        }

        appendTotalRow(
            selectedDelivery ? `Livraison · ${selectedDelivery.label}` : "Livraison",
            selectedDelivery ? cart.formatPrice(selectedDelivery.price, "EUR") : "À sélectionner",
            false
        );

        finalTotalsByCurrency = new Map(subtotalByCurrency);
        if (selectedDelivery) {
            finalTotalsByCurrency.set("EUR", (finalTotalsByCurrency.get("EUR") || 0) + selectedDelivery.price);
        }
        const totalLabel = hasUnpricedItems || hasEstimatedItems ? "Total TTC estimé" : "Total TTC";
        if (finalTotalsByCurrency.size === 1) {
            const [currency, total] = Array.from(finalTotalsByCurrency.entries())[0];
            appendTotalRow(totalLabel, selectedDelivery
                ? cart.formatPrice(total, currency)
                : "Choisissez une livraison", true);
        } else if (finalTotalsByCurrency.size > 1) {
            finalTotalsByCurrency.forEach((total, currency) => {
                appendTotalRow(`${totalLabel} (${currency})`, cart.formatPrice(total, currency), true);
            });
        } else {
            appendTotalRow(totalLabel, selectedDelivery
                ? cart.formatPrice(selectedDelivery.price, "EUR")
                : "Choisissez une livraison", true);
        }

        const notes = [];
        if (!selectedDelivery) notes.push("Choisissez une livraison pour calculer le total final.");
        if (hasUnpricedItems) notes.push("Les articles sans prix définitif ne sont pas inclus dans le total estimé. Notre équipe confirmera le montant avant la demande de paiement Wero.");
        else if (hasEstimatedItems) notes.push("Le total est calculé à partir du prix de départ. Le montant final sera confirmé avec la longueur avant toute demande de paiement.");
        summaryNote.textContent = notes.join(" ");
    }

    function refreshCheckout() {
        clearError();
        items = [];
        selectedDelivery = null;
        try {
            items = cart.getItems();
        } catch (error) {
            if (error.code === "cart-unreadable") {
                // Panier abîmé : la page panier propose de le réinitialiser.
                const cartLink = document.createElement("a");
                cartLink.href = "cart.html";
                cartLink.textContent = "Ouvrir mon panier";
                errorState.hidden = false;
                errorState.replaceChildren("Votre panier enregistré n’a pas pu être lu. ", cartLink, " pour le réinitialiser, puis reprenez votre commande.");
            } else {
                showError(error.message);
            }
            checkoutItems.replaceChildren();
            totals.replaceChildren();
            document.querySelector("#checkout-empty").hidden = true;
            submitButton.disabled = true;
            whatsappButton.disabled = true;
            return;
        }
        try {
            selectedDelivery = cart.getDeliveryMethod();
        } catch (error) {
            showError(error.message);
        }

        const empty = items.length === 0;
        document.querySelector("#checkout-empty").hidden = !empty;
        form.classList.toggle("checkout-form--empty", empty);
        whatsappButton.disabled = empty;
        renderDeliveryOptions();
        renderItems();
        renderTotals();
        submitButton.disabled = empty;
    }

    function validateCheckout() {
        form.classList.add("was-validated");
        if (!form.reportValidity()) return false;
        if (items.length === 0) {
            status.textContent = "Votre panier est vide.";
            return false;
        }
        if (!selectedDelivery) {
            status.textContent = "Choisissez votre mode de livraison.";
            deliveryOptions.querySelector("input").focus();
            return false;
        }
        if (!saveCustomerData()) return false;
        return true;
    }

    function createOrderReference() {
        const token = global.crypto && typeof global.crypto.randomUUID === "function"
            ? global.crypto.randomUUID().replace(/-/g, "").toUpperCase()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.toUpperCase();
        return `IAR-${token}`;
    }

    function createOrderSnapshot(statusValue) {
        return {
            reference: createOrderReference(),
            status: statusValue,
            createdAt: new Date().toISOString(),
            customer: getCustomerData(),
            items: JSON.parse(JSON.stringify(items)),
            delivery: Object.assign({}, selectedDelivery),
            paymentMethod: "Wero",
            subtotal: Object.fromEntries(subtotalByCurrency),
            total: Object.fromEntries(finalTotalsByCurrency)
        };
    }

    function saveOrder(order, update) {
        const storage = global.IARINTSOAOrderStorage;
        const method = update ? "updateOrder" : "createOrder";
        if (!storage || typeof storage[method] !== "function") {
            return Promise.reject(new Error("Le stockage local des commandes n’est pas chargé."));
        }
        return storage[method](order);
    }

    function buildOrderMessage(order) {
        const customer = order.customer;
        const hasUnpricedOrderItems = order.items.some((item) => item.price === null);
        const hasEstimatedOrderItems = order.items.some((item) => item.priceIsEstimate === true);
        const address = `${customer.address}, ${customer.postalCode} ${customer.commune}`;
        const productLines = order.items.map((item) => {
            const length = item.length ? `${item.length} pouces` : "à préciser";
            const lace = item.lace ? item.lace.replace(/x/gi, "×") : "à préciser";
            if (item.price === null) {
                return `• ${item.name} — Longueur : ${length} — Dentelle : ${lace} — Quantité : ${item.quantity} — Prix unitaire : à confirmer — Sous-total : à confirmer`;
            }
            const unitPrice = cart.formatPrice(item.price, item.currency);
            const lineTotal = cart.formatPrice(item.price * item.quantity, item.currency);
            return `• ${item.name} — Longueur : ${length} — Dentelle : ${lace} — Quantité : ${item.quantity} — Prix unitaire${item.priceIsEstimate ? " à partir de" : ""} : ${unitPrice} — ${item.priceIsEstimate ? "Sous-total estimé" : "Sous-total"} : ${lineTotal}`;
        }).join("\n");
        const totalMessage = Object.entries(order.total)
            .map(([currency, amount]) => `${cart.formatPrice(amount, currency)}${Object.keys(order.total).length > 1 ? ` (${currency})` : ""}`)
            .join(" · ");
        const subtotalMessage = Object.entries(order.subtotal)
            .map(([currency, amount]) => `${cart.formatPrice(amount, currency)}${Object.keys(order.subtotal).length > 1 ? ` (${currency})` : ""}`)
            .join(" · ") || "à confirmer";

        return [
            "Bonjour, je souhaite finaliser ma commande IARINTSOA Hair.",
            `Numéro de commande : ${order.reference}`,
            `Client : ${customer.firstName} ${customer.lastName}`,
            `Téléphone : ${customer.phone}`,
            customer.email ? `E-mail : ${customer.email}` : "",
            `Adresse : ${address}`,
            "Produits :",
            productLines,
            `Mode de livraison : ${order.delivery.label} — ${order.delivery.details}`,
            `${hasEstimatedOrderItems && !hasUnpricedOrderItems ? "Sous-total estimé" : "Sous-total"} : ${subtotalMessage}`,
            `Frais de livraison : ${cart.formatPrice(order.delivery.price, "EUR")}`,
            `${hasUnpricedOrderItems || hasEstimatedOrderItems ? "Total estimé" : "Total"} : ${totalMessage}`,
            hasUnpricedOrderItems ? "Le montant des articles à confirmer sera validé par notre équipe avant paiement." : "",
            !hasUnpricedOrderItems && hasEstimatedOrderItems ? "Le montant est basé sur le prix de départ ; le total final sera confirmé avec la longueur avant paiement." : "",
            `Mode de paiement : ${order.paymentMethod}`,
            "J’accepte les Conditions Générales de Vente."
        ].filter(Boolean).join("\n");
    }

    async function continueToWero() {
        await refreshMissingPrices();
        refreshCheckout();
        if (!validateCheckout()) return;
        if (hasUnpricedItems || hasEstimatedItems) {
            status.textContent = "Un ou plusieurs produits n’ont pas encore de prix définitif. Aucun paiement Wero n’a été lancé ; confirmez la longueur et le montant sur WhatsApp.";
            return;
        }

        submitButton.disabled = true;
        const order = createOrderSnapshot("payment_pending");
        status.textContent = "Enregistrement sécurisé de votre commande…";
        try {
            await saveOrder(order, false);
        } catch (error) {
            showError(`La commande n’a pas pu être enregistrée. Aucun paiement n’a été lancé. ${error.message}`);
            submitButton.disabled = false;
            return;
        }

        const provider = global.IARINTSOAWeroCheckout || {};
        if (provider.configured !== true || typeof provider.createSession !== "function") {
            status.textContent = `La commande ${order.reference} est enregistrée. Wero n’est pas encore connecté ; aucun paiement n’a été demandé. Redirection vers la page de préparation.`;
            const preparationUrl = new URL("order-received.html", global.location.href);
            preparationUrl.searchParams.set("order_reference", order.reference);
            global.location.assign(preparationUrl.href);
            return;
        }

        status.textContent = "Préparation de votre paiement Wero…";
        try {
            const returnUrl = new URL("order-received.html", global.location.href);
            returnUrl.searchParams.set("order_reference", order.reference);
            const result = await provider.createSession(order, { returnUrl: returnUrl.href });
            if (!result || typeof result.checkoutUrl !== "string"
                || typeof result.sessionId !== "string" || !result.sessionId) {
                throw new Error("Le service Wero n’a pas retourné une session de paiement valide.");
            }
            const checkoutUrl = new URL(result.checkoutUrl);
            if (checkoutUrl.protocol !== "https:" || checkoutUrl.username || checkoutUrl.password) {
                throw new Error("Le lien de paiement Wero doit être une adresse HTTPS valide.");
            }
            order.sessionId = result.sessionId;
            await saveOrder(order, true);
            global.location.assign(checkoutUrl.href);
        } catch (error) {
            showError(`Le paiement Wero n’a pas été lancé. Aucun paiement n’a été effectué. ${error.message}`);
            status.textContent = `La commande ${order.reference} reste enregistrée et en attente.`;
            submitButton.disabled = false;
        }
    }

    async function sendWhatsAppOrder() {
        await refreshMissingPrices();
        refreshCheckout();
        if (!validateCheckout()) return;
        const order = createOrderSnapshot("whatsapp_request");
        try {
            await saveOrder(order, false);
        } catch (error) {
            showError(`La commande n’a pas pu être enregistrée. ${error.message}`);
            return;
        }
        const whatsappUrl = `https://wa.me/262693600145?text=${encodeURIComponent(buildOrderMessage(order))}`;
        global.open(whatsappUrl, "_blank", "noopener,noreferrer");
        status.textContent = `La commande ${order.reference} est enregistrée. Envoyez le récapitulatif ouvert dans WhatsApp ; si l’application ne s’ouvre pas, réessayez avec « Commander sur WhatsApp ». Notre équipe vérifiera ensuite la commande et vous transmettra la demande de paiement Wero.`;
    }

    form.addEventListener("input", saveCustomerData);
    form.addEventListener("change", saveCustomerData);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        continueToWero().catch((error) => showError(`Le paiement n’a pas pu être préparé. ${error.message}`));
    });
    whatsappButton.addEventListener("click", () => {
        sendWhatsAppOrder().catch((error) => showError(`La demande WhatsApp n’a pas pu être préparée. ${error.message}`));
    });
    global.addEventListener("iarintsoa-cart-updated", refreshCheckout);
    global.addEventListener("storage", (event) => {
        if (event.key === "iarintsoa-hair.cart.v1" || event.key === "iarintsoa-hair.delivery.v1") {
            refreshCheckout();
        }
    });

    refreshCheckout();
    refreshMissingPrices().then(refreshCheckout).catch((error) => {
        if (error.code === "cart-unreadable") return; // déjà expliqué par refreshCheckout()
        showError(`Les prix enregistrés du panier n’ont pas pu être actualisés. ${error.message}`);
    });
    restoreCustomerData();
})(window);
