/**
 * Search presets. Each preset pre-fills the freeform form fields and supplies
 * two hint strings the server uses when it builds the model prompt and the
 * live LinkedIn search query:
 *
 *   - priorityHints: injected into the prompt as PRIORITY GUIDANCE so the model
 *     knows which kinds of people to rank highest for this kind of search.
 *   - searchHints: extra keywords OR-ed into the Apify LinkedIn query.
 *
 * The `custom` preset carries no hints — it is the "just use my freeform text"
 * option and the fallback for an unknown id.
 */

export interface PresetDefaults {
  persona: string;
  goal: string;
  companies: string[];
  background: string;
  region: string;
}

export interface Preset {
  id: string;
  label: string;
  personaPlaceholder: string;
  defaults: PresetDefaults;
  priorityHints: string;
  searchHints: string;
}

const TECH_BACKGROUND = `2nd year Mechatronics Engineering @ University of Waterloo, pursuing AI specialization.
Currently MLE intern @ Cohere Labs (PyTorch, LoRA, LLM inference optimization) and ML Engineering Intern @ biotech AI lab (LangGraph multi-agent systems, RAG, pgvector).
Previous founding engineer at FinTech startup (FastAPI, PostgreSQL, WebSockets, RAG pipeline).
Strong in Python, C++, TypeScript, PyTorch, LangChain.
Built GPU Training Autotuner with NVML/CUDA C++ bindings.
Won 2nd place at NexHacks 2026 @ CMU for a real-time Polymarket intelligence Chrome extension.`;

const HEALTH_TECH_PM_BACKGROUND = `2nd year Mechatronics Engineering @ University of Waterloo, moving toward product management in health tech.
Engineering background: ML/LLM internships (Cohere Labs, a biotech AI lab building LangGraph multi-agent + RAG systems), founding engineer at a FinTech startup.
Comfortable talking to engineers and clinicians, shipping under regulatory constraints, and translating messy user needs into specs.
Looking to break into an APM / PM role at a digital health or health tech company.`;

export const PRESETS: Preset[] = [
  {
    id: 'tech-internship',
    label: 'Tech internship (referrals & advice)',
    personaPlaceholder:
      'e.g. ML and infra engineers, recruiters, and former interns at large AI labs',
    defaults: {
      persona:
        'Engineers, recruiters, and recent former interns on AI / ML / infra teams at large tech and AI companies',
      goal: 'Get a referral for a summer internship and insider recruiting advice',
      companies: ['Google / DeepMind', 'Meta AI', 'OpenAI', 'Anthropic', 'Nvidia', 'Cohere'],
      background: TECH_BACKGROUND,
      region: '',
    },
    priorityHints: `Rank people in this order:
1. University of Waterloo or other Canadian university alumni at the target company (highest response rate)
2. Former interns who converted to full time 1 to 4 years ago (they still remember recruiting)
3. University recruiters and intern program managers
4. Engineers on teams relevant to the requester (AI infra, LLM, agents, applied research)`,
    searchHints: '"software engineer" OR "machine learning" OR recruiter OR "former intern"',
  },
  {
    id: 'health-tech-pm',
    label: 'Health tech PM path (founders & product leaders)',
    personaPlaceholder:
      'e.g. product managers and founders working on care navigation or provider EHR workflow',
    defaults: {
      persona:
        'Health tech product managers, product leaders, and founders, plus people who moved into health tech PM from engineering, consulting, or clinical roles in the last 1 to 3 years',
      goal: 'Get advice on breaking into health tech product management and, where it fits, a referral for an APM or PM role',
      companies: [
        'Verily',
        'Google Health',
        'Microsoft Health & Life Sciences',
        'Oracle Health',
        'Epic',
        'Oscar Health',
        'Ro',
        'Hims & Hers',
        'Cedar',
        'Commure',
        'Abridge',
        'Notable Health',
        'Innovaccer',
        'Maven Clinic',
        'Spring Health',
        'Transcarent',
        'Included Health',
        'League',
        'WELL Health',
        'TELUS Health',
        'PocketHealth',
      ],
      background: HEALTH_TECH_PM_BACKGROUND,
      region: '',
    },
    priorityHints: `Rank people in this order:
1. Product managers and product leaders (Senior PM, Group PM, Principal PM, Director of Product, VP Product, CPO) whose product area matches the requester interests
2. Founders, co-founders, and founding product managers of digital health and health tech startups
3. People who moved into health tech product management from engineering, consulting, or clinical roles in the last 1 to 3 years (highest empathy responders)
4. Technical program managers, solutions consultants, and implementation leads at health tech companies (common PM feeder roles)
5. Technical recruiters at health tech companies and talent partners at health tech venture firms (Rock Health, General Catalyst, a16z Bio and Health, Oxeon)
Also useful for context: clinical informaticists, regulatory or quality leads, and interoperability or FHIR specialists who partner closely with product.`,
    searchHints:
      '"product manager" OR "founder" OR "head of product" OR "clinical product" OR "digital health" OR "health tech"',
  },
  {
    id: 'custom',
    label: 'Custom (freeform, no hints)',
    personaPlaceholder: 'Describe exactly who you want to find',
    defaults: {
      persona: '',
      goal: '',
      companies: [],
      background: '',
      region: '',
    },
    priorityHints: '',
    searchHints: '',
  },
];

const CUSTOM_PRESET = PRESETS.find((p) => p.id === 'custom')!;

/** Look up a preset by id. Unknown ids and `undefined` fall back to `custom`. */
export function getPreset(id: string | undefined): Preset {
  if (!id) return CUSTOM_PRESET;
  return PRESETS.find((p) => p.id === id) ?? CUSTOM_PRESET;
}

export const DEFAULT_PRESET_ID = 'health-tech-pm';
