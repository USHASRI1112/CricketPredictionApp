This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

## Voroa backend

All server code lives in `backend/`. It replaces Firebase Functions:

- `GET /config/cric-api` returns `{ "apiKey": "..." }`. The React Native app
  still calls Cric API directly and refreshes this configuration every five minutes.
  This endpoint is intentionally public; the Cric key is readable by app users.
- `POST /predictMatch` accepts the existing `{ "data": { ...matchDetails } }`
  request and returns `{ "result": { ...prediction } }` using Groq.
- A scheduler runs every minute with the existing activity gates, API quota guards,
  live-score caching, and Firebase Cloud Messaging notification logic.
- `GET /health` is the service health check.

Firestore and FCM remain in Firebase. The backend uses the Admin SDK with a service
account; it does not use Firebase Functions or require Blaze for hosting compute.
Firestore is still subject to its own quotas and billing. The app still writes
activity updates and receives FCM messages as before.

### Run locally

Use Node 22. In `backend/`, run `npm ci`, copy `.env.example` to `.env`, supply your
keys and service-account credentials, then run `npm run build` and `npm start`.
Use `SCHEDULER_ENABLED=false` while testing to avoid sending live notifications.
Run `npm test` to check the HTTP contract and scheduler overlap protection.
Never commit `.env` or service-account JSON. Use a dedicated service account with
Firestore access and permission to send FCM messages for this Firebase project.

For Android local testing, keep the debug URL in `src/config/Backend.ts`, run
`adb reverse tcp:3000 tcp:3000`, then launch a debug app with `npm run android`
from the repository root. The iOS Simulator reaches `127.0.0.1:3000` directly.
The debug app uses local HTTP; release builds require the production HTTPS URL.
With `SCHEDULER_ENABLED=false`, the key and prediction endpoints can be tested
without Firebase service-account credentials. To test scheduled notifications,
configure those credentials, set `SCHEDULER_ENABLED=true`, and open the app to
record user activity. This runs against the configured Firebase project and can
send alerts to its real topic subscribers.

### Create the new Voroa service

1. Push this code to your GitHub repository. In Voroa, connect GitHub and create a
   **Web Service** from `USHASRI1112/CricketPredictionApp` and the branch containing
   this change. Set the root directory to `backend`.
2. Set the build command to `npm ci && npm run build` and start command to `npm start`.
   Configure `/health` as the health-check path. The server listens on `0.0.0.0`
   and the `PORT` provided by Voroa.
3. Add environment variables through Voroa's Environment tab:
   - `CRIC_API_KEY`: the new working Cric API key.
   - `GROQ_API_KEY`: your existing Groq key (previously in `FUNCTIONS_CONFIG_EXPORT.groq.key`).
   - `GROQ_MODEL`: optional model ID; defaults to `openai/gpt-oss-20b`. Choose a model available to your Groq account.
   - `GROQ_REASONING_EFFORT`: `low` (default), `medium`, or `high`; sent only to GPT-OSS models. Lower effort and 70–100 word reasons reduce generation work.
   - `GOOGLE_CLOUD_PROJECT`: `cricket-prediction-app-a0f1c`.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON as one value.
   - `SCHEDULER_ENABLED`: initially `false`, until cutover is complete.
4. Deploy, confirm `/health` works, then set `PRODUCTION_BACKEND_URL` in
   `src/config/Backend.ts` to the actual Voroa HTTPS URL. No placeholder hostname is
   configured. Build and release **one updated AAB** after verifying predictions
   and key loading on a device. Old app versions keep their original endpoints.
5. Stop the old Firebase `cricketMaster` schedule before setting
   `SCHEDULER_ENABLED=true` on Voroa, to avoid duplicate notifications and API calls.
   Keep the old `predictMatch` function available while older app versions still
   depend on it; delete it only when that compatibility is no longer needed.
   No deployed Firebase resources are deleted by this repository change.
