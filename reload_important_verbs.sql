\set ON_ERROR_STOP on

BEGIN;

TRUNCATE TABLE
  user_important_verb_progress,
  user_saved_important_verbs,
  important_verb_conjugations,
  important_verb_examples,
  important_verb_forms,
  important_verbs,
  important_verb_import_runs
RESTART IDENTITY;

\i 'E:/ShafaCode/italirpothe-backend/important_verbs_data.sql'

COMMIT;