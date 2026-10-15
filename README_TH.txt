SmartExpiry Mobile QR Fix v3

1. Upload index.html, app.js, style.css, firebase-config.js to ROOT of GitHub repo Smart_Expiry.
2. Confirm deployment is finished under GitHub Actions / Pages.
3. Scan NEW QR images in QR_Codes (old printed QR may keep an old link or cached browser).
4. On phone open in Chrome or Safari, not in-app browser.
5. New user -> Google Login -> product details -> Add; signed-in user -> product details -> Add.
6. QR URLs include &v=20261015-3 to reduce cached document reuse; index.html loads versioned JS and CSS.
7. Firebase config is public client config. Firestore rules must be published in Firebase Console.
8. This package has not been tested with your live Firebase account.
