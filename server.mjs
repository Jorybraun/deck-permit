import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReviewExchangeError, ReviewExchangeStore } from './server/reviewExchangeStore.mjs';
import { MunicipalDeliveryError, MunicipalDeliveryService } from './server/municipalDelivery.mjs';

const app = express();
const port = Number(process.env.PORT || 4173);
const root = dirname(fileURLToPath(import.meta.url));
const reviewExchange = new ReviewExchangeStore(process.env.DECK_PERMIT_DATA_DIR || join(root, '.deck-permit-data'));
const dataDirectory = process.env.DECK_PERMIT_DATA_DIR || join(root, '.deck-permit-data');
const municipalDelivery = new MunicipalDeliveryService({ apiKey: process.env.RESEND_API_KEY, fromEmail: process.env.PERMIT_SUBMISSION_FROM_EMAIL, dataDirectory });
app.use(express.json({ limit: '22mb' }));
const arcgisBase = 'https://services5.arcgis.com/MNn7A6yzK94Hggl3/arcgis/rest/services';
const datasets = {
  '/api/sidney-property': `${arcgisBase}/Sync_Enabled_Property_Line_NEW/FeatureServer/0/query`,
  '/api/sidney-rooflines': `${arcgisBase}/Sync_Enabled_Rooflines/FeatureServer/0/query`,
};

const sidneyApplicationUrl = 'https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf';

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
