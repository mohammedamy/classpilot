import { DAY, startOfDay, startOfWeek, subId } from './utils.js';

// Deterministic PRNG so demo data is stable between reloads.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const CLASSES = [
  { id: 'c_8a', name: 'Science 8A', subject: 'Science', grade: 'Grade 8', color: 'hsl(165 50% 36%)', classeraCode: 'SCI-8A-2026' },
  { id: 'c_8b', name: 'Science 8B', subject: 'Science', grade: 'Grade 8', color: 'hsl(205 60% 44%)', classeraCode: 'SCI-8B-2026' },
  { id: 'c_10a', name: 'Physics 10A', subject: 'Physics', grade: 'Grade 10', color: 'hsl(30 75% 48%)', classeraCode: 'PHY-10A-2026' },
];

const NAMES = {
  c_8a: [['Omar Haddad', 'Khaled Haddad'], ['Lina Saleh', 'Rana Saleh'], ['Yousef Nasser', 'Ahmad Nasser'], ['Sara Al-Amin', 'Huda Al-Amin'], ['Adam Farouk', 'Tarek Farouk'], ['Maya Khoury', 'Nadia Khoury'], ['Zaid Mansour', 'Fadi Mansour'], ['Noor Hamdan', 'Rania Hamdan']],
  c_8b: [['Hamza Qasim', 'Bilal Qasim'], ['Jana Darwish', 'Mona Darwish'], ['Ali Rahman', 'Samir Rahman'], ['Leen Aziz', 'Dina Aziz'], ['Karim Yassin', 'Walid Yassin'], ['Talia Odeh', 'Reem Odeh'], ['Rayan Sabbagh', 'Majed Sabbagh'], ['Hala Jaber', 'Suha Jaber']],
  c_10a: [['Faris Najjar', 'Imad Najjar'], ['Dana Issa', 'Lama Issa'], ['Mazen Halabi', 'Ziad Halabi'], ['Aya Barakat', 'Hiba Barakat'], ['Tamer Shami', 'Nabil Shami'], ['Yasmin Kanaan', 'Ghada Kanaan'], ['Sami Hourani', 'Rami Hourani'], ['Reem Taha', 'Wafa Taha']],
};

function buildStudents() {
  const out = [];
  let n = 1000;
  for (const c of CLASSES) {
    NAMES[c.id].forEach(([name, parent], i) => {
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
      out.push({
        id: `s_${c.id}_${i}`,
        name,
        email: `${slug}@student.school.edu`,
        parentName: parent,
        parentEmail: `${parent.toLowerCase().replace(/[^a-z]+/g, '.')}@gmail.com`,
        classId: c.id,
        group: i % 2 === 0 ? 'Group A' : 'Group B',
        classeraId: String(++n),
      });
    });
  }
  return out;
}

const Q_CELLS = [
  { id: 'q1', type: 'mcq', prompt: 'Which organelle is known as the "powerhouse" of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'], answer: 'Mitochondria', points: 2 },
  { id: 'q2', type: 'tf', prompt: 'Plant cells have a cell wall, but animal cells do not.', options: ['True', 'False'], answer: 'True', points: 1 },
  { id: 'q3', type: 'mcq', prompt: 'Where is the genetic material (DNA) mainly stored in a eukaryotic cell?', options: ['Cytoplasm', 'Cell membrane', 'Nucleus', 'Vacuole'], answer: 'Nucleus', points: 2 },
  { id: 'q4', type: 'fill', prompt: 'Plants make their food in organelles called ________.', answer: 'chloroplasts', points: 2 },
  { id: 'q5', type: 'short', prompt: 'Explain the role of the cell membrane in one or two sentences.', answer: 'The cell membrane controls what enters and leaves the cell; it is selectively permeable and protects the cell.', rubric: '2 pts: mentions controlling movement in/out (selectively permeable). 1 pt: mentions protection/boundary.', points: 3 },
];

const Q_NEWTON = [
  { id: 'q1', type: 'mcq', prompt: 'A 4 kg object accelerates at 3 m/s². What is the net force?', options: ['7 N', '12 N', '0.75 N', '1.33 N'], answer: '12 N', points: 3 },
  { id: 'q2', type: 'tf', prompt: 'An object in motion stays in motion unless acted on by a net external force.', options: ['True', 'False'], answer: 'True', points: 2 },
  { id: 'q3', type: 'mcq', prompt: "Newton's third law states that forces always occur in…", options: ['Balanced sets', 'Action–reaction pairs', 'Opposite objects at rest', 'Gravitational fields only'], answer: 'Action–reaction pairs', points: 3 },
  { id: 'q4', type: 'short', prompt: 'Why do passengers lurch forward when a bus suddenly brakes?', answer: 'Because of inertia: their bodies tend to keep moving forward at the same speed while the bus decelerates.', rubric: 'Full marks for naming inertia / Newton’s first law and linking it to the body continuing in motion.', points: 4 },
  { id: 'q5', type: 'essay', prompt: 'Describe an everyday example of each of Newton’s three laws.', answer: 'First law: a book stays on a table; second: pushing an empty vs full cart; third: a swimmer pushes water backward and moves forward.', rubric: '3 pts per law: correct law + valid, clearly explained example. Max 8.', points: 8 },
];

