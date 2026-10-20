# BudgetUP

A personal budget tracker and group expense splitter for iOS and Android (web too), built with
Expo and React Native. Everything runs on the phone: no account, no backend, no API keys, and
receipt scanning works offline.

## Features

- **Monthly budget**: set a limit per month, add, edit and delete expenses, and see spent /
  remaining with a progress bar and a spending-by-category chart. Switch between months.
- **Voice input**: say "coffee twelve dollars" or "groceries 45.50" and the form is filled in
  for you to review.
- **Group split calculator**: enter who paid what; BudgetUP splits the total equally and works
  out the fewest payments to settle up, with leftover cents assigned deterministically. Splits
  are saved to a history.
- **Receipt scanning**: take or choose a photo; the receipt is read on the device and the
  merchant, date, total, tax and line items are filled in. Fields the parser is unsure about
  are highlighted for review, and a mismatch between items and total is shown, never "fixed".
  Receipt expenses expand into an itemised tile with the photo.
- **Pending inbox**: transactions arriving from outside the app (an iOS Shortcuts automation
  via a `budgetup://import` deep link) wait in an inbox to be approved, edited or discarded.
  Likely duplicates are flagged, and merchant-to-category rules are applied automatically.

## Screenshots

| Budget | Add expense | Receipt review | Split |
|---|---|---|---|
| _screenshot_ | _screenshot_ | _screenshot_ | _screenshot_ |

<!-- Add images to docs/screenshots/ and replace the placeholders, e.g.
     ![Budget](docs/screenshots/budget.png) -->

## Tech stack

- **Expo SDK 58**, React Native 0.88 (New Architecture), React 19, **TypeScript** (strict)
- **Expo Router** (file-based navigation)
- **expo-sqlite** for storage (SQLite on device, WASM + OPFS on web)
- **expo-speech-recognition** (native) and the Web Speech API (web) for voice input
- **expo-image-picker**, **expo-image-manipulator**, **expo-file-system** for receipt photos
- A small local Expo module (`modules/receipt-ocr`) for on-device text recognition:
  **Apple Vision** on iOS, **Google ML Kit** on Android
- Unit tests with Node's built-in test runner (`node --test`); UI flows with Maestro

## Architecture

- **Local-first.** All data lives in SQLite on the device. Money is stored as integer cents.
- **Sync-ready data model.** Every table uses a UUID primary key plus `created_at`,
  `updated_at` and a `deleted_at` tombstone, so a future sync backend needs no schema rewrite.
  Migrations are append-only (`src/storage/schema.ts`).
- **Pure logic, separately tested.** Budget maths, settlement, voice parsing, import parsing,
  receipt parsing and amount formatting live in `src/utils/` with no React Native imports, and
  run under `node --test`.
- **Receipt pipeline behind an interface.** Screens only talk to a `ReceiptParser`
  (`src/utils/receiptParser.ts`). The default implementation runs OCR on the device, rebuilds
  the receipt's printed rows from the text positions (straightening tilted photos), then parses
  them: the total comes from a keyword line and is cross-checked against the items, and each
  field gets a confidence level that the review form shows. Another backend (for example a
  server-side vision model) can be swapped in without touching the UI.
- **Importers behind an interface.** Every import source produces the same
  `{ amount, merchant, date, source }` payload and goes through the pending inbox.

```
src/
  app/          routes (Expo Router)
  screens/      screen components
  components/   UI pieces (platform splits as *.native.tsx / *.web.tsx)
  storage/      SQLite schema, migrations and repositories
  utils/        pure, unit-tested logic + receipt and import pipelines
  __tests__/    node --test suites and OCR fixtures
modules/
  receipt-ocr/  on-device OCR (Swift / Kotlin) returning text lines with positions
```

## Getting started

### Requirements

- Node.js 20 or newer
- iOS: macOS with Xcode and CocoaPods
- Android: Android Studio with an emulator or a device. Gradle needs **JDK 17 or 21**; Android
  Studio's bundled JDK works:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`

The app uses native modules, so it runs in a development build, not in Expo Go.

### Run

```bash
npm install

npm run ios       # build and run on the iOS simulator
npm run android   # build and run on an Android emulator or device
npm run web       # run in the browser
```

The first native build takes a while; after that `npx expo start` is enough until native code
or `app.json` changes. To try receipt scanning on a simulator, add a receipt photo to its
library first (iOS: `xcrun simctl addmedia booted receipt.jpg`, or drag it onto the simulator).
The camera needs a real device.

### Test

```bash
npm test             # unit tests
npm run typecheck    # TypeScript
maestro test .maestro/receipt-flow.yaml   # UI flow (needs a receipt photo in the library)
```

### Environment

No environment variables are required. See `.env.example` for the optional development flag.

### Tester builds (EAS)

`eas.json` defines three profiles: `development` (development client), `preview` (internal
distribution, Android APK) and `production`. Example:

```bash
npx eas-cli@latest build --profile preview --platform android
```

## Roadmap

- Currency support: show and convert receipt currencies
- Edit saved splits
- Android notification-listener importer for the pending inbox
- Optional sync backend (authenticated API) using the existing UUID / `updated_at` model
- Higher-accuracy receipt parsing as an optional, pluggable backend

## License

[MIT](LICENSE) © Anwar Tabrez
