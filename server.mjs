import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReviewExchangeError, ReviewExchangeStore } from './server/reviewExchangeStore.mjs';
import { MunicipalDeliveryError, MunicipalDeliveryService } from './server/municipalDelivery.mjs';
import { AiDesignError, CerebrasDesignService } from './server/cerebrasDesignService.mjs';
import { FeedbackError, FeedbackStore } from './server/feedbackStore.mjs';
import { FeedbackAssistant, FeedbackAssistantError } from './server/feedbackAssistant.mjs';
import { SiteContextError, SiteContextService } from './server/siteContext.mjs';

const app = express();
const port = Number(process.env.PORT || 4173);
const root = dirname(fileURLToPath(import.meta.url));
const reviewExchange = new ReviewExchangeStore(process.env.DECK_PERMIT_DATA_DIR || join(root, '.deck-permit-data'));
const dataDirectory = process.env.DECK_PERMIT_DATA_DIR || join(root, '.deck-permit-data');
const municipalDelivery = new MunicipalDeliveryService({ apiKey: process.env.RESEND_API_KEY, fromEmail: process.env.PERMIT_SUBMISSION_FROM_EMAIL, dataDirectory });
const aiDesign = new CerebrasDesignService({
  // VITE_CEREBRAS_API_KEY is supported temporarily so the existing local key works;
  // CEREBRAS_API_KEY is the safe server-only name for all new environments.
  apiKey: process.env.CEREBRAS_API_KEY || process.env.VITE_CEREBRAS_API_KEY,
  designModel: process.env.CEREBRAS_DESIGN_MODEL,
  reviewModel: process.env.CEREBRAS_REVIEW_MODEL,
  photoModel: process.env.CEREBRAS_PHOTO_MODEL,
});
const feedbackStore = new FeedbackStore(dataDirectory);
const feedbackAssistant = new FeedbackAssistant({
  apiKey: process.env.CEREBRAS_API_KEY || process.env.VITE_CEREBRAS_API_KEY,
  model: process.env.CEREBRAS_REVIEW_MODEL,
});
app.use(express.json({ limit: '22mb' }));
const arcgisBase = 'https://services5.arcgis.com/MNn7A6yzK94Hggl3/arcgis/rest/services';
const datasets = {
  '/api/sidney-property': `${arcgisBase}/Sync_Enabled_Property_Line_NEW/FeatureServer/0/query`,
  '/api/sidney-rooflines': `${arcgisBase}/Sync_Enabled_Rooflines/FeatureServer/0/query`,
};

const sidneyApplicationUrl = 'https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf';

app.get('/api/ai/capabilities', (_request, response) => {
  response.set('cache-control', 'no-store').json(aiDesign.capabilities());
});

app.post('/api/ai/design-proposal', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await aiDesign.proposeDesign(request.body)); }
  catch (error) { next(error); }
});

app.post('/api/ai/design-review', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await aiDesign.reviewDesign(request.body)); }
  catch (error) { next(error); }
});

app.post('/api/ai/photo-analysis', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await aiDesign.analyzePhotos(request.body)); }
  catch (error) { next(error); }
});

app.post('/api/ai/design-chat', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await aiDesign.discussDesign(request.body)); }
  catch (error) { next(error); }
});

const siteContext = new SiteContextService();
app.get('/api/site-context', async (request, response, next) => {
  try {
    const address = typeof request.query.address === 'string' ? request.query.address : '';
    response.set('cache-control', 'public, max-age=300').json(await siteContext.forAddress(address));
  } catch (error) { next(error); }
});

// POST variant: analyze the SAME parcel outline the client already drew, so yard
// orientation and setbacks are computed on the exact geometry shown (not a second fetch
// that can return a different shape for the same address).
app.post('/api/site-context', async (request, response, next) => {
  try {
    const { rings, attributes, address } = request.body || {};
    if (Array.isArray(rings) && rings.length && Array.isArray(rings[0]) && rings[0].length >= 3) {
      response.set('cache-control', 'no-store').json(await siteContext.forParcel(rings, attributes || {}));
    } else {
      response.set('cache-control', 'no-store').json(await siteContext.forAddress(typeof address === 'string' ? address : ''));
    }
  } catch (error) { next(error); }
});

app.get('/api/feedback/capabilities', (_request, response) => {
  response.set('cache-control', 'no-store').json({ schema: 'feedback-capabilities/v1', assistantConfigured: feedbackAssistant.configured });
});

