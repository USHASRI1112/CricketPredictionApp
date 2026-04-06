# Bug Fix Notes

This note documents the two recent fixes in the cricket app.

## 1) Live match score not updating and ended matches staying live

### Problem
- Live scores were sometimes not refreshing correctly.
- Finished matches could remain visible in the live section after the match ended.

### Root cause
- The backend treated a match as live if `matchStarted` was true, even when the API status had already changed to an ended state.
- The app merged fresh live data into local state, but it did not properly retire matches that disappeared from the live Firestore feed.
- Match grouping logic also prioritized `matchStarted` before `matchEnded`, which could route ended matches into the wrong section.

### Fix
- Added a shared lifecycle helper:
  - `isMatchLive()`
  - `isMatchEnded()`
  - `mergeFreshLiveMatches()`
- Updated backend live detection to treat final statuses like `won`, `completed`, `abandoned`, `cancelled`, and similar as ended.
- Updated Home, All Matches, and Match screens to use the shared helper.
- Updated split logic so ended matches are classified before live matches.

### Files changed
- [functions/src/index.ts](/Users/usha/Documents/Self/NEW/CricketPredictionApp/functions/src/index.ts)
- [src/helpers/MatchLifecycle.ts](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/helpers/MatchLifecycle.ts)
- [src/helpers/SplitMatches.ts](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/helpers/SplitMatches.ts)
- [src/screens/AllMatchesScreen.tsx](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/screens/AllMatchesScreen.tsx)
- [src/screens/HomeScreen.tsx](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/screens/HomeScreen.tsx)
- [src/screens/MatchScreen.tsx](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/screens/MatchScreen.tsx)

## 2) Push notifications not coming

### Problem
- Push notifications were not arriving on devices.

### Root cause
- Android 13+ requires the `POST_NOTIFICATIONS` permission.
- The notification setup code could exit early when permission status was not yet enabled, which prevented token setup and topic subscriptions.

### Fix
- Added `android.permission.POST_NOTIFICATIONS` to the Android manifest.
- Changed notification initialization so the app still gets an FCM token and subscribes to topics even if permission is not yet fully granted.

### Files changed
- [android/app/src/main/AndroidManifest.xml](/Users/usha/Documents/Self/NEW/CricketPredictionApp/android/app/src/main/AndroidManifest.xml)
- [src/services/PushNotifications.ts](/Users/usha/Documents/Self/NEW/CricketPredictionApp/src/services/PushNotifications.ts)

## Verification
- `npx tsc --noEmit` passed.
- `functions/` TypeScript build passed.

