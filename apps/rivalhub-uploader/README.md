# RivalHub Demo Uploader

A small pywebview desktop client that exports local `.dem` recordings, builds the existing `rivalhub-demo-evidence/1` payload, and submits it to the connected RivalHub site. The package shares the evidence, matching, and HTTP client code with DAK Studio.

## Development

From the workspace root:

```sh
pnpm dev:uploader
pnpm build:uploader
```

The Vite page shows a preview. File selection, parsing, secure credential storage, and network calls require the desktop bridge.

## Package the desktop app

```sh
bash scripts/package-uploader.sh
```

This builds an unsigned macOS app and DMG on macOS, or a Windows onedir ZIP on Windows. The DMG/ZIP and unpacked runtime sizes are printed after packaging. A matching native machine and Python environment are required for each platform.

## User support

The window explains the connection and upload steps. Each failed item shows its diagnostic code and a suggested next step; the upload list can open the connected RivalHub site. The **Export diagnostic log** button saves a rotating log from the user's application data directory. The log records task IDs, phases, parser errors, and HTTP status codes; it does not record bearer tokens, evidence bodies, or Demo contents.

macOS stores the token in Keychain. Windows stores it in Credential Manager. Only the RivalHub address and pairing ID are kept in the application data directory. The generated ZIP is held in an app-owned temporary directory and removed after each Demo finishes or the app closes.
