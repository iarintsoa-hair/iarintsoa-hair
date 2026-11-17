(function (global) {
    "use strict";

    const pendingOrderStorageKey = "iarintsoa-hair.pending-order.v1";
    const cartStorageKey = "iarintsoa-hair.cart.v1";
    const deliveryStorageKey = "iarintsoa-hair.delivery.v1";
    const pendingPanel = document.querySelector("#receipt-pending");
    const confirmedPanel = document.querySelector("#receipt-confirmed");
    const pendingMessage = document.querySelector("#receipt-pending-message");
    const pendingReference = document.querySelector("#receipt-pending-reference");
    const pendingWhatsApp = document.querySelector("#receipt-pending-whatsapp");

    async function readPendingOrder(reference) {
        let order = null;
        let storageError = null;
        if (reference) {
            try {
                if (!global.IARINTSOAOrderStorage) {
                    throw new Error("Le stockage local des commandes n’est pas chargé.");
                }
                order = await global.IARINTSOAOrderStorage.getOrder(reference);
            } catch (error) {
                storageError = error;
            }
        }

        if (!order) {
            const stored = global.localStorage.getItem(pendingOrderStorageKey);
            if (stored) {
                const localOrder = JSON.parse(stored);
                if (!reference || (localOrder && localOrder.reference === reference)) order = localOrder;
            }
        }
        if (!order && storageError) throw storageError;
        if (!order) return null;

        if (!order || typeof order !== "object"
            || typeof order.reference !== "string" || !order.reference
            || !Array.isArray(order.items) || order.items.length === 0
            || !order.customer || typeof order.customer !== "object"
            || !["firstName", "lastName", "phone", "address", "postalCode", "commune"]
                .every((key) => typeof order.customer[key] === "string")
            || typeof order.customer.email !== "string"
            || !order.delivery || typeof order.delivery !== "object"
            || typeof order.delivery.label !== "string"
            || typeof order.delivery.details !== "string"
            || !Number.isFinite(order.delivery.price) || order.delivery.price < 0
            || !order.total || typeof order.total !== "object"
            || !order.subtotal || typeof order.subtotal !== "object"
            || ![order.total, order.subtotal].every((prices) => Object.entries(prices).every(([currency, value]) =>
                /^[A-Z]{3}$/.test(currency) && Number.isFinite(value) && value >= 0))
            || !order.items.every((item) => item && typeof item.name === "string"
                && typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity > 0
                && (item.price === null || (Number.isFinite(item.price) && item.price >= 0))
                && typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency)
                && (item.length === null || typeof item.length === "string")
                && (item.lace === null || typeof item.lace === "string")
                && (item.image === null || typeof item.image === "string"))) {
            throw new Error("Les informations de commande enregistrées sont incomplètes.");
        }
        return order;
    }

    function formatTotal(total) {
        return Object.entries(total)
            .filter((entry) => Number.isFinite(entry[1]))
            .map((entry) => global.IARINTSOACart.formatPrice(entry[1], entry[0]))
            .join(" · ") || "À confirmer";
    }

    function buildWhatsAppMessage(order) {
        const customer = order.customer;
        const hasUnpricedItems = order.items.some((item) => item.price === null);
        const hasEstimatedItems = order.items.some((item) => item.priceIsEstimate === true);
        const lines = order.items.map((item) => {
            const length = item.length ? `${item.length} pouces` : "à préciser";
            const lace = item.lace ? String(item.lace).replace(/x/gi, "×") : "à préciser";
            if (item.price === null) {
                return `• ${item.name} — Longueur : ${length} — Dentelle : ${lace} — Quantité : ${item.quantity} — Prix unitaire : à confirmer — Sous-total : à confirmer`;
            }
            const unitPrice = global.IARINTSOACart.formatPrice(item.price, item.currency);
            const lineTotal = global.IARINTSOACart.formatPrice(item.price * item.quantity, item.currency);
            return `• ${item.name} — Longueur : ${length} — Dentelle : ${lace} — Quantité : ${item.quantity} — Prix unitaire${item.priceIsEstimate ? " à partir de" : ""} : ${unitPrice} — ${item.priceIsEstimate ? "Sous-total estimé" : "Sous-total"} : ${lineTotal}`;
        }).join("\n");
        const total = formatTotal(order.total);
        const subtotal = formatTotal(order.subtotal || {});

        return [
            "Bonjour, voici le récapitulatif de ma commande IARINTSOA Hair.",
            `Numéro de commande : ${order.reference}`,
            `Client : ${customer.firstName} ${customer.lastName}`,
            `Téléphone : ${customer.phone}`,
            customer.email ? `E-mail : ${customer.email}` : "",
            `Adresse : ${customer.address}, ${customer.postalCode} ${customer.commune}`,
            "Produits :",
            lines,
            `Livraison : ${order.delivery.label} — ${order.delivery.details}`,
            `${hasEstimatedItems && !hasUnpricedItems ? "Sous-total estimé" : "Sous-total"} : ${subtotal}`,
            `Frais de livraison : ${global.IARINTSOACart.formatPrice(order.delivery.price, "EUR")}`,
            `${hasUnpricedItems || hasEstimatedItems ? "Total estimé" : "Total"} : ${total}`,
            hasUnpricedItems ? "Le montant des articles à confirmer sera validé par notre équipe avant paiement." : "",
            !hasUnpricedItems && hasEstimatedItems ? "Le montant est basé sur le prix de départ ; le total final sera confirmé avec la longueur avant paiement." : "",
            `Mode de paiement : ${order.paymentMethod || "Wero"}`
        ].filter(Boolean).join("\n");
    }

    function appendTotalRow(target, label, value, isGrandTotal) {
        const row = document.createElement("p");
        const amount = document.createElement("strong");
        row.className = `checkout-price-row${isGrandTotal ? " checkout-price-row--grand-total" : ""}`;
        row.append(document.createTextNode(label));
        amount.textContent = value;
        row.append(amount);
        target.append(row);
    }

    function renderOrder(order) {
        document.title = "Merci pour votre commande | IARINTSOA Hair";
        document.querySelector("#receipt-thanks").textContent =
            `Votre paiement a été confirmé. Nous préparons votre commande et vous contacterons pour la suite.`;
        document.querySelector("#receipt-reference").textContent = `Référence de commande : ${order.reference}`;
        const paymentStep = document.querySelector(".checkout-progress li:nth-child(3)");
        const confirmationStep = document.querySelector(".checkout-progress li:nth-child(4)");
        paymentStep.classList.remove("is-current");
        paymentStep.classList.add("is-complete");
        paymentStep.removeAttribute("aria-current");
        confirmationStep.classList.add("is-current");
        confirmationStep.setAttribute("aria-current", "step");

        const itemsContainer = document.querySelector("#receipt-items");
        itemsContainer.replaceChildren();
        order.items.forEach((item) => {
            const article = document.createElement("article");
            article.className = "receipt-item";
            if (item.image) {
                const image = document.createElement("img");
                image.loading = "lazy";
                image.src = item.image;
                image.alt = "";
                article.append(image);
            } else {
                const placeholder = document.createElement("span");
                placeholder.className = "receipt-item-placeholder";
                placeholder.setAttribute("aria-hidden", "true");
                article.append(placeholder);
            }

            const copy = document.createElement("div");
            copy.className = "receipt-item-copy";
            const name = document.createElement("strong");
            name.textContent = item.name;
            const variant = document.createElement("span");
            variant.textContent = [
                item.length ? `${item.length} pouces` : "Longueur à préciser",
                item.lace ? `Dentelle ${String(item.lace).replace(/x/gi, "×")}` : "Dentelle à préciser",
                `Quantité : ${item.quantity}`
            ].filter(Boolean).join(" · ");
            copy.append(name, variant);
            article.append(copy);

            const price = document.createElement("div");
            price.className = "receipt-item-price";
            const unit = document.createElement("span");
            unit.textContent = item.price === null
                ? "Prix à confirmer"
                : `${item.priceIsEstimate ? "À partir de " : ""}${global.IARINTSOACart.formatPrice(item.price, item.currency)} / unité`;
            const lineTotal = document.createElement("strong");
            lineTotal.textContent = item.price === null
                ? "À confirmer"
                : `${item.priceIsEstimate ? "≈ " : ""}${global.IARINTSOACart.formatPrice(item.price * item.quantity, item.currency)}`;
            price.append(unit, lineTotal);
            article.append(price);
            itemsContainer.append(article);
        });

        const totals = document.querySelector("#receipt-totals");
        totals.replaceChildren();
        const subtotalEntries = Object.entries(order.subtotal || {});
        const hasUnpricedItem = order.items.some((item) => item.price === null);
        const hasEstimatedItem = order.items.some((item) => item.priceIsEstimate === true);
        subtotalEntries.forEach(([currency, value]) => {
            appendTotalRow(totals, hasEstimatedItem && !hasUnpricedItem ? "Sous-total estimé" : "Sous-total", global.IARINTSOACart.formatPrice(value, currency), false);
        });
        appendTotalRow(totals, "Livraison", global.IARINTSOACart.formatPrice(order.delivery.price, "EUR"), false);
        appendTotalRow(totals, hasUnpricedItem || hasEstimatedItem ? "Total TTC estimé" : "Total TTC", formatTotal(order.total), true);

        const whatsappLink = document.querySelector("#receipt-whatsapp");
        whatsappLink.href = `https://wa.me/262693600145?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;
        document.querySelector("#receipt-whatsapp-note").textContent =
            "Le récapitulatif est prêt dans WhatsApp. Pour le transmettre, appuyez sur Envoyer dans l’application.";
        confirmedPanel.hidden = false;
        pendingPanel.hidden = true;
    }

    async function confirmOrder() {
        const params = new URLSearchParams(global.location.search);
        const returnedReference = params.get("order_reference");
        const sessionId = params.get("session_id");
        let order;
        try {
            order = await readPendingOrder(returnedReference);
        } catch (error) {
            pendingMessage.textContent = error.message;
            return;
        }

        if (!order) {
            pendingMessage.textContent = "Aucune commande en attente n’a été trouvée dans ce navigateur. Aucun paiement n’est indiqué comme confirmé.";
            return;
        }
        pendingReference.textContent = `Numéro de commande : ${order.reference}`;
        pendingReference.hidden = false;
        pendingWhatsApp.hidden = false;
        pendingWhatsApp.href = `https://wa.me/262693600145?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;

        if (returnedReference && returnedReference !== order.reference) {
            pendingMessage.textContent = "La référence retournée par le service de paiement ne correspond pas à cette commande. Aucun paiement n’est confirmé.";
            return;
        }
        const provider = global.IARINTSOAWeroCheckout;
        if (!sessionId) {
            if (order.status === "payment_pending" && (!provider || provider.configured !== true)) {
                document.querySelector("#receipt-pending-title").textContent = "Préparation du paiement Wero";
                pendingMessage.textContent = `Votre commande ${order.reference} est enregistrée. L’intégration officielle Wero n’est pas encore configurée : aucun paiement n’a été initié ni confirmé. Contactez-nous sur WhatsApp pour convenir de la suite.`;
            } else {
                pendingMessage.textContent = "Aucune session de paiement vérifiable n’a été retournée. Votre commande reste enregistrée et aucun paiement n’est confirmé.";
            }
            return;
        }
        if (!sessionId || !order.sessionId || sessionId !== order.sessionId) {
            pendingMessage.textContent = "Le retour du service de paiement ne contient pas une session vérifiable pour cette commande. Aucun paiement n’est confirmé.";
            return;
        }

        if (!provider || provider.configured !== true || typeof provider.verifyPayment !== "function") {
            pendingMessage.textContent = "Le service de vérification Wero n’est pas configuré côté serveur. Aucun paiement n’est indiqué comme confirmé. Contactez-nous sur WhatsApp pour vérifier votre commande.";
            return;
        }

        pendingMessage.textContent = "Vérification du paiement auprès du service Wero…";
        try {
            const result = await provider.verifyPayment(sessionId, order.reference);
            if (!result || result.status !== "paid" || result.orderReference !== order.reference) {
                pendingMessage.textContent = "Le paiement n’a pas encore été confirmé par le service Wero. Votre commande reste en attente.";
                return;
            }

            order.status = "paid";
            order.paymentConfirmedAt = new Date().toISOString();
            let persistenceWarning = false;
            try {
                if (!global.IARINTSOAOrderStorage) {
                    throw new Error("Le stockage local des commandes n’est pas chargé.");
                }
                await global.IARINTSOAOrderStorage.updateOrder(order);
            } catch (error) {
                persistenceWarning = true;
            }
            try {
                global.localStorage.setItem(pendingOrderStorageKey, JSON.stringify(order));
                global.localStorage.removeItem(cartStorageKey);
                global.localStorage.removeItem(deliveryStorageKey);
                global.dispatchEvent(new CustomEvent("iarintsoa-cart-updated"));
            } catch (error) {
                persistenceWarning = true;
            }

            renderOrder(order);
            let recapNote = persistenceWarning
                ? "Le paiement est confirmé, mais la mise à jour ou le nettoyage du stockage local n’a pas abouti. Conservez votre numéro de commande."
                : "Le récapitulatif est prêt dans WhatsApp. Pour le transmettre, appuyez sur Envoyer dans l’application.";
            if (typeof provider.sendWhatsAppRecap === "function") {
                try {
                    const sent = await provider.sendWhatsAppRecap(order);
                    if (sent === true || (sent && sent.sent === true)) {
                        recapNote = "Le récapitulatif a été transmis sur WhatsApp. Vous pouvez également retrouver votre référence ci-dessus.";
                    }
                } catch (error) {
                    recapNote = "Le paiement est confirmé, mais l’envoi WhatsApp automatique n’a pas abouti. Utilisez le bouton ci-dessous pour transmettre le récapitulatif.";
                }
            }
            document.querySelector("#receipt-whatsapp-note").textContent = recapNote;
        } catch (error) {
            pendingMessage.textContent = "La vérification du paiement est temporairement indisponible. Votre commande reste en attente et aucun paiement n’est déclaré comme confirmé.";
        }
    }

    confirmOrder();
})(window);
