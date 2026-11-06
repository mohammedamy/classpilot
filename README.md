# ClassPilot: AI teaching assistant for Classera teachers

ClassPilot helps teachers manage their classes alongside Classera:

| # | Feature | Where |
|---|---------|-------|
| 1 | Track all student assignments (submitted / missing / to grade) and **bulk-assign** to classes or groups | **Assignments** |
| 2 | Auto-create quizzes, exams, homework, worksheets and projects **from a prompt or uploaded books and documents** (PDF, scanned pages, notes), then publish and share a student link | **AI Studio** |
| 3 | Auto-correction: objective questions are marked instantly, and open answers are scored by Gemini with your rubric. You review and approve every mark | **Auto-correct** |
| 4 | Edit marks in a gradebook and sync them to Classera (CSV import), with changed marks tracked | **Gradebook** |
| 5 | Personalized emails to students and parents (average, missing work, upcoming), AI drafting, weekly automations | **Messages** |
| 6 | Online classes with Google Meet (auto-generated through Google Calendar) or Zoom, weekly recurrence, invites | **Schedule** |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (deploy to any static host)
```

The app opens with realistic **demo data** (3 classes, 24 students). Reset it any time in **Settings → Data**.

## Connect real services (Settings)

### Google Gemini (AI generation, grading, email drafts)
1. Create a key at https://aistudio.google.com/apikey
2. Paste it in **Settings → Google Gemini**, then click **Test**.
3. Default model: `gemini-3.8-flash`. You can switch to `gemini-3.5-flash-lite` (cheaper) or `gemini-4-argon` (deepest reasoning).

Without a key, the app runs in **demo mode** (template questions and keyword grading), so you can try every flow.

### Google Calendar + Meet + Gmail
1. Open Google Cloud Console and create a project. Enable the **Google Calendar API** and **Gmail API**.
2. Set up the OAuth consent screen and add the scopes `calendar.events` and `gmail.send`.
3. Go to **Credentials → Create OAuth client ID → Web application**, and add your site's URL (e.g. `http://localhost:5173`) as an **Authorized JavaScript origin**.
4. Paste the Client ID in **Settings → Google Workspace**, then click **Connect**.

After that:
- **Schedule → New online class** creates a real Calendar event with a Meet link and sends invites to students.
- **Messages → Send via Gmail** sends one personalized email per recipient from your account.

### Zoom
Set your Personal Meeting Room link in Settings. New Zoom classes use it, or you can paste any link.
Auto-creating unique Zoom meetings needs a Zoom OAuth app plus a backend (see the roadmap).

### Classera
Classera doesn't publish an open API, so ClassPilot works through Classera's CSV/Excel import and export:
- **Classes → Import Classera CSV** reads columns such as `Student ID, Student Name, Email, Parent Name, Parent Email, Group`. Arabic headers are also supported.
- **Gradebook → Sync to Classera** downloads the changed marks (or a full gradebook per class) with Classera student IDs, ready for Classera's marks import.
- **AI Studio → Classera sheet** exports the questions for the Classera question bank.

If your school gets Classera partner API access, put the integration in `src/lib/classera.js`. Sync is already isolated behind the "Sync to Classera" action.

## Architecture

- React 19 + Vite, plain CSS design system (`src/index.css`), `lucide-react` icons.
- All data lives in `localStorage` (`src/store/store.jsx`), with cross-tab sync, so a student submitting in another tab appears live in the teacher view.
- `src/lib/gemini.js`: Gemini REST client (structured JSON output, PDF/image inline input) plus demo fallbacks.
- `src/lib/google.js`: Google Identity Services token client, Calendar/Meet, Gmail.
- `src/lib/grading.js`: objective scoring plus batched AI scoring.
- The student quiz page is `#/take/<assessmentId>`.

## Roadmap to production

This is a single-teacher prototype. Before real students use it:
1. **Backend + database** (e.g. Firebase/Supabase or a small Node API): needed so students on their own devices can submit, and to store data centrally.
2. **Student sign-in** (Google or school SSO) instead of choosing a name from a list.
3. **Server-side AI calls** so the Gemini key isn't stored in the browser.
4. **Scheduled jobs** (Cloud Scheduler or cron) so weekly emails go out even when the app is closed.
5. **Zoom OAuth** for unique meeting links. **Classera API** if available.
6. Arabic UI / RTL layout.