const Q_PHOTO = [
  { id: 'q1', type: 'fill', prompt: 'The green pigment that absorbs light is called ________.', answer: 'chlorophyll', points: 2 },
  { id: 'q2', type: 'mcq', prompt: 'Which gas do plants take in during photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 'Carbon dioxide', points: 2 },
  { id: 'q3', type: 'short', prompt: 'Write the word equation for photosynthesis.', answer: 'carbon dioxide + water → glucose + oxygen (using light energy)', rubric: 'All four substances in the correct places = full marks; mention of light/chlorophyll is a bonus but not required.', points: 4 },
];

const Q_FORCES = [
  { id: 'q1', type: 'mcq', prompt: 'What is the SI unit of force?', options: ['Joule', 'Newton', 'Watt', 'Pascal'], answer: 'Newton', points: 1 },
  { id: 'q2', type: 'tf', prompt: 'Friction always acts in the same direction as motion.', options: ['True', 'False'], answer: 'False', points: 1 },
  { id: 'q3', type: 'short', prompt: 'Define velocity and explain how it differs from speed.', answer: 'Velocity is speed in a given direction; it is a vector, while speed is a scalar.', rubric: 'Mentions direction / vector vs scalar.', points: 3 },
];

const Q_CHEM = [
  { id: 'q1', type: 'mcq', prompt: 'Which is a sign of a chemical reaction?', options: ['Change of shape', 'Gas produced', 'Melting', 'Dissolving sugar'], answer: 'Gas produced', points: 2 },
  { id: 'q2', type: 'tf', prompt: 'Mass is conserved in a chemical reaction.', options: ['True', 'False'], answer: 'True', points: 1 },
];

const SHORT_SAMPLES = {
  good: ['It controls what goes in and out of the cell and protects it.', 'Because of inertia, their body keeps moving forward while the bus slows down.', 'carbon dioxide + water → glucose + oxygen', 'Velocity is speed with a direction, so it is a vector but speed is not.'],
  ok: ['It is the outside of the cell.', 'Because the bus stops.', 'water and sunlight make sugar', 'Velocity is how fast something goes.'],
};

function buildAssessments(now) {
  const d = (days, h = 23, m = 59) => {
    const x = new Date(startOfDay(now) + days * DAY);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  return [
    { id: 'a_cells', title: 'Cells & Organelles Quiz', type: 'quiz', classIds: ['c_8a', 'c_8b'], groups: [], dueDate: d(-3), durationMin: 20, status: 'published', questions: Q_CELLS, instructions: 'Answer all questions. You have 20 minutes.', createdAt: d(-10, 9), source: { prompt: 'Grade 8 quiz on cell structure and organelles', files: ['Science_G8_Unit2_Cells.pdf'] } },
    { id: 'a_newton', title: "Newton's Laws Midterm", type: 'exam', classIds: ['c_10a'], groups: [], dueDate: d(-6), durationMin: 45, status: 'published', questions: Q_NEWTON, instructions: 'Show your reasoning for written answers.', createdAt: d(-14, 9), source: { prompt: 'Midterm on Newton’s three laws, mixed difficulty', files: ['Physics10_Chapter4.pdf'] } },
    { id: 'a_photo', title: 'Photosynthesis Worksheet', type: 'homework', classIds: ['c_8a'], groups: [], dueDate: d(2), durationMin: 0, status: 'published', questions: Q_PHOTO, instructions: 'Complete before Thursday’s lab.', createdAt: d(-2, 10), source: { prompt: 'Short homework on photosynthesis', files: [] } },
    { id: 'a_forces', title: 'Forces & Motion Check-in', type: 'quiz', classIds: ['c_10a'], groups: [], dueDate: d(1), durationMin: 15, status: 'published', questions: Q_FORCES, instructions: '', createdAt: d(-1, 11), source: { prompt: 'Quick check on forces and motion basics', files: [] } },
    { id: 'a_eco', title: 'Ecosystems Research Project', type: 'project', classIds: ['c_8a', 'c_8b'], groups: ['Group A'], dueDate: d(9), durationMin: 0, status: 'published', questions: [{ id: 'q1', type: 'essay', prompt: 'Research a local ecosystem and describe its food web, including at least 3 producers, 3 consumers, and 1 decomposer.', answer: '', rubric: 'Food web accuracy (6), research depth (6), presentation & sources (8).', points: 20 }], instructions: 'Work in your assigned group. Submit a 1–2 page report.', createdAt: d(-1, 14), source: { prompt: 'Group project on ecosystems', files: [] } },
    { id: 'a_chem', title: 'Chemical Reactions Warm-up', type: 'quiz', classIds: ['c_8b'], groups: [], dueDate: d(6), durationMin: 10, status: 'draft', questions: Q_CHEM, instructions: '', createdAt: d(0, 8), source: { prompt: 'Warm-up quiz on chemical vs physical changes', files: [] } },
  ];
}

function gradeObjective(q, ans) {
  if (ans == null || ans === '') return 0;
  return String(ans).trim().toLowerCase() === String(q.answer).trim().toLowerCase() ? q.points : 0;
}

function buildSubmissions(assessments, students, now) {
  const r = rng(42);
  const subs = [];
  for (const a of assessments) {
    if (a.status === 'draft') continue;
    const due = new Date(a.dueDate).getTime();
    const past = due < now;
    const roster = students.filter((s) => a.classIds.includes(s.classId) && (!a.groups.length || a.groups.includes(s.group)));
    for (const s of roster) {
      const roll = r();
      const skill = 0.45 + r() * 0.55;
      let status;
      if (a.type === 'project') status = roll < 0.15 ? 'submitted' : 'missing';
      else if (past) status = roll < 0.12 ? 'missing' : 'submitted';
      else status = roll < (a.id === 'a_forces' ? 0.3 : 0.5) ? 'submitted' : 'missing';

      const sub = { id: subId(a.id, s.id), assessmentId: a.id, studentId: s.id, status, submittedAt: null, answers: {}, scores: {}, total: null, feedback: '', reviewed: false, late: false };
      if (status === 'submitted') {
        sub.submittedAt = new Date(Math.min(now - 3600000, due - r() * 3 * DAY)).toISOString();
        if (r() < 0.1 && past) { sub.late = true; sub.submittedAt = new Date(due + 5 * 3600000).toISOString(); }
        for (const q of a.questions) {
          if (q.type === 'mcq' || q.type === 'tf') {
            sub.answers[q.id] = r() < skill ? q.answer : q.options[Math.floor(r() * q.options.length)];
          } else if (q.type === 'fill') {
            sub.answers[q.id] = r() < skill ? q.answer : ['chlorophyl', 'mitochondria', 'cells', 'leaves'][Math.floor(r() * 4)];
          } else if (q.type === 'short') {
            const pool = r() < skill ? SHORT_SAMPLES.good : SHORT_SAMPLES.ok;
            sub.answers[q.id] = pool[Math.floor(r() * pool.length)];
          } else {
            sub.answers[q.id] = skill > 0.7
              ? 'First law: a ball keeps rolling on ice until friction stops it. Second law: it is harder to push a full shopping cart than an empty one because F = ma. Third law: when I jump off a boat, the boat moves backward.'
              : 'Newton’s laws are about motion. A car moves when you push the gas. Things fall down because of gravity.';
          }
        }
        // Auto-grade objective questions now; mark the rest as pending (null).
        let allAuto = true;
        for (const q of a.questions) {
          if (['mcq', 'tf', 'fill'].includes(q.type)) sub.scores[q.id] = { points: gradeObjective(q, sub.answers[q.id]), auto: true, feedback: '' };
          else allAuto = false;
        }
        // Older assessments: already fully graded.
        if (a.id === 'a_newton' || (a.id === 'a_cells' && r() < 0.55)) {
          for (const q of a.questions) {
            if (!sub.scores[q.id]) {
              const p = Math.round(q.points * (0.4 + skill * 0.6));
              sub.scores[q.id] = { points: Math.min(q.points, p), auto: true, feedback: p >= q.points * 0.8 ? 'Clear and accurate.' : 'Partly correct — add more detail.' };
            }
          }
          allAuto = true;
          sub.reviewed = a.id === 'a_newton';
        }
        if (allAuto) {
          sub.status = 'graded';
          sub.total = Object.values(sub.scores).reduce((t, x) => t + x.points, 0);
        }
      }
      subs.push(sub);
    }
  }
  return subs;
}

function buildSessions(now) {
  const wk = startOfWeek(now);
  const at = (dow, h, m = 0) => {
    const x = new Date(wk + dow * DAY);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  return [
    { id: 'ses_1', classId: 'c_8a', title: 'Science 8A — Cells review', start: at(0, 9), durationMin: 45, platform: 'meet', link: 'https://meet.google.com/abc-defg-hij', recurring: 'weekly' },
    { id: 'ses_2', classId: 'c_8b', title: 'Science 8B — Lab prep', start: at(1, 10, 30), durationMin: 45, platform: 'meet', link: 'https://meet.google.com/kln-opqr-stu', recurring: 'weekly' },
    { id: 'ses_3', classId: 'c_10a', title: 'Physics 10A — Forces', start: at(2, 12), durationMin: 60, platform: 'zoom', link: 'https://zoom.us/j/8123456789', recurring: 'weekly' },
    { id: 'ses_4', classId: 'c_8a', title: 'Science 8A — Photosynthesis', start: at(3, 9), durationMin: 45, platform: 'meet', link: 'https://meet.google.com/vwx-yzab-cde', recurring: 'weekly' },
    { id: 'ses_5', classId: 'c_10a', title: 'Physics 10A — Office hours', start: at(4, 14), durationMin: 30, platform: 'zoom', link: 'https://zoom.us/j/8123456789', recurring: 'none' },
  ];
}

export const DEFAULT_TEMPLATES = [
  {
    id: 't_progress', name: 'Weekly progress report (parents)', audience: 'parents',
    subject: 'Weekly update for {{studentName}} — {{className}}',
    body: `Dear {{parentName}},

Here is {{studentName}}'s weekly update for {{className}}:

• Current average: {{average}}
• Missing work: {{missing}}
• Coming up: {{upcoming}}

Please feel free to reply if you have any questions.

Kind regards,
{{teacherName}}`,
  },
  {
    id: 't_reminder', name: 'Due-soon reminder (students)', audience: 'students',
    subject: 'Reminder: work due soon in {{className}}',
    body: `Hi {{studentName}},

Friendly reminder — coming up in {{className}}: {{upcoming}}.
You currently have {{missing}} missing item(s).

See you in class,
{{teacherName}}`,
  },
  {
    id: 't_missing', name: 'Missing work alert (parents)', audience: 'parents',
    subject: '{{studentName}} has missing work in {{className}}',
    body: `Dear {{parentName}},

I wanted to let you know that {{studentName}} has the following missing work: {{missing}}.
Their current average is {{average}}. Completing these will help a lot.

Thank you for your support,
{{teacherName}}`,
  },
];

export function buildSeed() {
  const now = Date.now();
  const students = buildStudents();
  const assessments = buildAssessments(now);
  const submissions = buildSubmissions(assessments, students, now);
  return {
    version: 1,
    settings: {
      teacherName: 'Ms. Rana Khalil',
      school: 'Al Noor International School',
      geminiKey: '',
      geminiModel: 'gemini-3.8-flash',
      googleClientId: '',
      zoomLink: 'https://zoom.us/j/8123456789',
      classeraUrl: 'https://me.classera.com',
      defaultPlatform: 'meet',
    },
    classes: CLASSES,
    students,
    assessments,
    submissions,
    sessions: buildSessions(now),
    templates: DEFAULT_TEMPLATES,
    messages: [
      { id: 'm_1', subject: 'Weekly update — Science 8A', audience: 'parents', classIds: ['c_8a'], recipients: 8, sentAt: new Date(now - 7 * DAY).toISOString(), via: 'Gmail', automation: 'Weekly progress report' },
      { id: 'm_2', subject: 'Reminder: Newton’s Laws Midterm', audience: 'students', classIds: ['c_10a'], recipients: 8, sentAt: new Date(now - 8 * DAY).toISOString(), via: 'Gmail' },
    ],
    automations: [
      { id: 'au_1', name: 'Weekly progress report', templateId: 't_progress', audience: 'parents', classIds: ['c_8a', 'c_8b', 'c_10a'], day: 4, time: '16:00', enabled: true, lastRun: new Date(now - 7 * DAY).toISOString() },
      { id: 'au_2', name: 'Sunday reminders', templateId: 't_reminder', audience: 'students', classIds: ['c_10a'], day: 0, time: '18:00', enabled: false, lastRun: null },
    ],
    // Marks changed since the last Classera export: { [submissionId]: true }
    unsynced: Object.fromEntries(submissions.filter((s) => s.assessmentId === 'a_newton' && s.status === 'graded').slice(0, 3).map((s) => [s.id, true])),
    lastClasseraSync: new Date(now - 5 * DAY).toISOString(),
  };
}
