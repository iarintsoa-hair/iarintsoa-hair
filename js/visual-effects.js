(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (reducedMotion.matches || !("IntersectionObserver" in window)) return;

    const revealSelectors = [
        ".home-trust-item",
        ".home-products-grid .product-card",
        ".home-benefit-card",
        ".home-faq-item",
        ".home-social-card",
        ".home-footer-main > div",
        ".product-breadcrumb",
        ".product-gallery",
        ".product-summary",
        ".product-information > div",
        ".related-card",
        ".cart-item",
        ".cart-summary",
        ".cart-empty",
        ".checkout-progress",
        ".checkout-heading",
        ".checkout-panel",
        ".checkout-terms-section",
        ".checkout-actions",
        ".checkout-order-summary",
        ".receipt-pending",
        ".receipt-confirmed",
        ".admin-hero",
        ".admin-panel"
    ].join(",");
    const observed = new WeakSet();
    const intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            intersectionObserver.unobserve(entry.target);
        });
    }, {
        rootMargin: "0px 0px -24px 0px",
        threshold: 0.06
    });

    document.documentElement.classList.add("has-motion-reveal");

    function observeRevealElements() {
        document.querySelectorAll(revealSelectors).forEach((element) => {
            if (observed.has(element) || element.closest("[hidden]")) return;
            observed.add(element);
            element.classList.add("motion-reveal");
            intersectionObserver.observe(element);
        });
    }

    let scanScheduled = false;
    const mutationObserver = new MutationObserver(() => {
        if (scanScheduled) return;
        scanScheduled = true;
        window.requestAnimationFrame(() => {
            scanScheduled = false;
            observeRevealElements();
        });
    });

    observeRevealElements();
    mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["hidden"],
        childList: true,
        subtree: true
    });
})();
