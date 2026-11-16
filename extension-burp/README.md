# SuperArtex Burp Suite extension

Pushes Burp Proxy traffic into a SuperArtex instance through the same
`/api/traffic/ingest` endpoint the browser extension uses. Manual, Burp-driven
testing on authenticated targets — logins, captcha, 2FA flows — becomes
agent-visible evidence in the SuperArtex Traffic page, searchable and bindable
to findings.

## Build

Requires a JDK and the legacy Burp Extender API jar (on Maven Central):

```bash
cd extension-burp
curl -LO https://repo1.maven.org/maven2/net/portswigger/burp/extender/burp-extender-api/2.1/burp-extender-api-2.1.jar
javac -cp burp-extender-api-2.1.jar -d . SuperArtexBurp.java
jar cf SuperArtexBurp.jar superartex
```

A prebuilt `SuperArtexBurp.jar` is committed alongside this README, so you can
skip the build and load it directly.

## Load

Burp Suite → Extensions → Add:

- Extension type: **Java**
- Extension file: `extension-burp/SuperArtexBurp.jar`

## Use

1. Open the **SuperArtex** tab in Burp.
2. Enter your SuperArtex base URL (for example `http://127.0.0.1:8787`) and an
   API token (Settings → mint a JWT, or the token your browser session uses).
3. Press **Start**. Browse through the Burp Proxy as usual.
4. Text request/response pairs are batched (10 per request, bodies capped at
   256 KiB, binary content-types skipped) and stored exactly like proxy-captured
   traffic. Press **Stop** to flush the queue.

The settings persist with the Burp project; the capture toggle is per session.
Only run this against targets you are authorized to test.
