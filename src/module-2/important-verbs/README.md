# Important Verbs backend module

This module implements the Important Verbs user APIs and the backend-only dataset pipeline. It does not add an Admin Panel feature.

## Implemented data flow

1. **Kaikki** imports Italian verb lemmas, English meanings, tags, auxiliary hints, simple forms, and available examples.
2. **UniMorph** validates simple conjugations, replaces stress-marked spellings with canonical spellings, and fills missing forms.
3. **Deterministic backend rules** create the 21 UI form groups, classify regular/irregular and `-ARE`/`-ERE`/`-IRE`, build English display meanings, and assemble compound tenses.
4. **Tatoeba v1** supplies Italian-English examples when a suitable direct translation exists.
5. **Deterministic examples** fill forms for which no Tatoeba example is found.
6. **Local LibreTranslate** translates English meanings, conjugation meanings, and examples into Bangla.
7. **PostgreSQL** stores the completed dataset. A provider-namespaced SHA-256 hash prevents unchanged English text from being translated again.
8. **Flutter TTS** speaks the returned Italian text with locale `it-IT`; the backend does not create audio files.

## Install the backend module

Copy the complete folder to:

```text
src/module-2/important-verbs
```

The supplied `AppModule` already contains:

```ts
ScheduleModule.forRoot();
ImportantVerbsModule;
```

Ensure `@nestjs/schedule` is installed.

Add this script to the existing `package.json`:

```json
{
  "scripts": {
    "verbs:sync": "ts-node -r tsconfig-paths/register src/module-2/important-verbs/scripts/sync-important-verbs.ts"
  }
}
```

Copy `important-verbs.env.example` values into the project `.env`.

## Run LibreTranslate locally

LibreTranslate must be running only while the import needs Bangla translations. After the sync completes, it can be stopped because Flutter reads the saved Bangla values from PostgreSQL.

### Option A: Docker

From the deliverable root:

```bash
docker compose -f libretranslate/docker-compose.yml up -d
```

Wait for the English and Bengali models to finish downloading, then verify:

```bash
curl http://127.0.0.1:5000/languages
```

Stop it after the dataset sync:

```bash
docker compose -f libretranslate/docker-compose.yml down
```

The named Docker volume keeps downloaded models for the next run.

### Option B: Python

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install libretranslate
libretranslate --load-only en,bn
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install libretranslate
libretranslate --load-only en,bn
```

LibreTranslate then runs at:

```text
http://127.0.0.1:5000
```

## Test local translation

```bash
curl -X POST http://127.0.0.1:5000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"I speak Italian.","source":"en","target":"bn","format":"text"}'
```

Expected response shape:

```json
{
  "translatedText": "আমি ইতালীয় ভাষায় কথা বলি।"
}
```

## Translation update tracking

For each English source string the backend stores:

```text
SHA-256(provider + pipeline version + source language + target language + text)
```

Behavior:

```text
English text unchanged + same pipeline version -> existing Bangla reused
English text changed                           -> translated again
LIBRETRANSLATE_PIPELINE_VERSION changed        -> translated again once
Old Azure/plain hash exists                    -> translated again once by LibreTranslate
```

The translation service also:

- checks that `en` and `bn` are loaded through `/languages`;
- sends batches to `/translate`;
- falls back to individual requests if a local build rejects a batch;
- validates that translated output contains Bengali characters;
- retries timeout, rate-limit, and server errors;
- supports an optional API key for a protected self-hosted instance.

## Environment values

Recommended local configuration:

```env
LIBRETRANSLATE_ENABLED=true
LIBRETRANSLATE_ENDPOINT=http://127.0.0.1:5000
LIBRETRANSLATE_API_KEY=
LIBRETRANSLATE_SOURCE_LANGUAGE=en
LIBRETRANSLATE_TARGET_LANGUAGE=bn
LIBRETRANSLATE_BATCH_SIZE=20
LIBRETRANSLATE_BATCH_MAX_CHARACTERS=8000
LIBRETRANSLATE_REQUEST_DELAY_MS=100
LIBRETRANSLATE_MAX_RETRIES=4
LIBRETRANSLATE_TIMEOUT_MS=120000
LIBRETRANSLATE_PIPELINE_VERSION=v1
```

When the NestJS backend itself runs in Docker but LibreTranslate runs on the host, use:

```env
LIBRETRANSLATE_ENDPOINT=http://host.docker.internal:5000
```

When both services are in the same Docker Compose network, use the LibreTranslate service name:

```env
LIBRETRANSLATE_ENDPOINT=http://libretranslate:5000
```

Set `LIBRETRANSLATE_ENABLED=false` only when you deliberately want the import to skip Bangla translation.

## Database setup

All entities are registered through `TypeOrmModule.forFeature()` and the project uses `autoLoadEntities: true`.

For local development, `TYPEORM_SYNC=true` can create the tables. For production, create and review a TypeORM migration through the project's normal migration workflow.

New tables:

```text
important_verbs
important_verb_forms
important_verb_conjugations
important_verb_examples
important_verb_import_runs
user_saved_important_verbs
```

The existing `user_important_verb_progress` table remains supported.

## Initial sync

Start LibreTranslate first, then run:

```bash
npm run verbs:sync
```

Do not normally enable `IMPORTANT_VERBS_SYNC_ON_STARTUP`, because the Kaikki source is large and translation is CPU-intensive.

The bundled starter list contains 108 common Italian verbs. A custom list can be provided with:

```env
IMPORTANT_VERBS_LEMMA_FILE=/absolute/path/to/important-verbs.txt
```

The file must contain one infinitive per line.

For a first test:

```env
IMPORTANT_VERBS_MAX_VERBS=5
IMPORTANT_VERBS_LEMMAS=essere,avere,fare,andare,parlare
IMPORTANT_VERBS_LEMMA_FILE=
IMPORTANT_VERBS_TATOEBA_MAX_REQUESTS=20
```

## Monthly updates

To run a monthly update, LibreTranslate must be available at the configured endpoint when the scheduled job executes:

```env
IMPORTANT_VERBS_MONTHLY_SYNC_ENABLED=true
```

For a laptop-only/local translation workflow, keep monthly sync disabled and run `npm run verbs:sync` manually whenever you choose to update the dataset.

Every execution is recorded in `important_verb_import_runs` with status, metrics, sources, timestamps, and errors.

## User APIs

All endpoints use the existing JWT guard.

### Verb library

```http
GET /important-verbs?page=1&limit=20&search=par&regularity=regular&endingType=-are&language=en
```

Languages:

```text
en
bn
it
```

Filters:

```text
regularity=regular|irregular
endingType=-are|-ere|-ire|other
```

### Search suggestions

```http
GET /important-verbs/search?q=par&limit=10&language=bn
```

### Saved verbs

```http
GET    /important-verbs/saved?page=1&limit=20&language=en
POST   /important-verbs/:verbId/save
DELETE /important-verbs/:verbId/save
```

### Verb detail

```http
GET /important-verbs/:verbId?language=en
```

The detail response contains all 21 form groups, localized labels, conjugations, examples, attribution, and Flutter TTS fields.

### Learning progress

```http
POST /important-verbs/:verbId/reviewed
GET  /important-verbs/progress
```

## Flutter TTS integration

Use the returned values directly:

```json
{
  "tts": {
    "locale": "it-IT",
    "text": "Io parlo italiano."
  }
}
```

The Flutter app should check `isLanguageAvailable("it-IT")` before enabling the speaker action. No audio URL is expected from this backend module.
