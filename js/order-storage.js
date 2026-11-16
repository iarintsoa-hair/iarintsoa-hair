(function (global) {
    "use strict";

    const databaseName = "iarintsoa-hair-orders";
    const databaseVersion = 1;
    const storeName = "orders";
    let databasePromise = null;

    function openDatabase() {
        if (!global.indexedDB) {
            return Promise.reject(new Error("La base locale des commandes n’est pas disponible dans ce navigateur."));
        }
        if (databasePromise) return databasePromise;

        databasePromise = new Promise((resolve, reject) => {
            const request = global.indexedDB.open(databaseName, databaseVersion);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(storeName)) {
                    database.createObjectStore(storeName, { keyPath: "reference" });
                }
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    databasePromise = null;
                };
                resolve(database);
            };
            request.onerror = () => {
                databasePromise = null;
                reject(new Error("Impossible d’ouvrir la base locale des commandes."));
            };
            request.onblocked = () => {
                databasePromise = null;
                reject(new Error("La base locale est bloquée par un autre onglet. Fermez les autres pages de la boutique et réessayez."));
            };
        });
        return databasePromise;
    }

    function validateReference(reference) {
        if (typeof reference !== "string" || !/^IAR-[A-Z0-9-]+$/.test(reference)) {
            throw new Error("Le numéro de commande est invalide.");
        }
    }

    function writeOrder(order, method) {
        if (!order || typeof order !== "object") {
            return Promise.reject(new Error("La commande à enregistrer est invalide."));
        }
        try {
            validateReference(order.reference);
        } catch (error) {
            return Promise.reject(error);
        }

        return openDatabase().then((database) => new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, "readwrite");
            transaction.objectStore(storeName)[method](order);
            transaction.oncomplete = () => resolve(order);
            transaction.onerror = () => reject(new Error("La commande n’a pas pu être enregistrée dans la base locale."));
            transaction.onabort = () => reject(new Error("L’enregistrement de la commande a été interrompu."));
        }));
    }

    function createOrder(order) {
        return writeOrder(order, "add");
    }

    function updateOrder(order) {
        return writeOrder(order, "put");
    }

    function getOrder(reference) {
        try {
            validateReference(reference);
        } catch (error) {
            return Promise.reject(error);
        }

        return openDatabase().then((database) => new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, "readonly");
            const request = transaction.objectStore(storeName).get(reference);
            let order = null;
            request.onsuccess = () => {
                order = request.result || null;
            };
            request.onerror = () => reject(new Error("Impossible de lire la commande dans la base locale."));
            transaction.oncomplete = () => resolve(order);
            transaction.onerror = () => reject(new Error("La lecture de la commande a échoué."));
            transaction.onabort = () => reject(new Error("La lecture de la commande a été interrompue."));
        }));
    }

    global.IARINTSOAOrderStorage = Object.freeze({
        createOrder,
        updateOrder,
        getOrder
    });
})(window);
