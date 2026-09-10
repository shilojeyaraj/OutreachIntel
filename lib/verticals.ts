/**
 * Outreach verticals. Each vertical swaps the company/role presets shown in the
 * form, the Apify search hint, and the "who to prioritize" block in the prompt.
 * The engine itself (route + prompt + apify) is vertical-agnostic; it just reads
 * the config named by `OutreachInput.vertical` (default: 'ai-ml').
 */

export type VerticalId = 'ai-ml' | 'health-tech';

export interface Vertical {
  id: VerticalId;
  label: string;
  tagline: string;
  companies: string[];
  defaultCompanies: string[];
  roleTypes: string[];
  defaultBackground: string;
  proTips: string[];
  /** Search keywords OR-joined into the Apify `site:linkedin.com/in` query. */
  searchRoleHint: string;
  /** The numbered "Prioritize in this order" list injected into the prompt. */
  promptPriorities: string[];
  /**
   * Company list the BULK harvest fans out over — much wider than `companies`
   * and independent of what the user picked in the form. Bulk mode ignores the
   * form's company filter entirely ("find people at every kind of company").
   */
  bulkCompanies: string[];
  /** Broad, company-agnostic category phrases for extra bulk harvest queries. */
  bulkCategoryTerms: string[];
}

const AI_ML: Vertical = {
  id: 'ai-ml',
  label: 'AI / ML',
  tagline: 'OpenRouter · GPT-4 · Apify Live Search',
  companies: [
    'Google / DeepMind',
    'Meta AI',
    'OpenAI',
    'Anthropic',
    'Microsoft / MSR',
    'Amazon / AWS',
    'Nvidia',
    'Apple',
    'Cohere',
    'Hugging Face',
    'Mistral AI',
    'Shopify',
    'Databricks',
    'Scale AI',
    'Waymo',
    'xAI',
  ],
  defaultCompanies: ['Google / DeepMind', 'Meta AI', 'OpenAI', 'Anthropic', 'Nvidia'],
  roleTypes: [
    'Machine Learning Engineer Intern',
    'Software Engineer Intern',
    'AI Research Intern',
    'Applied Scientist Intern',
    'ML Infrastructure Intern',
  ],
  defaultBackground: `2nd year Mechatronics Engineering @ University of Waterloo, pursuing AI specialization.
Currently MLE intern @ Cohere Labs (PyTorch, LoRA, LLM inference optimization) and ML Engineering Intern @ biotech AI lab (LangGraph multi-agent systems, RAG, pgvector).
Previous founding engineer at FinTech startup (FastAPI, PostgreSQL, WebSockets, RAG pipeline).
Strong in Python, C++, TypeScript, PyTorch, LangChain.
Built GPU Training Autotuner with NVML/CUDA C++ bindings.
Won 2nd place at NexHacks 2026 @ CMU for a real-time Polymarket intelligence Chrome extension.`,
  proTips: [
    'Personalize every message — find one specific detail from their actual LinkedIn before sending.',
    'Best send times: Tuesday–Thursday, 8–10am or 6–8pm in their timezone.',
    'Send connection request + note simultaneously (LinkedIn note limit: 300 chars).',
    'One follow-up after 7 days max — keep it short.',
    'UWaterloo alumni respond at ~3× the rate of cold strangers for Waterloo students.',
    'Former interns (1–3 years out) have the highest referral conversion rate — they remember how they got in.',
  ],
  searchRoleHint: 'engineer OR recruiter OR intern',
  promptPriorities: [
    'UWaterloo / Canadian university alumni at the target company (highest response rate)',
    'Former interns who went full-time 1-4 years ago (they remember recruiting)',
    'University recruiters / intern program managers',
    'MLEs or SWEs on relevant teams (AI infra, LLM, agents, applied research)',
  ],
  bulkCompanies: [
    'Google DeepMind',
    'Meta AI',
    'OpenAI',
    'Anthropic',
    'Microsoft Research',
    'Nvidia',
    'Apple',
    'Amazon AWS AI',
    'Cohere',
    'Hugging Face',
    'Mistral AI',
    'Databricks',
    'Scale AI',
    'Snorkel AI',
    'Runway',
    'Perplexity AI',
    'Character AI',
    'Adept AI',
    'Together AI',
    'Contextual AI',
    'Waymo',
    'Cruise',
    'xAI',
    'Stability AI',
    'AssemblyAI',
    'Weights & Biases',
    'LangChain',
    'LlamaIndex',
    'Pinecone',
    'Modal Labs',
  ],
  bulkCategoryTerms: [
    'machine learning engineer',
    'applied scientist',
    'AI research engineer',
    'ML infrastructure engineer',
    'university recruiter AI',
  ],
};

