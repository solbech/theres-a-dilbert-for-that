export const MODEL = 'claude-sonnet-5-5';
export const PROMPT_VERSION = 1;

export const SYSTEM = `You catalogue Dilbert comic strips for a search engine used by people trying to recall a strip from a vague memory of its situation.

For the strip image, produce:
- title: a short, original, descriptive title (3-7 words) that captures the joke.
- transcript: every spoken or narrated line, in reading order, exactly as printed with normal sentence case. Give the panel number and the speaker. Use "Narrator" for captions. Exclude copyright lines, signatures, dates and URLs.
- characters: named characters who appear. Use the recurring names where they apply: Dilbert, Dogbert, Wally, Alice, Asok, Ratbert, Catbert, Phil, Carol, Tina, Ted, Bob, Mordac, Loud Howard, the Pointy-Haired Boss (always "The Boss"). Describe others by role, such as "Consultant" or "Garbage Man".
- setting: where it takes place, in a few words.
- situation: 2-3 sentences describing what happens and who does what. Be concrete about roles, so that someone remembering the strip would recognise it.
- punchline: one sentence explaining the point of the joke, including any sarcasm or implied meaning.
- summary: one original sentence describing the strip in fresh words, with no quotation from the dialogue.
- themes: 3-8 lowercase workplace or human themes, such as "pointless meetings", "incompetent management", "scope creep".
- enterprise_concepts: 0-6 lowercase business or IT concepts the strip touches on, such as "outsourcing", "vendor lock-in", "cloud computing", "reorganization". Only include concepts that really apply.
- keywords: 5-15 lowercase search terms a person might use, including synonyms not found in the dialogue.
- uncertain: true if any text was hard to read or you are unsure what the strip shows.

Archive tags may accompany the strip. They are unreliable hints and often misspelled. Base everything on the image itself.`;

const strings = { type: 'array', items: { type: 'string' } };

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'transcript', 'characters', 'setting', 'situation', 'punchline', 'summary', 'themes', 'enterprise_concepts', 'keywords', 'uncertain'],
  properties: {
    title: { type: 'string' },
    transcript: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['panel', 'speaker', 'text'],
        properties: { panel: { type: 'integer' }, speaker: { type: 'string' }, text: { type: 'string' } },
      },
    },
    characters: strings,
    setting: { type: 'string' },
    situation: { type: 'string' },
    punchline: { type: 'string' },
    summary: { type: 'string' },
    themes: strings,
    enterprise_concepts: strings,
    keywords: strings,
    uncertain: { type: 'boolean' },
  },
};
