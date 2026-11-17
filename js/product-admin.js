(function () {
    "use strict";

    const dataApi = window.IARINTSOAProductData;
    const connectButton = document.querySelector("#connect-directory");
    const refreshButton = document.querySelector("#refresh-catalog");
    const newProductButton = document.querySelector("#new-product");
    const productList = document.querySelector("#product-list");
    const productCount = document.querySelector("#product-count");
    const connectionStatus = document.querySelector("#connection-status");
    const productForm = document.querySelector("#product-form");
    const productFields = document.querySelector("#product-fields");
    const editorTitle = document.querySelector("#editor-title");
    const editorHint = document.querySelector("#editor-hint");
    const formStatus = document.querySelector("#form-status");
    const photoInput = document.querySelector("#photo-files");
    const photoList = document.querySelector("#photo-list");
    const promotionEnabled = document.querySelector("#promotion-enabled");
    const promotionFields = document.querySelector("#promotion-fields");
    const deleteButton = document.querySelector("#delete-product");
    const cancelButton = document.querySelector("#cancel-edit");
    const settingsDatabase = "iarintsoa-product-admin";
    const settingsStore = "settings";

    let productsDirectory = null;
    let catalog = null;
    let products = new Map();
    let activeProductId = null;
    let originalProduct = null;
    let photos = [];
    let mainPhotoIndex = 0;

    function setConnectionStatus(message, state) {
        connectionStatus.textContent = message;
        connectionStatus.dataset.state = state || "idle";
    }

    function setFormStatus(message) {
        formStatus.textContent = message;
    }

    function openSettingsDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(settingsDatabase, 1);
            request.addEventListener("upgradeneeded", () => {
                if (!request.result.objectStoreNames.contains(settingsStore)) {
                    request.result.createObjectStore(settingsStore);
                }
            });
            request.addEventListener("success", () => resolve(request.result), { once: true });
            request.addEventListener("error", () => reject(request.error || new Error("Impossible d’ouvrir le stockage local.")), { once: true });
        });
    }

    async function readSavedDirectory() {
        const database = await openSettingsDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(settingsStore, "readonly");
            const request = transaction.objectStore(settingsStore).get("products-directory");
            request.addEventListener("success", () => resolve(request.result || null), { once: true });
            request.addEventListener("error", () => reject(request.error || new Error("Impossible de lire le dossier mémorisé.")), { once: true });
            transaction.addEventListener("complete", () => database.close(), { once: true });
        });
    }

    async function rememberDirectory(directory) {
        const database = await openSettingsDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(settingsStore, "readwrite");
            transaction.objectStore(settingsStore).put(directory, "products-directory");
            transaction.addEventListener("complete", () => {
                database.close();
                resolve();
            }, { once: true });
            transaction.addEventListener("error", () => {
                database.close();
                reject(transaction.error || new Error("Le navigateur n’a pas pu mémoriser ce dossier."));
            }, { once: true });
        });
    }

    async function readJsonFile(fileHandle) {
        const file = await fileHandle.getFile();
        try {
            return JSON.parse(await file.text());
        } catch (error) {
            throw new Error(`Le fichier ${file.name} contient un JSON invalide : ${error.message}`);
        }
    }

    async function writeJsonFile(fileName, data) {
        const fileHandle = await productsDirectory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
            await writable.write(`${JSON.stringify(data, null, 2)}\n`);
            await writable.close();
        } catch (error) {
            await writable.abort();
            throw error;
        }
    }

    async function loadCatalog() {
        if (!productsDirectory) {
            throw new Error("Connectez d’abord le dossier data/products.");
        }

        const indexHandle = await productsDirectory.getFileHandle("index.json");
        const loadedCatalog = dataApi.validateCatalogDocument(await readJsonFile(indexHandle));
        const loadedProducts = new Map();

        for (const id of loadedCatalog.products) {
            const productHandle = await productsDirectory.getFileHandle(`${id}.json`);
            const product = dataApi.validateProductDocument(await readJsonFile(productHandle), id);
            loadedProducts.set(id, product);
        }

        catalog = loadedCatalog;
        products = loadedProducts;
        renderProductList();
        productFields.disabled = false;
        refreshButton.disabled = false;
        newProductButton.disabled = false;
        setConnectionStatus(
            `Dossier connecté · ${productsDirectory.name} · ${products.size} produit${products.size === 1 ? "" : "s"} chargé${products.size === 1 ? "" : "s"}.`,
            "connected"
        );
        if (!activeProductId && !products.size) {
            startNewProduct();
        }
    }

    function formatPrice(price, currency) {
        if (price === null || price === undefined) return "Prix sur demande";
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: currency || "EUR"
        }).format(price);
    }

    function photoSource(photo) {
        return typeof photo === "string" ? photo : photo && (photo.src || photo.dataUrl || photo.path);
    }

    function renderProductList() {
        productList.replaceChildren();
        const orderedProducts = Array.from(products.values()).sort((first, second) =>
            Number(Boolean(second.featured)) - Number(Boolean(first.featured))
                || first.name.localeCompare(second.name, "fr")
        );
        productCount.textContent = `${products.size} produit${products.size === 1 ? "" : "s"} dans le catalogue`;

        if (!orderedProducts.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "Le catalogue est vide. Utilisez « Ajouter » pour créer votre première fiche.";
            productList.append(empty);
            return;
        }

        orderedProducts.forEach((product) => {
            const button = document.createElement("button");
            const image = document.createElement("img");
            const copy = document.createElement("span");
            const name = document.createElement("strong");
            const price = document.createElement("span");
            const badges = document.createElement("span");

            button.className = "admin-list-button";
            button.type = "button";
            button.dataset.productId = product.id;
            button.setAttribute("aria-current", String(product.id === activeProductId));
            const src = photoSource(product.photos[0]);
            if (src) {
                image.loading = "lazy";
                image.src = src;
                image.alt = "";
                image.decoding = "async";
                button.append(image);
            } else {
                const placeholder = document.createElement("span");
                placeholder.className = "admin-list-placeholder";
                placeholder.textContent = product.name.slice(0, 1);
                button.append(placeholder);
            }

            copy.className = "admin-list-copy";
            name.textContent = product.name;
            price.textContent = formatPrice(
                product.promotion && Number.isFinite(product.promotionPrice) ? product.promotionPrice : product.price,
                product.currency
            );
            copy.append(name, price);
            button.append(copy);

            badges.className = "admin-list-badges";
            if (product.featured) {
                const badge = document.createElement("span");
                badge.className = "admin-list-badge";
                badge.textContent = "Vedette";
                badges.append(badge);
            }
            if (product.promotion) {
                const badge = document.createElement("span");
                badge.className = "admin-list-badge";
                badge.textContent = "Promo";
                badges.append(badge);
            }
            button.append(badges);
            button.addEventListener("click", () => editProduct(product.id));
            productList.append(button);
        });
    }

    function normalizePhoto(photo) {
        if (typeof photo === "string") {
            return { src: photo, alt: "" };
        }
        return {
            ...photo,
            src: photo.src || photo.dataUrl || photo.path,
            alt: photo.alt || ""
        };
    }

    function renderPhotos() {
        photoList.replaceChildren();
        if (!photos.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "Ajoutez au moins une photo pour enregistrer ce produit.";
            photoList.append(empty);
            return;
        }

        photos.forEach((photo, index) => {
            const card = document.createElement("div");
            const image = document.createElement("img");
            const name = document.createElement("span");
            const actions = document.createElement("div");
            const mainLabel = document.createElement("label");
            const radio = document.createElement("input");
            const mainText = document.createElement("span");
            const remove = document.createElement("button");

            card.className = "admin-photo-card";
            card.dataset.main = String(index === mainPhotoIndex);
            image.loading = "lazy";
            image.src = photo.src;
            image.alt = photo.alt;
            image.decoding = "async";
            name.className = "admin-photo-name";
            name.textContent = photo.name || photo.src.split("/").pop().slice(0, 40);

            actions.className = "admin-photo-actions";
            mainLabel.className = "admin-photo-main";
            radio.type = "radio";
            radio.name = "main-photo";
            radio.value = String(index);
            radio.checked = index === mainPhotoIndex;
            radio.setAttribute("aria-label", `Choisir ${name.textContent} comme photo principale`);
            radio.addEventListener("change", () => {
                mainPhotoIndex = index;
                renderPhotos();
            });
            mainText.textContent = "Principale";
            mainLabel.append(radio, mainText);

            remove.className = "admin-photo-remove";
            remove.type = "button";
            remove.textContent = "Retirer";
            remove.setAttribute("aria-label", `Retirer la photo ${index + 1}`);
            remove.addEventListener("click", () => {
                photos.splice(index, 1);
                if (mainPhotoIndex === index) mainPhotoIndex = Math.max(0, photos.length - 1);
                else if (mainPhotoIndex > index) mainPhotoIndex -= 1;
                renderPhotos();
            });

            actions.append(mainLabel, remove);
            card.append(image, name, actions);
            photoList.append(card);
        });
    }

    function setFormValue(name, value) {
        productForm.elements.namedItem(name).value = value === null || value === undefined ? "" : String(value);
    }

    function populateEditor(product, editingId) {
        productForm.reset();
        activeProductId = editingId;
        originalProduct = product ? JSON.parse(JSON.stringify(product)) : null;
        productFields.disabled = false;
        setFormStatus("");

        const value = product || {
            id: "",
            name: "",
            tagline: "",
            price: null,
            currency: "EUR",
            promotion: null,
            promotionPrice: null,
            texture: "",
            photos: [],
            lengths: [],
            defaultLength: null,
            lace: null,
            density: null,
            stock: null,
            description: "",
            characteristics: [],
            similarProducts: [],
            featured: false
        };

        setFormValue("id", value.id);
        productForm.elements.namedItem("id").readOnly = Boolean(editingId);
        setFormValue("name", value.name);
        setFormValue("tagline", value.tagline);
        setFormValue("price", value.price);
        setFormValue("currency", value.currency || "EUR");
        setFormValue("promotion", value.promotion);
        setFormValue("promotionPrice", value.promotionPrice);
        setFormValue("texture", value.texture);
        setFormValue("lace", value.lace);
        setFormValue("density", value.density);
        setFormValue("stock", value.stock);
        setFormValue("lengths", value.lengths.join(", "));
        setFormValue("defaultLength", value.defaultLength);
        setFormValue("description", value.description);
        setFormValue("characteristics", value.characteristics.join("\n"));
        setFormValue("similarProducts", value.similarProducts.join("\n"));
        promotionEnabled.checked = Boolean(value.promotion);
        promotionFields.hidden = !promotionEnabled.checked;
        productForm.elements.namedItem("promotion").required = promotionEnabled.checked;
        productForm.elements.namedItem("promotionPrice").required = promotionEnabled.checked;
        productForm.elements.namedItem("featured").checked = Boolean(value.featured);

        photos = value.photos.map(normalizePhoto);
        mainPhotoIndex = 0;
        photoInput.value = "";
        deleteButton.disabled = !editingId;
        editorTitle.textContent = editingId ? `Modifier ${value.name}` : "Ajouter un produit";
        editorHint.textContent = editingId
            ? `Fiche ${editingId}. Vos modifications seront écrites dans ${editingId}.json.`
            : "Complétez la fiche, choisissez sa photo principale, puis enregistrez.";
        renderPhotos();
        renderProductList();
    }

    function editProduct(id) {
        const product = products.get(id);
        if (!product) {
            setConnectionStatus(`Le produit « ${id} » n’est plus présent dans le catalogue. Actualisez les données.`, "error");
            return;
        }
        populateEditor(product, id);
    }

    function startNewProduct() {
        if (!productsDirectory) {
            setConnectionStatus("Connectez d’abord le dossier data/products.", "error");
            return;
        }
        populateEditor(null, null);
    }

    function clearEditor() {
        activeProductId = null;
        originalProduct = null;
        photos = [];
        mainPhotoIndex = 0;
        productForm.reset();
        productForm.elements.namedItem("id").readOnly = false;
        productFields.disabled = true;
        deleteButton.disabled = true;
        promotionFields.hidden = true;
        editorTitle.textContent = "Prêt à gérer vos produits ?";
        editorHint.textContent = "Sélectionnez un produit ou créez-en un nouveau.";
        setFormStatus("");
        renderPhotos();
        renderProductList();
    }

    function parseLengths(value) {
        if (!value.trim()) return [];
        return value.split(/[,\s;]+/).filter(Boolean).map(Number);
    }

    function parseList(value) {
        return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    }

    function numberOrNull(value) {
        if (value.trim() === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function getProductFromForm() {
        if (!productForm.reportValidity()) return null;
        const id = productForm.elements.namedItem("id").value.trim();
        if (!dataApi.isProductId(id)) throw new Error("L’identifiant doit contenir uniquement des minuscules, chiffres et tirets.");
        if (!activeProductId && products.has(id)) throw new Error(`L’identifiant « ${id} » existe déjà.`);

        const name = productForm.elements.namedItem("name").value.trim();
        const description = productForm.elements.namedItem("description").value.trim();
        const lengths = parseLengths(productForm.elements.namedItem("lengths").value);
        if (lengths.some((length) => !Number.isFinite(length) || length <= 0)
            || new Set(lengths).size !== lengths.length) {
            throw new Error("Saisissez des longueurs positives et uniques, séparées par des virgules.");
        }
        const defaultLength = numberOrNull(productForm.elements.namedItem("defaultLength").value);
        if (Number.isNaN(defaultLength) || (defaultLength !== null && !lengths.includes(defaultLength))) {
            throw new Error("La longueur par défaut doit être présente parmi les longueurs disponibles.");
        }

        const price = numberOrNull(productForm.elements.namedItem("price").value);
        const density = numberOrNull(productForm.elements.namedItem("density").value);
        const stock = numberOrNull(productForm.elements.namedItem("stock").value);
        if (Number.isNaN(price) || (price !== null && price < 0)) throw new Error("Le prix doit être positif ou laissé vide.");
        if (Number.isNaN(density) || (density !== null && density < 0)) throw new Error("La densité doit être positive ou laissée vide.");
        if (Number.isNaN(stock) || (stock !== null && (!Number.isInteger(stock) || stock < 0))) {
            throw new Error("Le stock doit être un nombre entier positif ou laissé vide.");
        }
        if (!name || !description) throw new Error("Le nom et la description sont obligatoires.");
        if (!photos.length) throw new Error("Ajoutez au moins une photo au produit.");

        const promotion = promotionEnabled.checked
            ? productForm.elements.namedItem("promotion").value.trim()
            : null;
        const promotionPrice = promotionEnabled.checked
            ? numberOrNull(productForm.elements.namedItem("promotionPrice").value)
            : null;
        if (promotionEnabled.checked && (!promotion || price === null || promotionPrice === null
            || Number.isNaN(promotionPrice) || promotionPrice < 0 || promotionPrice >= price)) {
            throw new Error("Une promotion nécessite un libellé et un prix inférieur au prix normal.");
        }

        const similarProducts = parseList(productForm.elements.namedItem("similarProducts").value);
        if (new Set(similarProducts).size !== similarProducts.length
            || similarProducts.some((similarId) => !dataApi.isProductId(similarId)
                || similarId === id || (!products.has(similarId) && similarId !== activeProductId))) {
            throw new Error("Les produits similaires doivent être des identifiants existants, uniques et différents de cette fiche.");
        }

        const orderedPhotos = photos.map((photo) => ({ ...photo }));
        const mainPhoto = orderedPhotos.splice(mainPhotoIndex, 1)[0];
        orderedPhotos.unshift(mainPhoto);

        const product = {
            ...(originalProduct || {}),
            id,
            name,
            tagline: productForm.elements.namedItem("tagline").value.trim() || description,
            price,
            currency: productForm.elements.namedItem("currency").value.trim().toUpperCase(),
            priceLabel: originalProduct && originalProduct.priceLabel ? originalProduct.priceLabel : "À partir de",
            promotion,
            promotionPrice,
            texture: productForm.elements.namedItem("texture").value.trim(),
            photos: orderedPhotos.map((photo) => ({
                src: photo.src,
                alt: photo.alt || `Perruque ${name}`,
                ...(photo.name ? { name: photo.name } : {})
            })),
            lengths,
            defaultLength,
            lace: productForm.elements.namedItem("lace").value.trim() || null,
            density,
            stock,
            description,
            characteristics: parseList(productForm.elements.namedItem("characteristics").value),
            similarProducts,
            featured: productForm.elements.namedItem("featured").checked
        };

        // Les tarifs par longueur ne sont pas encore modifiables dans ce formulaire : on conserve
        // uniquement ceux des longueurs toujours proposées, sinon la validation bloquerait l'enregistrement.
        if (product.pricesByLength) {
            product.pricesByLength = Object.fromEntries(Object.entries(product.pricesByLength)
                .filter(([length]) => lengths.includes(Number(length))));
        }

        dataApi.validateProductDocument({
            format: "iarintsoa-product",
            version: 1,
            product
        }, id);
        return product;
    }

    async function saveProduct(event) {
        event.preventDefault();
        setFormStatus("");

        try {
            const product = getProductFromForm();
            if (!product) return;
            const isNew = !activeProductId;
            await writeJsonFile(`${product.id}.json`, {
                format: "iarintsoa-product",
                version: 1,
                product
            });

            if (isNew) {
                const updatedCatalog = {
                    ...catalog,
                    products: [...catalog.products, product.id]
                };
                try {
                    await writeJsonFile("index.json", updatedCatalog);
                } catch (error) {
                    throw new Error(`La fiche ${product.id}.json a été écrite, mais l’index du catalogue n’a pas pu être mis à jour : ${error.message}`);
                }
            }

            await loadCatalog();
            editProduct(product.id);
            setFormStatus(`Fiche enregistrée dans data/products/${product.id}.json.`);
        } catch (error) {
            setFormStatus(`Enregistrement impossible : ${error.message}`);
        }
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                if (typeof reader.result === "string") resolve(reader.result);
                else reject(new Error(`Lecture impossible pour ${file.name}.`));
            }, { once: true });
            reader.addEventListener("error", () => reject(reader.error || new Error(`Lecture impossible pour ${file.name}.`)), { once: true });
            reader.readAsDataURL(file);
        });
    }

    async function optimizePhoto(file) {
        if (typeof createImageBitmap !== "function" || file.size < 450 * 1024) {
            return readFileAsDataUrl(file);
        }

        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
            bitmap.close();
            return readFileAsDataUrl(file);
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const compressed = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .86));
        if (!compressed || compressed.size >= file.size) return readFileAsDataUrl(file);
        return readFileAsDataUrl(compressed);
    }

    async function addPhotos() {
        const files = Array.from(photoInput.files);
        photoInput.value = "";
        if (!files.length) return;
        if (files.some((file) => !file.type.startsWith("image/"))) {
            setFormStatus("Sélectionnez uniquement des fichiers image.");
            return;
        }

        setFormStatus(`Optimisation de ${files.length} photo${files.length === 1 ? "" : "s"}…`);
        try {
            for (const file of files) {
                const src = await optimizePhoto(file);
                photos.push({
                    src,
                    alt: `Perruque ${productForm.elements.namedItem("name").value.trim() || "IARINTSOA Hair"}`,
                    name: file.name
                });
            }
            if (photos.length === files.length) mainPhotoIndex = 0;
            renderPhotos();
            setFormStatus(`${files.length} photo${files.length === 1 ? "" : "s"} ajoutée${files.length === 1 ? "" : "s"}. Choisissez la photo principale.`);
        } catch (error) {
            setFormStatus(`Chargement des photos impossible : ${error.message}`);
        }
    }

    async function deleteProduct() {
        if (!activeProductId || !catalog) return;
        const id = activeProductId;
        if (!window.confirm(`Supprimer « ${products.get(id).name} » du catalogue ? Cette action retire aussi son fichier JSON.`)) return;

        deleteButton.disabled = true;
        setFormStatus("Suppression en cours…");
        try {
            for (const otherId of catalog.products) {
                if (otherId === id) continue;
                const other = products.get(otherId);
                if (other.similarProducts.includes(id)) {
                    await writeJsonFile(`${otherId}.json`, {
                        format: "iarintsoa-product",
                        version: 1,
                        product: {
                            ...other,
                            similarProducts: other.similarProducts.filter((similarId) => similarId !== id)
                        }
                    });
                }
            }

            const updatedCatalog = {
                ...catalog,
                products: catalog.products.filter((productId) => productId !== id)
            };
            await writeJsonFile("index.json", updatedCatalog);
            await productsDirectory.removeEntry(`${id}.json`);
            clearEditor();
            await loadCatalog();
            setFormStatus(`Le produit ${id} et ses références ont été supprimés du catalogue.`);
        } catch (error) {
            setFormStatus(`Suppression incomplète : ${error.message} Actualisez le catalogue pour vérifier son état.`);
            deleteButton.disabled = false;
        }
    }

    async function connectDirectory() {
        if (typeof window.showDirectoryPicker !== "function") {
            setConnectionStatus("Ce navigateur ne permet pas l’écriture directe dans un dossier. Utilisez Chrome ou Edge sur ordinateur, puis reconnectez data/products.", "error");
            return;
        }

        try {
            if (!productsDirectory) {
                productsDirectory = await window.showDirectoryPicker({
                    id: "iarintsoa-hair-products",
                    mode: "readwrite"
                });
            }

            let permission = await productsDirectory.queryPermission({ mode: "readwrite" });
            if (permission !== "granted") {
                permission = await productsDirectory.requestPermission({ mode: "readwrite" });
            }
            if (permission !== "granted") {
                throw new Error("L’autorisation de lecture et d’écriture n’a pas été accordée.");
            }

            await loadCatalog();
            connectButton.textContent = "Dossier connecté";
            try {
                await rememberDirectory(productsDirectory);
            } catch (error) {
                setConnectionStatus(
                    `Dossier connecté pour cette session. Le navigateur n’a pas pu mémoriser l’autorisation : ${error.message}`,
                    "error"
                );
            }
        } catch (error) {
            if (error.name === "AbortError") {
                setConnectionStatus("Connexion annulée. Aucun fichier n’a été modifié.", "idle");
                return;
            }
            setConnectionStatus(`Connexion impossible : ${error.message}`, "error");
        }
    }

    async function initialize() {
        if (typeof window.showDirectoryPicker !== "function") {
            setConnectionStatus("L’administration avec écriture directe des JSON nécessite Chrome ou Edge sur ordinateur. La boutique publique reste consultable normalement.", "error");
            connectButton.disabled = true;
            return;
        }

        try {
            const savedDirectory = await readSavedDirectory();
            if (!savedDirectory) return;
            productsDirectory = savedDirectory;
            connectButton.textContent = "Réautoriser data/products";
            const permission = await productsDirectory.queryPermission({ mode: "readwrite" });
            if (permission === "granted") {
                await loadCatalog();
                connectButton.textContent = "Dossier connecté";
            } else {
                setConnectionStatus("Dossier mémorisé. Cliquez sur « Réautoriser data/products » pour reprendre la gestion.", "idle");
            }
        } catch (error) {
            setConnectionStatus(`Le dossier mémorisé n’a pas pu être rouvert : ${error.message}. Reconnectez data/products.`, "error");
        }
    }

    connectButton.addEventListener("click", connectDirectory);
    refreshButton.addEventListener("click", async () => {
        try {
            await loadCatalog();
            if (activeProductId && products.has(activeProductId)) editProduct(activeProductId);
            else clearEditor();
            setFormStatus("Catalogue actualisé depuis les fichiers JSON.");
        } catch (error) {
            setConnectionStatus(`Actualisation impossible : ${error.message}`, "error");
        }
    });
    newProductButton.addEventListener("click", startNewProduct);
    cancelButton.addEventListener("click", () => {
        if (activeProductId && products.has(activeProductId)) editProduct(activeProductId);
        else clearEditor();
    });
    deleteButton.addEventListener("click", deleteProduct);
    productForm.addEventListener("submit", saveProduct);
    photoInput.addEventListener("change", addPhotos);
    promotionEnabled.addEventListener("change", () => {
        promotionFields.hidden = !promotionEnabled.checked;
        productForm.elements.namedItem("promotion").required = promotionEnabled.checked;
        productForm.elements.namedItem("promotionPrice").required = promotionEnabled.checked;
    });

    initialize();
})();