6. Keep one backend instance **always running** with idle sleep disabled. An HTTP
   service that sleeps cannot run the scheduler reliably. A Firestore lease prevents
   overlapping scheduler runs during rolling deployments. An abrupt crash can delay
   the next run up to ten minutes while the lease expires.

Firestore rules must prevent mobile clients from writing the `backend_runtime`
collection. Admin SDK server requests bypass rules. Existing client access to
`cricket_cache/user_activity` must continue to work. The previous
`app_config/cric_api` document is no longer used by this code.

To rotate the key later, change `CRIC_API_KEY` in the Voroa Environment tab and save.
Voroa redeploys the service; apps pick up the new key on the next request after
five minutes. No new AAB is needed. The app keeps an already loaded key temporarily
if the backend is unavailable; a new app session needs the backend to load a key.
The Groq endpoint limits requests to 30 per minute and five concurrent predictions
per backend instance. It preserves the existing unauthenticated app flow.

Official hosting instructions: [Node.js deployment](https://getvoroa.com/docs/deploy-nodejs/)
and [environment variables](https://getvoroa.com/docs/environment-variables/).

### Download a debug APK from GitHub Actions

Push `.github/workflows/android-debug-apk.yml` and the app changes to the **V2**
branch on GitHub. Every push to V2 automatically runs **Build Android Debug APK**;
no merge into main is needed. Open Actions and select the latest V2 run. When it succeeds,
open the run, download the `cricket-prediction-debug-<run number>` artifact, and
unzip it to get `app-debug.apk`. No repository secrets or release signing key
are needed for this debug build. The artifact is retained for 14 days.

The APK supports ARM Android phones running Android 7.0 or later. It needs Metro
and the backend on your Mac; it does not bundle JavaScript for standalone use.
Start the backend with `npm run dev` from `backend/` and Metro with `npm start`
from the repository root, in separate terminals. Install only the Android SDK
**platform-tools** on your Mac, enable USB debugging on the phone, then run:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
adb install -r /path/to/app-debug.apk
```

Open the app while both servers are running. Android Studio and the Android build
SDK are not needed on your Mac. A Play Store installation has a different signing
certificate; uninstall it first if installation reports a signature conflict.
Uninstalling clears the app's local data.

### Build a signed release AAB from GitHub Actions

Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64-encoded existing upload keystore |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | Upload key alias |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Key password |

For an existing Play Store app, use the upload key already registered in Play
Console. Encode that keystore on macOS with the following command, then paste
from the clipboard into the base64 secret (replace the path with your key's path):

```bash
base64 -i /path/to/my-upload-key.keystore | pbcopy
```

For release builds on **V2**, also add repository **variables** under
**Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
| --- | --- |
| `RELEASE_BACKEND_URL` | Deployed backend HTTPS URL |
| `RELEASE_VERSION_CODE` | Integer higher than every version previously uploaded to Play Console |
| `RELEASE_VERSION_NAME` | Display version, such as `1.0.2` (optional; defaults to `1.0.2`) |

Push to V2 to automatically run the release workflow. Its build job is skipped
until the backend URL and version-code variables are configured. After setting
or updating variables, push another commit or rerun the skipped workflow run.
Both build workflows are restricted to V2; main does not need to change.
Increase the version-code variable before building each new Play Console upload.
Download and
unzip the release artifact to obtain `app-release.aab`. Upload that bundle to
Play Console, usually to an internal testing track first. The workflow does not
publish automatically. AAB files are uploaded to Play Console, not installed
directly like APK files.

The workflow configures the production URL only in its temporary checkout,
bundles JavaScript, builds every architecture configured in Gradle, and signs
with your upload key. Metro and localhost are not used by release builds. The
backend must be deployed and configured before testing a release.

Local release signing can use the `MYAPP_UPLOAD_*` environment variables or
properties in `~/.gradle/gradle.properties`. Signing passwords are no longer stored
in the repository's `android/gradle.properties`.
