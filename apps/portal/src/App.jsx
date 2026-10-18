import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import PortalView from './PortalView.jsx';
import Dashboard from './Dashboard.jsx';
import ServiceHome from './ServiceHome.jsx';
import { Journey } from './Journey.jsx';
import { Records, RecordDetail } from './Records.jsx';
import { Notice, PageHeading } from './UiParts.jsx';
import { PreviewStateProvider } from './journeys/previewState.jsx';
import { LoginPage, SignupPage, ForgotPasswordPage, AccountCheckpoint, AccountManagement } from './AccountPages.jsx';
import { PaymentPreview } from './PaymentPreview.jsx';
import DraftsPage from './DraftsPage.jsx';

function NotReady({ area }) {
  return <div className="page narrow-page">
    <PageHeading eyebrow="PORTAL V2" title={area} description="This section is not connected in the frontend preview." />
    <Notice title="Available in a later milestone">The live account, CRM record and backend functionality will be connected after the preview has been reviewed.</Notice>
  </div>;
}
function NotFound() {
  return <div className="page narrow-page"><PageHeading eyebrow="404" title="Page not found" description="This address does not match an available portal page." /><Link to="/" className="btn btn-primary">Return to dashboard</Link></div>;
}
export default function App() {
  return <PreviewStateProvider><PortalView><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/membership" element={<ServiceHome kind="membership" />} />
    <Route path="/insurance" element={<ServiceHome kind="insurance" />} />
    <Route path="/accreditation" element={<ServiceHome kind="accreditation" />} />
    <Route path="/membership/new" element={<Journey kind="membership" />} />
    <Route path="/insurance/new" element={<Journey kind="insurance" />} />
    <Route path="/accreditation/new" element={<Journey kind="accreditation" />} />
    <Route path="/records" element={<Records />} />
    <Route path="/drafts" element={<DraftsPage/>} />
    <Route path="/records/:kind/:id" element={<RecordDetail />} />
    <Route path="/membership/:id" element={<RecordDetail kindOverride="membership" />} />
    <Route path="/insurance/:id" element={<RecordDetail kindOverride="insurance" />} />
    <Route path="/accreditation/:id" element={<RecordDetail kindOverride="accreditation" />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/account/checkpoint" element={<AccountCheckpoint />} />
    <Route path="/checkout-preview/:kind" element={<PaymentPreview />} />
    <Route path="/account" element={<AccountManagement />} />
    <Route path="/gti-courses" element={<NotReady area="GTi Courses" />} />
    <Route path="/my-profile" element={<Navigate to="/account" replace />} />
    <Route path="/help" element={<NotReady area="Help and support" />} />
    <Route path="/apply" element={<Navigate to="/accreditation/new" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes></PortalView></PreviewStateProvider>;
}
