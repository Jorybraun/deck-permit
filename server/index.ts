import express from 'express';
import cors from 'cors';
import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNodeExpressEndpoint } from '@copilotkit/runtime';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1',
});

const serviceAdapter = new OpenAIAdapter({ openai });

const runtime = new CopilotRuntime({
  actions: [
    {
      name: 'lookup_property',
      description: 'Geocode an address and fetch parcel polygon, lot area, and zoning.',
      parameters: [
        { name: 'address', type: 'string', description: 'Full street address', required: true },
      ],
      handler: async ({ address }: { address: string }) => {
        const { lookupProperty } = await import('./src/services/propertyLookup');
        const { lookupZoning, computeBuildableEnvelope, lookupSnowLoad } = await import('./src/services/zoning');
        const { address: addr, parcel } = await lookupProperty(address);
        const zoning = lookupZoning(parcel);
        const envelope = computeBuildableEnvelope(parcel, zoning);
        const snowLoad = lookupSnowLoad(addr.coordinates[1], addr.coordinates[0]);
        return {
          address: addr,
          parcel,
          zoning,
          buildableEnvelope: envelope,
          snowLoad,
        };
      },
    },
    {
      name: 'research_permit_requirements',
      description: 'Research permit requirements for a municipality.',
      parameters: [
        { name: 'municipality', type: 'string', description: 'Municipality name', required: true },
        { name: 'project_type', type: 'string', description: 'Type of project', required: false },
      ],
      handler: async ({ municipality, project_type }: { municipality: string; project_type?: string }) => {
        const { researchPermitRequirements } = await import('./src/services/research');
        const result = await researchPermitRequirements(municipality, project_type || 'residential deck', process.env.CEREBRAS_API_KEY || '');
        return result;
      },
    },
    {
      name: 'web_search',
      description: 'Search the web for current information.',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
      ],
      handler: async ({ query }: { query: string }) => {
        const { webSearch } = await import('./src/services/research');
        return await webSearch(query);
      },
    },
    {
      name: 'fetch_url',
      description: 'Fetch a webpage and extract text.',
      parameters: [
        { name: 'url', type: 'string', description: 'URL to fetch', required: true },
      ],
      handler: async ({ url }: { url: string }) => {
        const { fetchWebpage } = await import('./src/services/research');
        return await fetchWebpage(url);
      },
    },
    {
      name: 'create_deck',
      description: 'Create a parametric deck with auto-sized structure.',
      parameters: [
        { name: 'shape', type: 'string', description: 'rectangle | l-shape | wraparound', required: true },
        { name: 'width_m', type: 'number', description: 'Deck width in meters', required: true },
        { name: 'depth_m', type: 'number', description: 'Deck depth in meters', required: true },
        { name: 'height_mm', type: 'number', description: 'Height above grade in mm', required: true },
        { name: 'attached', type: 'boolean', description: 'Attached to house', required: false },
        { name: 'house_wall', type: 'string', description: 'north | south | east | west', required: false },
      ],
      handler: async (args: any) => {
        // Note: this needs the current property/parcel from session state; for now return an error guiding the agent
        return { error: 'create_deck requires property state. Call lookup_property first and maintain state.' };
      },
    },
  ],
});

const { router } = copilotRuntimeNodeExpressEndpoint({
  endpoint: '/copilotkit',
  runtime,
  serviceAdapter,
});

app.use('/copilotkit', router);

const PORT = process.env.COPILOT_PORT || 4000;
app.listen(PORT, () => {
  console.log(`CopilotKit runtime running on http://localhost:${PORT}/copilotkit`);
});