app.post('/api/feedback/assist', async (request, response, next) => {
  try { response.set('cache-control', 'no-store').json(await feedbackAssistant.chat(request.body?.messages, request.body?.context)); }
  catch (error) { next(error); }
});

app.post('/api/feedback/draft', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await feedbackAssistant.draft(request.body?.messages, request.body?.context)); }
  catch (error) { next(error); }
});

app.post('/api/feedback', async (request, response, next) => {
  try { response.status(201).set('cache-control', 'no-store').json(await feedbackStore.create(request.body)); }
  catch (error) { next(error); }
});

app.get('/api/feedback', async (_request, response, next) => {
  try { response.set('cache-control', 'no-store').json(await feedbackStore.list()); }
  catch (error) { next(error); }
});

app.post('/api/review-exchange', async (request, response, next) => {
  try {
    const created = await reviewExchange.create(request.body);
    response.status(201).set('cache-control', 'no-store').json(created);
  } catch (error) { next(error); }
});

app.get('/api/review-exchange/:id/reviewer', async (request, response, next) => {
  try {
    response.set('cache-control', 'no-store').json(await reviewExchange.getForReviewer(request.params.id, bearerToken(request)));
  } catch (error) { next(error); }
});

app.get('/api/review-exchange/:id/owner', async (request, response, next) => {
  try {
    response.set('cache-control', 'no-store').json(await reviewExchange.getForOwner(request.params.id, bearerToken(request)));
  } catch (error) { next(error); }
});

app.post('/api/review-exchange/:id/review', async (request, response, next) => {
  try {
    response.status(201).set('cache-control', 'no-store').json(await reviewExchange.submitReview(request.params.id, bearerToken(request), request.body));
  } catch (error) { next(error); }
});

app.get('/api/municipal-submission/capabilities', (_request, response) => {
  response.set('cache-control', 'no-store').json(municipalDelivery.capabilities());
});

app.post('/api/municipal-submission/sidney', async (request, response, next) => {
  try {
    response.status(201).set('cache-control', 'no-store').json(await municipalDelivery.submit(request.body));
  } catch (error) { next(error); }
});

app.get('/api/sidney-application', async (_request, response) => {
  try {
    const result = await fetch(sidneyApplicationUrl, { headers: { accept: 'application/pdf' } });
    if (!result.ok) return response.status(result.status).json({ error: 'Official Town of Sidney form unavailable.' });
    const body = Buffer.from(await result.arrayBuffer());
    response.status(200).type('application/pdf').set('cache-control', 'public, max-age=3600').send(body);
  } catch (error) {
    console.error('Sidney application proxy failed', error);
    response.status(502).json({ error: 'Official Town of Sidney form unavailable.' });
  }
});

for (const [route, upstream] of Object.entries(datasets)) {
  app.get(route, async (request, response) => {
    try {
      const url = new URL(upstream);
      for (const [key, value] of Object.entries(request.query)) {
        if (typeof value === 'string') url.searchParams.set(key, value);
      }
      const result = await fetch(url, { headers: { accept: 'application/geo+json, application/json' } });
      const body = await result.text();
      response.status(result.status).type(result.headers.get('content-type') || 'application/json').set('cache-control', 'public, max-age=300').send(body);
    } catch (error) {
      console.error(`GIS proxy failed for ${route}`, error);
      response.status(502).json({ error: 'Municipal GIS service unavailable.' });
    }
  });
}

app.use((error, _request, response, _next) => {
  if (error instanceof ReviewExchangeError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof MunicipalDeliveryError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof AiDesignError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof FeedbackError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof FeedbackAssistantError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof SiteContextError) return response.status(error.status).json({ error: error.code, message: error.message });
  if (error?.type === 'entity.too.large') return response.status(413).json({ error: 'payload-too-large', message: 'The package exceeds the 22 MB request limit.' });
  console.error('Unhandled server error', error);
  response.status(500).json({ error: 'server-error', message: 'The request could not be completed.' });
});

app.use(express.static(join(root, 'dist')));
app.get('*path', (_request, response) => response.sendFile(join(root, 'dist', 'index.html')));
app.listen(port, () => console.log(`Deck Permit server listening on http://localhost:${port}`));

function bearerToken(request) {
  const authorization = request.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}
