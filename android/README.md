# The Android build — a reader, not a host

Lantern on Android **joins** a library; it does not serve one. Serving needs a Node
runtime on the device, and the point of the app is that one cheap computer serves
the room. So the Android app is a Trusted Web Activity over the same page
everyone else opens.

## What has to be true before it can be built

1. **The page is installable.** `docs/play/manifest.webmanifest` carries the name,
   a 192 and a 512 icon, and `display: standalone`. `verify.py` checks this.
2. **The origin vouches for the app.** A TWA shows the page without a browser
   chrome only if the site names the app's signing certificate at
   `https://drsamonline.github.io/.well-known/assetlinks.json` — in the **root**
   of the origin, not under `/app-lantern/`. It cannot be written until the
   keystore exists, because the file must carry that keystore's SHA-256
   fingerprint. A placeholder there is worse than nothing: it fails silently and
   the app opens with a URL bar.

## The build

    npm install --global @bubblewrap/cli
    bubblewrap init --manifest https://drsamonline.github.io/app-lantern/play/manifest.webmanifest
    # it reads android/twa-manifest.json for the ids, then:
    bubblewrap build

The keystore is created once, kept out of the repository, and its fingerprint
goes into `assetlinks.json`:

    keytool -list -v -keystore android.keystore -alias lantern | grep SHA256

## Why there is no `assetlinks.json` in this repository

Because a wrong one is invisible. The TWA falls back to a browser tab, everything
looks fine, and the only symptom is a URL bar nobody notices. The file is written
when the key exists, from the key's own fingerprint.
