# ClassPilot — AI Teaching Assistant for Classera Teachers

**Live app:** https://mohammedamy.github.io/classpilot/

ClassPilot helps teachers manage their classes alongside Classera — in **English** and **Arabic (العربية — full RTL)**:

| # | Feature | Where |
|---|---------|-------|
| 1 | Track all student assignments (submitted / missing / to grade) and **bulk-assign** to classes or groups | **Assignments** |
| 2 | Auto-create quizzes, exams, homework, worksheets and projects **from a prompt or uploaded books and documents** (PDF, scanned pages, notes), then publish and share a student link | **AI Studio** |
| 3 | Auto-correction: objective questions are marked instantly, and open answers are scored by Gemini with your rubric. You review and approve every mark | **Auto-correct** |
| 4 | Edit marks in a gradebook and sync them to Classera (CSV import), with changed marks tracked | **Gradebook** |
| 5 | Personalized emails to students and parents (average, missing work, upcoming), AI drafting, weekly automations | **Messages** |
| 6 | Online classes with Google Meet (auto-generated through Google Calendar) or Zoom, weekly recurrence, invites | **Schedule** |

---

## Run Locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
```

The app opens with realistic **demo data** (3 classes, 24 students). Switch between **English** and **العربية (RTL)** anytime from the top bar or **Settings**, or click **Start empty** in **Settings → Data** when you're ready to load your real classes.

---

## Connect Firebase (Cloud Sync + Student Submissions from Any Device)

Without Firebase, ClassPilot runs in **local browser mode**. Connecting Firebase enables:
- **Teacher Google sign-in** and real-time Firestore sync across your devices.
- **Remote student submissions:** students open `#/take/<assessmentId>` on their own phone or laptop, sign in with their school Google account, and submit answers securely (answer keys and rubrics stay private in the teacher workspace).

### 1. Create the Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/) → **Create a project**.
2. Go to **Build → Authentication → Get started → Sign-in method**, enable **Google**, and under **Settings → Authorized domains** add `mohammedamy.github.io`.
3. Go to **Build → Firestore Database → Create database** (start in production mode).
4. In ClassPilot (**Settings → Firebase cloud & student devices**), click **Copy Firestore rules** (or copy [`firestore.rules`](./firestore.rules)), paste into the Firebase Console **Firestore → Rules** tab, and click **Publish**.
5. Go to **Project settings (⚙️) → Your apps → Web (`</>`)**, register an app, and copy the `firebaseConfig` snippet.

### 2. Connect ClassPilot to Firebase (Pick Option A or B)

#### Option A — Instant Setup Inside the App (No Rebuild Needed)
1. Open **https://mohammedamy.github.io/classpilot/#/settings**.
2. Under **Firebase cloud & student devices**, paste your `firebaseConfig` snippet (either the raw `const firebaseConfig = { ... };` block from Firebase Console or JSON) and click **Connect Firebase**.
3. Shared student links (`#/take/<id>?fb=...`) automatically carry the public Firebase project identifiers so students opening a quiz link on any phone or laptop connect to your Firebase project right away.

#### Option B — Bake Into Every Build via GitHub Actions Variables
In your GitHub repository, open **Settings → Secrets and variables → Actions → Variables** (Repository variables) and add:

| Variable name | Value from `firebaseConfig` |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

*(Optional)* To auto-deploy `firestore.rules` on every push, add a repository **Secret** named `FIREBASE_SERVICE_ACCOUNT` containing a Firebase Admin service account JSON.

Then re-run the **Deploy ClassPilot to GitHub Pages** workflow in the **Actions** tab (or copy `.env.example` to `.env` for local development).

> **Important:** Student emails in **Classes & students** must match the Google email each student uses to sign in on `#/take/<id>`.

---

## Connect Google Gemini, Google Workspace, Zoom & Classera

### Google Gemini (AI generation, grading, email drafts)
1. Create an API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Paste it in **Settings → Google Gemini** and click **Test**. *(Your Gemini key is stored only in your local browser and is never uploaded to Firestore.)*
3. Default model: `gemini-3.8-flash` (switchable to `gemini-3.5-flash-lite` or `gemini-4-argon`). Without a key, ClassPilot runs in **Demo AI** mode.

### Google Calendar + Meet + Gmail
1. In [Google Cloud Console](https://console.cloud.google.com/) (you can use the same Google Cloud project behind Firebase), enable the **Google Calendar API** and **Gmail API**.
2. Configure the OAuth consent screen with scopes `calendar.events` and `gmail.send`.
3. Under **Credentials → Create OAuth client ID → Web application**, add `https://mohammedamy.github.io` (and `http://localhost:5173` for local dev) under **Authorized JavaScript origins**.
4. Paste the Client ID in **Settings → Google Workspace** and click **Connect Google account**.

### Zoom
Save your Personal Meeting Room link in **Settings → Online classes** (or paste custom links per session).

### Classera
Classera doesn't expose a public API, so ClassPilot integrates cleanly via Classera's CSV/Excel import and export:
- **Classes → Import Classera CSV** accepts English and Arabic headers (`Student ID`, `Student Name`, `Email`, `Parent Name`, `Parent Email`, `Group`).
- **Gradebook → Sync to Classera** exports changed marks (or full class gradebooks) keyed by Classera Student ID.
- **AI Studio → Classera sheet** exports generated questions in spreadsheet format.

---

## Deployment (GitHub Pages)

Every push to `main` automatically builds and deploys via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) to:
**https://mohammedamy.github.io/classpilot/**

---

## Known Limitations
- **Classera sync** uses CSV import/export until school-level Classera partner API credentials are available.
- **Gemini API key** runs directly from the teacher's browser (stored in `localStorage` only).
- **Weekly email automations** run from the browser when triggered ("Send now"); unattended background scheduling requires Cloud Scheduler / Cloud Functions (Firebase Blaze plan).
