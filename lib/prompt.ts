import type { OutreachInput } from './types';

const GOAL_MAP: Record<OutreachInput['goal'], string> = {
  referral: 'get a referral to apply for an internship',
  advice: 'get insider career advice and recruiting tips',
  both: 'get both a referral and insider recruiting advice',
  coffee: 'set up an informational interview or coffee chat',
};

export interface PromptOptions {
  searchResults?: string;
}

export function buildPrompt(input: OutreachInput, opts: PromptOptions = {}): string {
  const count = input.count;
  const groundingBlock = opts.searchResults
    ? `\nLIVE LINKEDIN SEARCH RESULTS — use these REAL people. Do not invent names. Pick the ${count} best matches from this list.\n\n${opts.searchResults}\n`
    : '';

  return `You are an expert career coach. Return ONLY a raw JSON object. No markdown. No backticks. No explanation. No trailing commas. The JSON must be 100% valid.

Generate ${count} LinkedIn outreach targets for this student:
- Background: ${input.background}
- Target role: ${input.roleType}
- Term: ${input.term}
- Goal: ${GOAL_MAP[input.goal]}
- Companies: ${input.companies.join(', ')}
${groundingBlock}
Required JSON schema:
{"strategy":"string","people":[{"name":"string","company":"string","role":"string","why":"string","hook":"string","score":9,"tags":["tag1","tag2"],"linkedin_query":"string","linkedin_url":"string","message":"string"}]}

Rules:
- people: exactly ${count} entries spread across DIFFERENT companies from the list (no more than ${Math.max(2, Math.ceil(count / 2))} per company)
- ${opts.searchResults ? 'Names, roles, companies, and linkedin_url MUST come from the LIVE LINKEDIN SEARCH RESULTS above. Copy the LinkedIn field VERBATIM into linkedin_url — it is the real profile URL (e.g. https://www.linkedin.com/in/gurshaantmalik). Do NOT invent profile URLs.' : 'Use realistic names plausible for the company. Set linkedin_url to an empty string since you do not have verified URLs.'}
- score: integer 1-10 reflecting how likely they are to respond and help
- tags: 2-3 short labels e.g. "UWaterloo Alum", "Former Intern", "Active Recruiter"
- message: under 120 words, personalized to this student's actual experience (mention specific projects, internships, skills from the background)
- linkedin_query: a backup LinkedIn people-search string in case the URL fails (e.g. "Gary Smith Meta AI Waterloo")
- linkedin_url: full profile URL from the search results, e.g. https://www.linkedin.com/in/gurshaantmalik
- strategy: 2-3 sentence overall outreach strategy tailored to this student

Prioritize in this order:
1. UWaterloo / Canadian university alumni at the target company (highest response rate)
2. Former interns who went full-time 1-4 years ago (they remember recruiting)
3. University recruiters / intern program managers
4. MLEs or SWEs on relevant teams (AI infra, LLM, agents, applied research)

CRITICAL — every string value in the JSON must contain ZERO apostrophes and ZERO quotation marks.
Write "I am" not "I'm". Write "I have" not "I've". Write "do not" not "don't". Write "would not" not "wouldn't".
Any apostrophe or unescaped quote will break JSON.parse and crash the app.
Do not wrap company names or project names in quotes inside the message field.`;
}
