import type { OutreachInput } from './types';

export interface PromptOptions {
  searchResults?: string;
  /** Preset-supplied ranking guidance, injected as a PRIORITY GUIDANCE block. */
  priorityHints?: string;
}

export function buildPrompt(input: OutreachInput, opts: PromptOptions = {}): string {
  const count = input.count;
  const companies = input.companies.filter((c) => c.trim().length > 0);
  const perOrg = Math.max(2, Math.ceil(count / 2));

  const focusLine =
    companies.length > 0
      ? `- Focus organizations: ${companies.join(', ')}`
      : '- Focus organizations: no specific organizations — cast a wide net across relevant companies';
  const regionLine =
    input.region && input.region.trim() ? `\n- Region focus: ${input.region.trim()}` : '';
  const priorityBlock =
    opts.priorityHints && opts.priorityHints.trim()
      ? `\nPRIORITY GUIDANCE:\n${opts.priorityHints.trim()}\n`
      : '';
  const groundingBlock = opts.searchResults
    ? `\nLIVE LINKEDIN SEARCH RESULTS — use these REAL people. Do not invent names. Pick the ${count} best matches from this list.\n\n${opts.searchResults}\n`
    : '';

  return `You help someone identify and contact the right people for a specific goal. Return ONLY a raw JSON object. No markdown. No backticks. No explanation. No trailing commas. The JSON must be 100% valid.

Generate ${count} LinkedIn outreach targets for this person:
- Looking for: ${input.persona}
- About the requester: ${input.background}
- Goal: ${input.goal}
${focusLine}${regionLine}
${priorityBlock}${groundingBlock}
Required JSON schema:
{"strategy":"string","people":[{"name":"string","company":"string","role":"string","why":"string","hook":"string","score":9,"tags":["tag1","tag2"],"linkedin_query":"string","linkedin_url":"string","message":"string"}]}

Rules:
- people: exactly ${count} entries spread across DIFFERENT organizations (no more than ${perOrg} per organization)
- ${opts.searchResults ? 'Names, roles, companies, and linkedin_url MUST come from the LIVE LINKEDIN SEARCH RESULTS above. Copy the LinkedIn field VERBATIM into linkedin_url — it is the real profile URL (e.g. https://www.linkedin.com/in/gurshaantmalik). Do NOT invent profile URLs.' : 'Use realistic names plausible for the organization. Set linkedin_url to an empty string since you do not have verified URLs.'}
- company: the person current employer, or their own company if they are a founder
- score: integer 1-10 reflecting how likely they are to respond and genuinely help with the goal
- tags: 2-3 short labels e.g. "Founder", "Product Leader", "Recent Switcher", "UWaterloo Alum", "Hiring"
- why: one or two sentences on why this specific person is worth contacting
- hook: a concrete personal connection angle between the requester and this person
- message: under 120 words, personalized to the requester actual background (mention specific projects, internships, skills)
- linkedin_query: a backup LinkedIn people-search string in case the URL fails (e.g. "Jane Smith Verily product manager")
- linkedin_url: full profile URL from the search results, or an empty string if none is available
- strategy: 2-3 sentence overall outreach strategy tailored to this requester and goal

CRITICAL — every string value in the JSON must contain ZERO apostrophes and ZERO quotation marks.
Write "I am" not "I'm". Write "I have" not "I've". Write "do not" not "don't". Write "would not" not "wouldn't".
Any apostrophe or unescaped quote will break JSON.parse and crash the app.
Do not wrap company names or project names in quotes inside the message field.`;
}
