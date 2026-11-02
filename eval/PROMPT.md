# Prompt for writing test queries

Upload one sample set to a chat with the prompt below, using a different model for each
set: `eval/sample-strips-1.jsonl` to ChatGPT, `eval/sample-strips-2.jsonl` to Gemini.
Save each answer as `eval/test-queries-<model>.json` (for example `test-queries-chatgpt.json`)
and run `npm run eval`, which reads every `eval/test-queries*.json` and reports each one.

```
The attached file has one comic strip per line: date, title, situation, punchline and
summary. I'm testing a search engine where people describe a strip in their own words
to find it. For EVERY entry in the file, write 3 search queries someone might type to
find that strip:

1. Short and vague: 3-6 words.
2. A full sentence describing something that happened to them, as if it happened at
   their own job (or in their own life, if the strip isn't about work).
3. A half-remembered description of the joke, the way someone vaguely recalls a strip
   they read years ago.

Rules:
- Don't use character names (Dilbert, Dogbert, Wally, Alice, Asok, Catbert, Ratbert,
  the Boss, etc.). "My manager", "a coworker" or "the dog" are fine.
- Use your own words. Avoid the distinctive words and phrases in the entry's title,
  situation, punchline and summary.
- Write like a real person typing into a search box: plain, sometimes imprecise.
- Read every entry in full before writing its queries. Don't skip or merge entries.

Output only a JSON object, keyed by each entry's exact date, with the queries in the
order above, as a downloadable file named test-queries.json:
{ "YYYY-MM-DD": ["short query", "full sentence query", "half-remembered query"], ... }
```

Check 5-10 entries before using the file. If many queries reuse words from the strip's
title or summary, ask for them to be rewritten.

Keep these queries for testing only. Don't also add them to the data the search uses,
or the test would check the search against its own answers.
