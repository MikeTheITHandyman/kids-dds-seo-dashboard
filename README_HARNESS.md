# AI Visibility Test Harness (Kids Dentist - Grayslake, IL)

## Overview
This harness runs weekly search-grounded queries across AI search engines (**OpenAI ChatGPT**, **Google Gemini**, **Anthropic Claude**, and **Perplexity Sonar**) to measure whether "Kids Dentist" (Dr. Sonia Gutierrez & Associates, Grayslake, IL) is recommended for pediatric dental queries across target Lake County and Southern Wisconsin communities.

---

## 1. Engine & Grounding Architecture

Unlike standard LLM completions that rely on stale parameter memory, all engine calls in this harness are search-grounded:
- **Google Gemini**: Uses `gemini-flash-latest` with `tools: [{ google_search: {} }]` and `thinkingBudget: 0`. Live search citations are extracted from `groundingMetadata`.
- **OpenAI ChatGPT**: Uses `gpt-4o` with the native `web_search` tool (`search_context: true`).
- **Anthropic Claude**: Uses `claude-haiku-4-5-20251001` (or fallback `claude-sonnet-4-5-20250929`) with the `web_search_20250305` server tool.
- **Perplexity**: Uses `sonar` via the Perplexity chat completions API with native citation indexes.

### Preflight Health Check
Before any prompt run begins, `lib/ai-harness/preflight.ts` executes a minimal test call against each engine. If an engine's API key is missing or model ID is retired:
- That engine is aborted for the run.
- The failure is logged and surfaced as a critical alert.
- Other engines continue uninterrupted.
- **Error text is never written into results or CSV files.**

---

## 2. Deterministic Mention Detector

Located at `lib/ai-harness/detector.ts`:
- **STRONG**: Practice website (`kidsdds.com`), address (`160 Commerce`), phone (`(847) 223-1400`), or doctor names (`Sonia Gutierrez`, `Rutcosky`, `Alrayyes`, `Anne-Ashley Compton`, `Gutierrez & Associates`).
- **WEAK**: "Kids Dentist" occurring in the same item/paragraph as "Grayslake" with no conflicting city.
- **COLLISION**: "Kids Dentist" associated with another city (e.g. "Kids Dentist, PC" in Gurnee, or "Kids Dentist, Inc." in Lake Zurich). **Never counted as a mention.**
- **NONE**: Practice not mentioned.

---

## 3. Configuration & Customization

All configurations are defined in `lib/ai-harness/config.ts`:

### Adding a Target City
Add the city name to `DEFAULT_CONFIG.primaryCities` or `secondaryCities`:
```ts
primaryCities: [
  "Grayslake",
  "Round Lake Beach",
  "Your New City"
]
```

### Adding a Prompt Topic
Add an entry to `TOPICS`:
```ts
{
  id: "fluoride",
  name: "Fluoride Treatments",
  category: "pediatric",
  templates: {
    natural: "fluoride treatments for children {city}",
    explicit: "Which pediatric dental practices offer child fluoride treatments in or near {city}? Please list specific clinics.",
    spanish: "tratamiento de flúor para niños en {city}"
  }
}
```

---

## 4. Running the Harness

### CLI / Local Execution
```bash
# Run unit tests on mention classifier
npx tsx tests/detector.test.ts

# Dry run (1 city x 2 topics x active engines x 1 repeat)
npx tsx scripts/run-harness.ts --dry-run

# Full run with custom repeats
npx tsx scripts/run-harness.ts --repeats=3
```

### Linux Crontab Entry (Self-Hosted)
Run early every Monday morning at 03:00 AM CST (09:00 UTC):
```crontab
0 3 * * 1 cd /path/to/kids_dds_SEO_dashboard/dashboard-app && /usr/bin/npx tsx scripts/run-harness.ts >> /var/log/ai-harness.log 2>&1
```

### Exit Codes
- `0`: Complete success (all active engines passed, failure rate <= 20%).
- `1`: Degraded run (engine failure rate > 20%, or one or more engines failed preflight).
- `2`: Fatal run failure (all engines failed, or lock conflict).

---

## 5. Outputs & Reports

Runs produce long-format CSV files and executive summaries:
- **Run Directory**: `data/runs/YYYY-MM-DD/run_YYYY-MM-DD.csv`
- **Master Historical CSV**: `data/runs/master_history.csv`
- **Executive Markdown Summary**: `data/runs/YYYY-MM-DD/summary_YYYY-MM-DD.md`

### CSV Schema (17 Columns):
`run_date, engine, model, prompt_id, topic, location, language, phrasing, run_idx, status, mention_class, list_position, kidsdds_cited, cited_domains, competitors, response_text, response_hash`

---

## 6. Cost Estimates
- **Gemini (`gemini-flash-latest`)**: ~$0.0005 per grounded query.
- **OpenAI (`gpt-4o`)**: ~$0.005–$0.01 per query.
- **Claude (`claude-haiku-4-5-20251001`)**: ~$0.003–$0.006 per query.
- **Perplexity (`sonar`)**: ~$0.005 per query.
- **Average Cost per Full Run** (~60–120 grounded calls): **$0.40 – $1.20 USD per week**.