const HEALTH_TECH: Vertical = {
  id: 'health-tech',
  label: 'Health tech',
  tagline: 'Health-tech founders & PMs · Apify Live Search',
  companies: [
    'Epic Systems',
    'Oracle Health / Cerner',
    'Tempus',
    'Verily',
    'Flatiron Health',
    'Komodo Health',
    'Abridge',
    'Included Health',
    'Oscar Health',
    'Cedar',
    'Datavant',
    'Innovaccer',
    'Hinge Health',
    'Maven Clinic',
    'Ro',
    'Commure / Athelas',
  ],
  defaultCompanies: ['Epic Systems', 'Verily', 'Tempus', 'Abridge', 'Included Health'],
  roleTypes: [
    'Product Manager, Digital Health',
    'Associate Product Manager (APM)',
    'Product Manager Intern',
    'Founder / Co-founder (Health Tech)',
    'Clinical Product Manager',
    'Product Operations Manager',
  ],
  defaultBackground: `Final-year student pivoting into health-tech product management.
Engineering + life-sciences background; comfortable with SQL, Figma, user research, and reading clinical workflows.
Summer PM intern at a Series A digital health startup — owned the patient onboarding flow, ran interviews with clinicians, scoped an EHR integration.
Built a scheduling side project piloted by a local clinic.
Looking for an APM or health-tech PM role and advice from people who broke in without a traditional PM background.`,
  proTips: [
    'Lead with a specific product insight — name a workflow gap you noticed in their product or an adjacent one.',
    'Founders reply fastest to short notes with a clear ask and evidence you understand the clinical problem.',
    'APM programs (Verily, Included Health, Oscar, Cedar) recruit in cycles — ask recruiters about timelines.',
    'Clinicians who moved into product love talking about the transition — ask how they learned the product side.',
    'Show HIPAA / EHR / payer-provider fluency where you have it; it signals you are serious about health specifically.',
    'Early PMs and founders from acquired health-tech startups are the highest-signal advisors.',
  ],
  searchRoleHint:
    'product manager OR "associate product manager" OR APM OR founder OR "product lead" OR recruiter',
  promptPriorities: [
    'Shared-school or shared-city alumni at the target company (highest response rate)',
    'Health-tech founders and early employees — they hire generalist PMs and give the most candid advice',
    'PMs and APMs who broke in without a traditional product background, plus clinicians who moved into product',
    'Product / APM-program recruiters and talent partners',
  ],
  // Wide net across every kind of healthcare / health-tech company — EHR, payer,
  // provider, pharma-tech, diagnostics, digital-health, health data, care delivery.
  bulkCompanies: [
    'Epic Systems',
    'Oracle Health',
    'Cerner',
    'athenahealth',
    'Veradigm',
    'NextGen Healthcare',
    'Tempus',
    'Verily',
    'Flatiron Health',
    'Komodo Health',
    'Truveta',
    'Datavant',
    'Innovaccer',
    'Abridge',
    'Ambience Healthcare',
    'Nabla',
    'Suki AI',
    'Commure',
    'Athelas',
    'Notable Health',
    'Rad AI',
    'Aidoc',
    'Viz.ai',
    'PathAI',
    'Included Health',
    'Oscar Health',
    'Devoted Health',
    'Clover Health',
    'Cityblock Health',
    'Cedar',
    'Waystar',
    'Olive AI',
    'Garner Health',
    'Hinge Health',
    'Sword Health',
    'Omada Health',
    'Virta Health',
    'Maven Clinic',
    'Ro',
    'Hims & Hers',
    'Cerebral',
    'Spring Health',
    'Lyra Health',
    'Headway',
    'Alma',
    'Grow Therapy',
    'Brightside Health',
    'Carbon Health',
    'Forward Health',
    'Tia',
    'Zocdoc',
    'Doximity',
    'Doceree',
    'Solv Health',
    'GoodRx',
    'Capsule',
    'Alto Pharmacy',
    'Recursion Pharmaceuticals',
    'Insitro',
    'Benchling',
    'Veeva Systems',
    'Komodo',
    'Health Gorilla',
    'Particle Health',
    'Redox',
    'Rippling Health',
    'Transcarent',
    'Collective Health',
    'Nuna',
    'Clarify Health',
    'Cohere Health',
    'Machinify',
    'Turquoise Health',
    'Nym Health',
    'Fabric Health',
    'Memora Health',
    'Wellframe',
    'Bicycle Health',
    'Firefly Health',
    'Firsthand',
    'Unite Us',
    'findhelp',
    'Papa',
    'DispatchHealth',
    'Medically Home',
    'Biofourmis',
    'Current Health',
    'Vivalink',
  ],
  bulkCategoryTerms: [
    'digital health product manager',
    'healthcare product manager',
    'health tech founder',
    'EHR product manager',
    'clinical product manager',
    'payer product manager',
    'health data product manager',
    'associate product manager health',
    'telehealth product manager',
    'value-based care product',
  ],
};

export const VERTICALS: Record<VerticalId, Vertical> = {
  'ai-ml': AI_ML,
  'health-tech': HEALTH_TECH,
};

export const DEFAULT_VERTICAL: VerticalId = 'ai-ml';

export function getVertical(id: VerticalId | undefined): Vertical {
  return VERTICALS[id ?? DEFAULT_VERTICAL] ?? VERTICALS[DEFAULT_VERTICAL];
}
