export enum ImportantVerbLanguage {
  ENGLISH = "en",
  BANGLA = "bn",
  ITALIAN = "it",
}

export enum ImportantVerbRegularity {
  REGULAR = "regular",
  IRREGULAR = "irregular",
}

export enum ImportantVerbEndingType {
  ARE = "-are",
  ERE = "-ere",
  IRE = "-ire",
  OTHER = "other",
}

export enum ImportantVerbAuxiliary {
  AVERE = "avere",
  ESSERE = "essere",
  BOTH = "both",
  UNKNOWN = "unknown",
}

export enum ImportantVerbFormKey {
  PRESENT = "present",
  IMPERFECT = "imperfect",
  REMOTE_PAST = "remote_past",
  SIMPLE_FUTURE = "simple_future",
  PRESENT_PERFECT = "present_perfect",
  PAST_PERFECT = "past_perfect",
  REMOTE_PAST_PERFECT = "remote_past_perfect",
  FUTURE_PERFECT = "future_perfect",
  SUBJUNCTIVE_PRESENT = "subjunctive_present",
  SUBJUNCTIVE_IMPERFECT = "subjunctive_imperfect",
  SUBJUNCTIVE_PAST = "subjunctive_past",
  SUBJUNCTIVE_PAST_PERFECT = "subjunctive_past_perfect",
  CONDITIONAL_PRESENT = "conditional_present",
  CONDITIONAL_PAST = "conditional_past",
  IMPERATIVE = "imperative",
  INFINITIVE_PRESENT = "infinitive_present",
  INFINITIVE_PAST = "infinitive_past",
  PRESENT_PARTICIPLE = "present_participle",
  PAST_PARTICIPLE = "past_participle",
  GERUND_PRESENT = "gerund_present",
  GERUND_PAST = "gerund_past",
}

export enum ImportantVerbPersonKey {
  IO = "io",
  TU = "tu",
  LUI_LEI = "lui_lei",
  NOI = "noi",
  VOI = "voi",
  LORO = "loro",
  BASE = "base",
}

export enum ImportantVerbExampleSource {
  KAIKKI = "kaikki",
  TATOEBA = "tatoeba",
  TEMPLATE = "template",
}

export enum ImportantVerbImportRunStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

export type ImportantVerbImportMetrics = {
  kaikki?: Record<string, number>;
  unimorph?: Record<string, number>;
  compoundForms?: Record<string, number>;
  examples?: Record<string, number>;
  translations?: Record<string, number>;
};
