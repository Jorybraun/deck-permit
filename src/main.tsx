import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initializeHomeownerProjectPersistence } from './services/homeownerProjectPersistence';
import { ReviewerPortal } from './components/ReviewerPortal';

const reviewProject = new URLSearchParams(window.location.search).get('reviewProject');
const reviewToken = new URLSearchParams(window.location.hash.slice(1)).get('reviewToken');

if (!reviewProject || !reviewToken) initializeHomeownerProjectPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {reviewProject && reviewToken ? <ReviewerPortal projectId={reviewProject} reviewerToken={reviewToken} /> : <App />}
  </StrictMode>
);
