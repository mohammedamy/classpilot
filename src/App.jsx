import { HashRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/store.jsx';
import { useLang } from './i18n/index.js';
import AuthGate from './components/AuthGate.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Studio from './pages/Studio.jsx';
import Assignments from './pages/Assignments.jsx';
import Grading from './pages/Grading.jsx';
import Gradebook from './pages/Gradebook.jsx';
import Messages from './pages/Messages.jsx';
import Schedule from './pages/Schedule.jsx';
import Classes from './pages/Classes.jsx';
import Settings from './pages/Settings.jsx';
import TakeQuiz from './pages/TakeQuiz.jsx';

function AppRoutes() {
  const lang = useLang();
  return (
    <Routes key={lang}>
      <Route path="/take/:id" element={<TakeQuiz />} />
      <Route element={<AuthGate><Layout /></AuthGate>}>
        <Route index element={<Dashboard />} />
        <Route path="studio" element={<Studio />} />
        <Route path="studio/:id" element={<Studio />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="assignments/:id" element={<Assignments />} />
        <Route path="grading" element={<Grading />} />
        <Route path="grading/:id" element={<Grading />} />
        <Route path="gradebook" element={<Gradebook />} />
        <Route path="messages" element={<Messages />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="classes" element={<Classes />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </StoreProvider>
  );
}
