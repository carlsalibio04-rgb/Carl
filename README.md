# Poko / Gym Tracker

## What changed
- Kept the existing `poko/gym-tracker/frontend` folder structure.
- Added the missing Firebase role helper and local dashboard-data store that were imported by the app but absent from the project archive.
- Google sign-in reads the user's role from Firestore at `users/{uid}` and routes `admin` to `/admin`, `member` to `/member`, and `frontdesk` through the existing role value.
- Firestore is used only for the account document: `name`, `email`, `uid`, `role`.
- Dashboard records (payments, membership plans, notifications, extension requests, front desk entries, and activity logs) are stored in this browser's `localStorage`, so they remain after refresh but are not uploaded to Firestore or shared across devices/browsers.

## Firebase setup
1. Open Firebase Console for project `poko-72aec`.
2. In **Authentication → Sign-in method**, enable **Google**. Enable Email/Password too only if you want to keep the existing email/password option.
3. In **Firestore Database → Rules**, publish the included `firestore.rules` file's rules.
4. Sign in once with the Google account that should be an administrator. Its user document is created with role `member` by default.
5. In Firestore, open `users`, select that account's document (document ID must equal the user's `uid`), and change `role` to `admin`. Use `member` for members or `frontdesk` for front-desk staff.
6. Refresh or sign out and sign back in. The app reads the role from Firestore and routes accordingly.

## Run locally
```bash
cd frontend
npm install
npm run dev
```

**Important:** localStorage data exists only in the same browser profile on the same device. Clearing browser site data will remove it. This is intentional because you requested that dashboard data not be saved in Firestore.
