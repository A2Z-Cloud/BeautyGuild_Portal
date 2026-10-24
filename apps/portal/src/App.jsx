import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PortalView from './PortalView.jsx';
import Dashboard from './Dashboard.jsx';
import ServiceHome from './ServiceHome.jsx';
import { Journey } from './Journey.jsx';
import { Records, RecordDetail } from './Records.jsx';
import { Notice, PageHeading } from './UiParts.jsx';
import { PreviewStateProvider } from './journeys/previewState.jsx';
import { LoginPage, SignupPage, ForgotPasswordPage, AccountCheckpoint, AccountManagement } from './AccountPages.jsx';
import { PaymentPreview,PaymentReturn } from './PaymentPreview.jsx';
import { INTEGRATIONS } from './services/api.js';
import { CourseCatalogue } from './components/CourseCatalogue.jsx';
import BuyMembership from './BuyMembership.jsx';
import BuyInsurance from './BuyInsurance.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import CheckoutPage from './CheckoutPage.jsx';
import PublicSchoolVerification from './PublicSchoolVerification.jsx';
import SavedDrafts from './SavedDrafts.jsx';
import {SchoolsList,SchoolWorkspace,AccountInvoices,MembershipManagement,AccountDocuments} from './SchoolWorkspace.jsx';

function NotReady({ area }) {
  return <div className="page narrow-page">
    <PageHeading eyebrow="COMING SOON" title={area} description="This part of the portal is not available yet." />
    <Notice title="Coming soon">We are still building this section. Please check back later.</Notice>
  </div>;
}
// GTi Courses shows the live catalogue when course lookup is switched on, otherwise a placeholder.
function GtiCourses() {
  if (!INTEGRATIONS.courses) return <NotReady area="GTi Courses" />;
  return <div className="page"><PageHeading eyebrow="GTi COURSES" title="GTi courses" description="Courses currently offered through the Guild." /><CourseCatalogue searchable title="All GTi courses" /></div>;
}
function NotFound() {
  return <div className="page narrow-page"><PageHeading eyebrow="404" title="Page not found" description="This address does not match an available portal page." /><Link to="/" className="btn btn-primary">Return to dashboard</Link></div>;
}
// Sign-in, sign-up, password reset and the account checkpoint are full-page screens with their
// own layout, so they render without the portal sidebar, top bar and footer.
const STANDALONE_ROUTES = ['/login', '/signup', '/forgot-password', '/account/checkpoint'];
function Layout({ children }) {
  const { pathname } = useLocation();
  const safe = <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
  return STANDALONE_ROUTES.includes(pathname.replace(/\/+$/, '')) || pathname==='/verify' || pathname.startsWith('/verify/') ? safe : <PortalView>{safe}</PortalView>;
}
export default function App() {
  return <PreviewStateProvider><Layout><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/membership" element={<ServiceHome kind="membership" />} />
    <Route path="/insurance" element={<ServiceHome kind="insurance" />} />
    <Route path="/accreditation" element={<ServiceHome kind="accreditation" />} />
    <Route path="/membership/buy" element={<BuyMembership />} />
    <Route path="/insurance/buy" element={<BuyInsurance />} />
    <Route path="/membership/new" element={INTEGRATIONS.stripeCheckout ? <Navigate to="/membership/buy" replace /> : <Journey kind="membership" />} />
    <Route path="/insurance/new" element={<Journey kind="insurance" />} />
    <Route path="/accreditation/new" element={<Journey kind="accreditation" />} />
    <Route path="/verify" element={<PublicSchoolVerification />} />
    <Route path="/verify/:number" element={<PublicSchoolVerification />} />
    <Route path="/records" element={<Records />} />
    <Route path="/drafts" element={<SavedDrafts/>} />
    <Route path="/schools" element={<SchoolsList/>} />
    <Route path="/schools/:id/:section" element={<SchoolWorkspace/>} />
    <Route path="/invoices" element={<AccountInvoices/>} />
    <Route path="/documents" element={<AccountDocuments/>} />
    <Route path="/membership/manage/:id" element={<MembershipManagement/>} />
    <Route path="/records/:kind/:id" element={<RecordDetail />} />
    <Route path="/membership/:id" element={<RecordDetail kindOverride="membership" />} />
    <Route path="/insurance/:id" element={<RecordDetail kindOverride="insurance" />} />
    <Route path="/accreditation/:id" element={<RecordDetail kindOverride="accreditation" />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/account/checkpoint" element={<AccountCheckpoint />} />
    <Route path="/pay/:service/:recordId" element={<CheckoutPage />} />
    <Route path="/payment-return" element={<PaymentReturn/>} />
    <Route path="/checkout-preview/:kind" element={<PaymentPreview />} />
    <Route path="/account" element={<AccountManagement />} />
    <Route path="/gti-courses" element={<GtiCourses />} />
    <Route path="/my-profile" element={<Navigate to="/account" replace />} />
    <Route path="/help" element={<NotReady area="Help and support" />} />
    <Route path="/apply" element={<Navigate to="/accreditation/new" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes></Layout></PreviewStateProvider>;
}
