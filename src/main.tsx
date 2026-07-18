import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initializeHomeownerProjectPersistence } from './services/homeownerProjectPersistence';

const App = lazy(() => import('./App').then((module) => ({ default: module.App })));
const ReviewerPortal = lazy(() => import('./components/ReviewerPortal').then((module) => ({ default: module.ReviewerPortal })));

const reviewProject = new URLSearchParams(window.location.search).get('reviewProject');
const reviewToken = new URLSearchParams(window.location.hash.slice(1)).get('reviewToken');

if (!reviewProject || !reviewToken) initializeHomeownerProjectPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-surface text-sm text-text-secondary">Loading Permitly…</div>}>{reviewProject && reviewToken ? <ReviewerPortal projectId={reviewProject} reviewerToken={reviewToken} /> : <App />}</Suspense>
  </StrictMode>
);
