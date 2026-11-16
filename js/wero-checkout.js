(function (global) {
    "use strict";

    // Implement this adapter with same-origin server endpoints; never put Wero or WhatsApp credentials here.
    // createSession returns { checkoutUrl, sessionId }; verifyPayment must validate payment server-side.
    // sendWhatsAppRecap is optional and must use the WhatsApp Business API from the server.
    global.IARINTSOAWeroCheckout = Object.freeze({
        configured: false,
        paymentLink: "",
        qrCodeImage: "",
        createSession: null,
        verifyPayment: null,
        sendWhatsAppRecap: null
    });
})(window);
