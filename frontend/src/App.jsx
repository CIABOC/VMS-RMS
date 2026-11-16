import { Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth.jsx';
import AppLayout from './components/AppLayout.jsx';
import SignIn from './pages/SignIn.jsx';
import Home from './pages/Home.jsx';
import ReceptionDashboard from './pages/ReceptionDashboard.jsx';
import RegisterVisitor from './pages/RegisterVisitor.jsx';
import IdentityVerification from './pages/IdentityVerification.jsx';
import SignatureCapture from './pages/SignatureCapture.jsx';
import LiveQueue from './pages/LiveQueue.jsx';
import PublicQueueDisplay from './pages/PublicQueueDisplay.jsx';
import VisitDetail from './pages/VisitDetail.jsx';
import HostInbox from './pages/HostInbox.jsx';
import Appointments from './pages/Appointments.jsx';
import GateConsole from './pages/GateConsole.jsx';
import GateDashboard from './pages/GateDashboard.jsx';
import DeviceCustody from './pages/DeviceCustody.jsx';
import ManagementDashboard from './pages/ManagementDashboard.jsx';
import AdminMasterData from './pages/AdminMasterData.jsx';
import AuditLog from './pages/AuditLog.jsx';
import NotFound from './pages/NotFound.jsx';

const R = ['RECEPTIONIST'];
const GATE = ['GATE_OFFICER', 'SECURITY_SUPERVISOR'];

export default function App() {
  return (
    <Routes>
      {/* 01 - stays as the SSO landing page; SSO will be merged here */}
      <Route path="/sign-in" element={<SignIn />} />
      {/* public waiting-room screen (token numbers only) */}
      <Route path="/display/queue" element={<PublicQueueDisplay />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="reception" element={<RequireAuth roles={R}><ReceptionDashboard /></RequireAuth>} />
        <Route path="visits/new" element={<RequireAuth roles={R}><RegisterVisitor /></RequireAuth>} />
        <Route path="visits/:id/verify" element={<RequireAuth roles={R}><IdentityVerification /></RequireAuth>} />
        <Route path="visits/:id/sign" element={<RequireAuth roles={R}><SignatureCapture /></RequireAuth>} />
        <Route path="visits/:id" element={<RequireAuth roles={R}><VisitDetail /></RequireAuth>} />
        <Route path="queue" element={<RequireAuth roles={R}><LiveQueue /></RequireAuth>} />
        <Route path="host" element={<RequireAuth roles={['HOST_OFFICER']}><HostInbox /></RequireAuth>} />
        <Route path="appointments" element={<RequireAuth roles={['RECEPTIONIST', 'HOST_OFFICER']}><Appointments /></RequireAuth>} />
        <Route path="gate" element={<RequireAuth roles={GATE}><GateConsole /></RequireAuth>} />
        <Route path="gate/dashboard" element={<RequireAuth roles={GATE}><GateDashboard /></RequireAuth>} />
        <Route path="devices" element={<RequireAuth roles={R}><DeviceCustody /></RequireAuth>} />
        <Route path="insights" element={<RequireAuth roles={['MANAGEMENT']}><ManagementDashboard /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth roles={['SYSTEM_ADMIN']}><AdminMasterData /></RequireAuth>} />
        <Route path="audit" element={<RequireAuth roles={['SYSTEM_ADMIN', 'SECURITY_SUPERVISOR']}><AuditLog /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
