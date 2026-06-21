import { Injectable } from "@nestjs/common";

import {
  IMPORTANT_VERB_PRONOUNS,
  ITALIAN_AUXILIARY_FORMS,
} from "../constants/important-verb-forms.constant";
import {
  ImportantVerbAuxiliary,
  ImportantVerbEndingType,
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
  ImportantVerbRegularity,
} from "../types/important-verb.type";
import { normalizeText } from "../utils/data-source.util";

export type MappedMorphology = {
  formKey: ImportantVerbFormKey;
  personKey: ImportantVerbPersonKey;
};

const COMMON_IRREGULAR_ITALIAN_VERBS = new Set([
  "andare",
  "apparire",
  "avere",
  "bere",
  "cadere",
  "chiedere",
  "chiudere",
  "conoscere",
  "correre",
  "dare",
  "decidere",
  "dire",
  "dovere",
  "essere",
  "fare",
  "leggere",
  "mettere",
  "morire",
  "nascere",
  "piacere",
  "porre",
  "potere",
  "prendere",
  "produrre",
  "rimanere",
  "rispondere",
  "salire",
  "sapere",
  "scegliere",
  "scendere",
  "scrivere",
  "sedere",
  "spegnere",
  "stare",
  "tenere",
  "tradurre",
  "trarre",
  "uscire",
  "vedere",
  "venire",
  "vivere",
  "volere",
]);

const ESSERE_AUXILIARY_VERBS = new Set([
  "andare",
  "apparire",
  "arrivare",
  "cadere",
  "diventare",
  "entrare",
  "essere",
  "morire",
  "nascere",
  "partire",
  "restare",
  "rimanere",
  "salire",
  "scendere",
  "sembrare",
  "stare",
  "succedere",
  "tornare",
  "uscire",
  "venire",
]);

const BOTH_AUXILIARY_VERBS = new Set([
  "cambiare",
  "cominciare",
  "correre",
  "finire",
  "passare",
  "volare",
]);

type EnglishVerbForms = {
  third: string;
  past: string;
  participle: string;
  gerund: string;
};

const ENGLISH_IRREGULAR_FORMS: Record<string, EnglishVerbForms> = {
  be: { third: "is", past: "was", participle: "been", gerund: "being" },
  have: { third: "has", past: "had", participle: "had", gerund: "having" },
  do: { third: "does", past: "did", participle: "done", gerund: "doing" },
  go: { third: "goes", past: "went", participle: "gone", gerund: "going" },
  come: { third: "comes", past: "came", participle: "come", gerund: "coming" },
  say: { third: "says", past: "said", participle: "said", gerund: "saying" },
  tell: { third: "tells", past: "told", participle: "told", gerund: "telling" },
  see: { third: "sees", past: "saw", participle: "seen", gerund: "seeing" },
  know: {
    third: "knows",
    past: "knew",
    participle: "known",
    gerund: "knowing",
  },
  take: { third: "takes", past: "took", participle: "taken", gerund: "taking" },
  give: { third: "gives", past: "gave", participle: "given", gerund: "giving" },
  make: { third: "makes", past: "made", participle: "made", gerund: "making" },
  write: {
    third: "writes",
    past: "wrote",
    participle: "written",
    gerund: "writing",
  },
  read: { third: "reads", past: "read", participle: "read", gerund: "reading" },
  drink: {
    third: "drinks",
    past: "drank",
    participle: "drunk",
    gerund: "drinking",
  },
  eat: { third: "eats", past: "ate", participle: "eaten", gerund: "eating" },
  sleep: {
    third: "sleeps",
    past: "slept",
    participle: "slept",
    gerund: "sleeping",
  },
  speak: {
    third: "speaks",
    past: "spoke",
    participle: "spoken",
    gerund: "speaking",
  },
  leave: {
    third: "leaves",
    past: "left",
    participle: "left",
    gerund: "leaving",
  },
  choose: {
    third: "chooses",
    past: "chose",
    participle: "chosen",
    gerund: "choosing",
  },
  buy: {
    third: "buys",
    past: "bought",
    participle: "bought",
    gerund: "buying",
  },
  sell: {
    third: "sells",
    past: "sold",
    participle: "sold",
    gerund: "selling",
  },
  find: {
    third: "finds",
    past: "found",
    participle: "found",
    gerund: "finding",
  },
  think: {
    third: "thinks",
    past: "thought",
    participle: "thought",
    gerund: "thinking",
  },
  understand: {
    third: "understands",
    past: "understood",
    participle: "understood",
    gerund: "understanding",
  },
};

@Injectable()
export class ImportantVerbRulesService {
  slugify(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  determineEndingType(infinitive: string) {
    const normalized = infinitive.toLowerCase();

    if (normalized.endsWith("are")) return ImportantVerbEndingType.ARE;
    if (normalized.endsWith("ere")) return ImportantVerbEndingType.ERE;
    if (normalized.endsWith("ire")) return ImportantVerbEndingType.IRE;

    return ImportantVerbEndingType.OTHER;
  }

  determineRegularity(params: {
    infinitive: string;
    tags?: string[];
    categories?: string[];
  }) {
    const searchable = [...(params.tags ?? []), ...(params.categories ?? [])]
      .join(" ")
      .toLowerCase();

    if (
      searchable.includes("irregular") ||
      COMMON_IRREGULAR_ITALIAN_VERBS.has(params.infinitive.toLowerCase())
    ) {
      return ImportantVerbRegularity.IRREGULAR;
    }

    return ImportantVerbRegularity.REGULAR;
  }

  determineAuxiliary(params: {
    infinitive: string;
    tags?: string[];
    categories?: string[];
  }) {
    const infinitive = params.infinitive.toLowerCase();
    const searchable = [...(params.tags ?? []), ...(params.categories ?? [])]
      .join(" ")
      .toLowerCase();

    const mentionsAvere = /\bavere\b/.test(searchable);
    const mentionsEssere = /\bessere\b/.test(searchable);

    if (
      BOTH_AUXILIARY_VERBS.has(infinitive) ||
      (mentionsAvere && mentionsEssere)
    ) {
      return ImportantVerbAuxiliary.BOTH;
    }

    if (ESSERE_AUXILIARY_VERBS.has(infinitive) || mentionsEssere) {
      return ImportantVerbAuxiliary.ESSERE;
    }

    if (mentionsAvere) {
      return ImportantVerbAuxiliary.AVERE;
    }

    if (
      this.determineEndingType(infinitive) !== ImportantVerbEndingType.OTHER
    ) {
      return ImportantVerbAuxiliary.AVERE;
    }

    return ImportantVerbAuxiliary.UNKNOWN;
  }

  mapKaikkiForm(tagsInput: unknown): MappedMorphology | null {
    const tags = Array.isArray(tagsInput)
      ? tagsInput.map((value) => String(value).toLowerCase())
      : [];

    const has = (...values: string[]) =>
      values.some((value) => tags.includes(value));

    let formKey: ImportantVerbFormKey | null = null;

    if (has("infinitive") && !has("past")) {
      formKey = ImportantVerbFormKey.INFINITIVE_PRESENT;
    } else if (has("gerund") && !has("past")) {
      formKey = ImportantVerbFormKey.GERUND_PRESENT;
    } else if (has("present-participle")) {
      formKey = ImportantVerbFormKey.PRESENT_PARTICIPLE;
    } else if (has("past-participle", "participle") && has("past")) {
      formKey = ImportantVerbFormKey.PAST_PARTICIPLE;
    } else if (has("imperative")) {
      formKey = ImportantVerbFormKey.IMPERATIVE;
    } else if (has("conditional")) {
      formKey = ImportantVerbFormKey.CONDITIONAL_PRESENT;
    } else if (has("subjunctive") && has("imperfect", "past-imperfect")) {
      formKey = ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT;
    } else if (has("subjunctive") && has("present")) {
      formKey = ImportantVerbFormKey.SUBJUNCTIVE_PRESENT;
    } else if (
      has("indicative") &&
      has("past", "preterite", "past-remote", "remote-past")
    ) {
      formKey = ImportantVerbFormKey.REMOTE_PAST;
    } else if (has("indicative") && has("imperfect")) {
      formKey = ImportantVerbFormKey.IMPERFECT;
    } else if (has("indicative") && has("future")) {
      formKey = ImportantVerbFormKey.SIMPLE_FUTURE;
    } else if (has("indicative") && has("present") && !has("participle")) {
      formKey = ImportantVerbFormKey.PRESENT;
    }

    if (!formKey) return null;

    if (
      [
        ImportantVerbFormKey.PRESENT_PARTICIPLE,
        ImportantVerbFormKey.PAST_PARTICIPLE,
      ].includes(formKey) &&
      (has("feminine", "plural") || has("archaic", "obsolete"))
    ) {
      return null;
    }

    return {
      formKey,
      personKey: this.mapPersonFromTags(tags),
    };
  }

  mapUniMorphFeatures(featureText: string): MappedMorphology | null {
    const features = featureText
      .split(/[;,|]/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    const has = (...values: string[]) =>
      values.some((value) => features.includes(value));

    let formKey: ImportantVerbFormKey | null = null;

    if (has("NFIN", "INF")) {
      formKey = ImportantVerbFormKey.INFINITIVE_PRESENT;
    } else if (has("V.CVB", "CVB", "GER")) {
      formKey = ImportantVerbFormKey.GERUND_PRESENT;
    } else if (has("V.PTCP", "PTCP") && has("PRS")) {
      formKey = ImportantVerbFormKey.PRESENT_PARTICIPLE;
    } else if (has("V.PTCP", "PTCP") && has("PST")) {
      formKey = ImportantVerbFormKey.PAST_PARTICIPLE;
    } else if (has("IMP")) {
      formKey = ImportantVerbFormKey.IMPERATIVE;
    } else if (has("COND")) {
      formKey = ImportantVerbFormKey.CONDITIONAL_PRESENT;
    } else if (has("SBJV", "SUBJ") && has("PST", "IPFV")) {
      formKey = ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT;
    } else if (has("SBJV", "SUBJ") && has("PRS")) {
      formKey = ImportantVerbFormKey.SUBJUNCTIVE_PRESENT;
    } else if (has("IND") && has("FUT")) {
      formKey = ImportantVerbFormKey.SIMPLE_FUTURE;
    } else if (has("IND") && has("PST") && has("IPFV")) {
      formKey = ImportantVerbFormKey.IMPERFECT;
    } else if (has("IND") && has("PST", "PFV")) {
      formKey = ImportantVerbFormKey.REMOTE_PAST;
    } else if (has("IND") && has("PRS")) {
      formKey = ImportantVerbFormKey.PRESENT;
    }

    if (!formKey) return null;

    if (
      [
        ImportantVerbFormKey.PRESENT_PARTICIPLE,
        ImportantVerbFormKey.PAST_PARTICIPLE,
      ].includes(formKey) &&
      (has("FEM", "PL") || has("ARCH", "OBS"))
    ) {
      return null;
    }

    return {
      formKey,
      personKey: this.mapPersonFromFeatures(features),
    };
  }

  generateRegularSimpleConjugations(
    infinitive: string,
    formKey: ImportantVerbFormKey,
  ): Partial<Record<ImportantVerbPersonKey, string>> {
    const ending = this.determineEndingType(infinitive);
    const stem = infinitive.slice(0, -3);
    const persons = [
      ImportantVerbPersonKey.IO,
      ImportantVerbPersonKey.TU,
      ImportantVerbPersonKey.LUI_LEI,
      ImportantVerbPersonKey.NOI,
      ImportantVerbPersonKey.VOI,
      ImportantVerbPersonKey.LORO,
    ] as const;

    const build = (endings: string[]) =>
      Object.fromEntries(
        persons.map((person, index) => [person, `${stem}${endings[index]}`]),
      ) as Partial<Record<ImportantVerbPersonKey, string>>;

    const isIscVerb = new Set([
      "capire",
      "finire",
      "preferire",
      "pulire",
      "spedire",
      "suggerire",
      "ubbidire",
      "costruire",
    ]).has(infinitive.toLowerCase());

    if (formKey === ImportantVerbFormKey.INFINITIVE_PRESENT) {
      return { [ImportantVerbPersonKey.BASE]: infinitive };
    }

    if (ending === ImportantVerbEndingType.ARE) {
      switch (formKey) {
        case ImportantVerbFormKey.PRESENT:
          return build(["o", "i", "a", "iamo", "ate", "ano"]);
        case ImportantVerbFormKey.IMPERFECT:
          return build(["avo", "avi", "ava", "avamo", "avate", "avano"]);
        case ImportantVerbFormKey.REMOTE_PAST:
          return build(["ai", "asti", "ò", "ammo", "aste", "arono"]);
        case ImportantVerbFormKey.SIMPLE_FUTURE: {
          const futureStem = `${stem}er`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${futureStem}${["ò", "ai", "à", "emo", "ete", "anno"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.SUBJUNCTIVE_PRESENT:
          return build(["i", "i", "i", "iamo", "iate", "ino"]);
        case ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT:
          return build(["assi", "assi", "asse", "assimo", "aste", "assero"]);
        case ImportantVerbFormKey.CONDITIONAL_PRESENT: {
          const conditionalStem = `${stem}er`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${conditionalStem}${["ei", "esti", "ebbe", "emmo", "este", "ebbero"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.IMPERATIVE:
          return {
            [ImportantVerbPersonKey.TU]: `${stem}a`,
            [ImportantVerbPersonKey.LUI_LEI]: `${stem}i`,
            [ImportantVerbPersonKey.NOI]: `${stem}iamo`,
            [ImportantVerbPersonKey.VOI]: `${stem}ate`,
            [ImportantVerbPersonKey.LORO]: `${stem}ino`,
          };
        case ImportantVerbFormKey.PRESENT_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ante` };
        case ImportantVerbFormKey.PAST_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ato` };
        case ImportantVerbFormKey.GERUND_PRESENT:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ando` };
        default:
          return {};
      }
    }

    if (ending === ImportantVerbEndingType.ERE) {
      switch (formKey) {
        case ImportantVerbFormKey.PRESENT:
          return build(["o", "i", "e", "iamo", "ete", "ono"]);
        case ImportantVerbFormKey.IMPERFECT:
          return build(["evo", "evi", "eva", "evamo", "evate", "evano"]);
        case ImportantVerbFormKey.REMOTE_PAST:
          return build(["ei", "esti", "é", "emmo", "este", "erono"]);
        case ImportantVerbFormKey.SIMPLE_FUTURE: {
          const futureStem = `${stem}er`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${futureStem}${["ò", "ai", "à", "emo", "ete", "anno"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.SUBJUNCTIVE_PRESENT:
          return build(["a", "a", "a", "iamo", "iate", "ano"]);
        case ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT:
          return build(["essi", "essi", "esse", "essimo", "este", "essero"]);
        case ImportantVerbFormKey.CONDITIONAL_PRESENT: {
          const conditionalStem = `${stem}er`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${conditionalStem}${["ei", "esti", "ebbe", "emmo", "este", "ebbero"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.IMPERATIVE:
          return {
            [ImportantVerbPersonKey.TU]: `${stem}i`,
            [ImportantVerbPersonKey.LUI_LEI]: `${stem}a`,
            [ImportantVerbPersonKey.NOI]: `${stem}iamo`,
            [ImportantVerbPersonKey.VOI]: `${stem}ete`,
            [ImportantVerbPersonKey.LORO]: `${stem}ano`,
          };
        case ImportantVerbFormKey.PRESENT_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ente` };
        case ImportantVerbFormKey.PAST_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}uto` };
        case ImportantVerbFormKey.GERUND_PRESENT:
          return { [ImportantVerbPersonKey.BASE]: `${stem}endo` };
        default:
          return {};
      }
    }

    if (ending === ImportantVerbEndingType.IRE) {
      switch (formKey) {
        case ImportantVerbFormKey.PRESENT:
          return isIscVerb
            ? build(["isco", "isci", "isce", "iamo", "ite", "iscono"])
            : build(["o", "i", "e", "iamo", "ite", "ono"]);
        case ImportantVerbFormKey.IMPERFECT:
          return build(["ivo", "ivi", "iva", "ivamo", "ivate", "ivano"]);
        case ImportantVerbFormKey.REMOTE_PAST:
          return build(["ii", "isti", "ì", "immo", "iste", "irono"]);
        case ImportantVerbFormKey.SIMPLE_FUTURE: {
          const futureStem = `${stem}ir`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${futureStem}${["ò", "ai", "à", "emo", "ete", "anno"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.SUBJUNCTIVE_PRESENT:
          return isIscVerb
            ? build(["isca", "isca", "isca", "iamo", "iate", "iscano"])
            : build(["a", "a", "a", "iamo", "iate", "ano"]);
        case ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT:
          return build(["issi", "issi", "isse", "issimo", "iste", "issero"]);
        case ImportantVerbFormKey.CONDITIONAL_PRESENT: {
          const conditionalStem = `${stem}ir`;
          return Object.fromEntries(
            persons.map((person, index) => [
              person,
              `${conditionalStem}${["ei", "esti", "ebbe", "emmo", "este", "ebbero"][index]}`,
            ]),
          );
        }
        case ImportantVerbFormKey.IMPERATIVE:
          return isIscVerb
            ? {
                [ImportantVerbPersonKey.TU]: `${stem}isci`,
                [ImportantVerbPersonKey.LUI_LEI]: `${stem}isca`,
                [ImportantVerbPersonKey.NOI]: `${stem}iamo`,
                [ImportantVerbPersonKey.VOI]: `${stem}ite`,
                [ImportantVerbPersonKey.LORO]: `${stem}iscano`,
              }
            : {
                [ImportantVerbPersonKey.TU]: `${stem}i`,
                [ImportantVerbPersonKey.LUI_LEI]: `${stem}a`,
                [ImportantVerbPersonKey.NOI]: `${stem}iamo`,
                [ImportantVerbPersonKey.VOI]: `${stem}ite`,
                [ImportantVerbPersonKey.LORO]: `${stem}ano`,
              };
        case ImportantVerbFormKey.PRESENT_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ente` };
        case ImportantVerbFormKey.PAST_PARTICIPLE:
          return { [ImportantVerbPersonKey.BASE]: `${stem}ito` };
        case ImportantVerbFormKey.GERUND_PRESENT:
          return { [ImportantVerbPersonKey.BASE]: `${stem}endo` };
        default:
          return {};
      }
    }

    return {};
  }

  inferPastParticiple(infinitive: string) {
    const ending = this.determineEndingType(infinitive);
    const stem = infinitive.slice(0, -3);

    if (ending === ImportantVerbEndingType.ARE) return `${stem}ato`;
    if (ending === ImportantVerbEndingType.ERE) return `${stem}uto`;
    if (ending === ImportantVerbEndingType.IRE) return `${stem}ito`;

    return infinitive;
  }

  applyEssereAgreement(participle: string, personKey: ImportantVerbPersonKey) {
    if (!participle.endsWith("o")) return participle;

    const stem = participle.slice(0, -1);

    if (
      personKey === ImportantVerbPersonKey.NOI ||
      personKey === ImportantVerbPersonKey.VOI ||
      personKey === ImportantVerbPersonKey.LORO
    ) {
      return `${stem}i/e`;
    }

    return `${stem}o/a`;
  }

  extractEnglishBase(meaning: string | null | undefined) {
    const normalized = normalizeText(meaning);
    if (!normalized) return "do";

    const firstMeaning = normalized
      .split(/[;,/]| or /i)
      .map((part) => part.trim())
      .find(Boolean);

    return (firstMeaning ?? "do")
      .replace(/^to\s+/i, "")
      .replace(/^be able to$/i, "can")
      .trim()
      .toLowerCase();
  }

  buildEnglishConjugation(params: {
    englishMeaning: string | null;
    formKey: ImportantVerbFormKey;
    personKey: ImportantVerbPersonKey;
  }) {
    const base = this.extractEnglishBase(params.englishMeaning);
    const forms = this.getEnglishForms(base);
    const subject =
      IMPORTANT_VERB_PRONOUNS[params.personKey]?.en ||
      IMPORTANT_VERB_PRONOUNS[ImportantVerbPersonKey.IO].en;

    const bePresent =
      params.personKey === ImportantVerbPersonKey.IO
        ? "am"
        : params.personKey === ImportantVerbPersonKey.LUI_LEI
          ? "is"
          : "are";

    const havePresent =
      params.personKey === ImportantVerbPersonKey.LUI_LEI ? "has" : "have";

    const simplePresent =
      params.personKey === ImportantVerbPersonKey.LUI_LEI ? forms.third : base;

    switch (params.formKey) {
      case ImportantVerbFormKey.PRESENT:
        return `${subject} ${simplePresent}`;
      case ImportantVerbFormKey.IMPERFECT:
        return `${subject} used to ${base}`;
      case ImportantVerbFormKey.REMOTE_PAST:
        return `${subject} ${forms.past}`;
      case ImportantVerbFormKey.SIMPLE_FUTURE:
        return `${subject} will ${base}`;
      case ImportantVerbFormKey.PRESENT_PERFECT:
        return `${subject} ${havePresent} ${forms.participle}`;
      case ImportantVerbFormKey.PAST_PERFECT:
      case ImportantVerbFormKey.REMOTE_PAST_PERFECT:
        return `${subject} had ${forms.participle}`;
      case ImportantVerbFormKey.FUTURE_PERFECT:
        return `${subject} will have ${forms.participle}`;
      case ImportantVerbFormKey.SUBJUNCTIVE_PRESENT:
        return `that ${subject.toLowerCase()} ${base}`;
      case ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT:
        return `that ${subject.toLowerCase()} ${forms.past}`;
      case ImportantVerbFormKey.SUBJUNCTIVE_PAST:
        return `that ${subject.toLowerCase()} ${havePresent} ${forms.participle}`;
      case ImportantVerbFormKey.SUBJUNCTIVE_PAST_PERFECT:
        return `that ${subject.toLowerCase()} had ${forms.participle}`;
      case ImportantVerbFormKey.CONDITIONAL_PRESENT:
        return `${subject} would ${base}`;
      case ImportantVerbFormKey.CONDITIONAL_PAST:
        return `${subject} would have ${forms.participle}`;
      case ImportantVerbFormKey.IMPERATIVE:
        return `${base}`;
      case ImportantVerbFormKey.INFINITIVE_PRESENT:
        return `to ${base}`;
      case ImportantVerbFormKey.INFINITIVE_PAST:
        return `to have ${forms.participle}`;
      case ImportantVerbFormKey.PRESENT_PARTICIPLE:
        return forms.gerund;
      case ImportantVerbFormKey.PAST_PARTICIPLE:
        return forms.participle;
      case ImportantVerbFormKey.GERUND_PRESENT:
        return forms.gerund;
      case ImportantVerbFormKey.GERUND_PAST:
        return `having ${forms.participle}`;
      default:
        return `${subject} ${simplePresent}`;
    }
  }

  buildFallbackExample(params: {
    italianConjugation: string;
    englishMeaning: string | null;
    formKey: ImportantVerbFormKey;
    personKey: ImportantVerbPersonKey;
  }) {
    const pronoun =
      IMPORTANT_VERB_PRONOUNS[params.personKey]?.it ??
      IMPORTANT_VERB_PRONOUNS[ImportantVerbPersonKey.IO].it;
    const englishConjugation = this.buildEnglishConjugation({
      englishMeaning: params.englishMeaning,
      formKey: params.formKey,
      personKey: params.personKey,
    });

    let italianText = params.italianConjugation;
    let englishText = englishConjugation;

    switch (params.formKey) {
      case ImportantVerbFormKey.SUBJUNCTIVE_PRESENT:
      case ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT:
      case ImportantVerbFormKey.SUBJUNCTIVE_PAST:
      case ImportantVerbFormKey.SUBJUNCTIVE_PAST_PERFECT:
        italianText = `È importante che ${pronoun || "io"} ${params.italianConjugation}.`;
        englishText = `It is important ${englishConjugation}.`;
        break;
      case ImportantVerbFormKey.IMPERATIVE:
        italianText = `${this.capitalize(params.italianConjugation)}!`;
        englishText = `${this.capitalize(englishConjugation)}!`;
        break;
      case ImportantVerbFormKey.INFINITIVE_PRESENT:
      case ImportantVerbFormKey.INFINITIVE_PAST:
        italianText = `Voglio ${params.italianConjugation}.`;
        englishText = `I want ${englishConjugation}.`;
        break;
      case ImportantVerbFormKey.PRESENT_PARTICIPLE:
      case ImportantVerbFormKey.PAST_PARTICIPLE:
      case ImportantVerbFormKey.GERUND_PRESENT:
      case ImportantVerbFormKey.GERUND_PAST:
        italianText = `${this.capitalize(params.italianConjugation)}.`;
        englishText = `${this.capitalize(englishConjugation)}.`;
        break;
      default:
        italianText = `${this.capitalize(pronoun || "io")} ${params.italianConjugation}.`;
        englishText = `${this.capitalize(englishConjugation)}.`;
    }

    return {
      italianText,
      englishText,
    };
  }

  getAuxiliaryForm(params: {
    auxiliary: "avere" | "essere";
    sourceFormKey: ImportantVerbFormKey;
    personKey: ImportantVerbPersonKey;
  }) {
    return (
      ITALIAN_AUXILIARY_FORMS[params.auxiliary][params.sourceFormKey]?.[
        params.personKey
      ] ?? null
    );
  }

  private mapPersonFromTags(tags: string[]) {
    const joined = tags.join(" ");

    if (joined.includes("first-person") && joined.includes("singular")) {
      return ImportantVerbPersonKey.IO;
    }

    if (joined.includes("second-person") && joined.includes("singular")) {
      return ImportantVerbPersonKey.TU;
    }

    if (joined.includes("third-person") && joined.includes("singular")) {
      return ImportantVerbPersonKey.LUI_LEI;
    }

    if (joined.includes("first-person") && joined.includes("plural")) {
      return ImportantVerbPersonKey.NOI;
    }

    if (joined.includes("second-person") && joined.includes("plural")) {
      return ImportantVerbPersonKey.VOI;
    }

    if (joined.includes("third-person") && joined.includes("plural")) {
      return ImportantVerbPersonKey.LORO;
    }

    return ImportantVerbPersonKey.BASE;
  }

  private mapPersonFromFeatures(features: string[]) {
    const has = (value: string) => features.includes(value);

    if (has("1") && has("SG")) return ImportantVerbPersonKey.IO;
    if (has("2") && has("SG")) return ImportantVerbPersonKey.TU;
    if (has("3") && has("SG")) return ImportantVerbPersonKey.LUI_LEI;
    if (has("1") && has("PL")) return ImportantVerbPersonKey.NOI;
    if (has("2") && has("PL")) return ImportantVerbPersonKey.VOI;
    if (has("3") && has("PL")) return ImportantVerbPersonKey.LORO;

    return ImportantVerbPersonKey.BASE;
  }

  private getEnglishForms(base: string): EnglishVerbForms {
    const irregular = ENGLISH_IRREGULAR_FORMS[base];
    if (irregular) return irregular;

    const third = /(?:s|x|z|ch|sh|o)$/i.test(base)
      ? `${base}es`
      : /[^aeiou]y$/i.test(base)
        ? `${base.slice(0, -1)}ies`
        : `${base}s`;

    const past = base.endsWith("e")
      ? `${base}d`
      : /[^aeiou]y$/i.test(base)
        ? `${base.slice(0, -1)}ied`
        : `${base}ed`;

    const gerund = base.endsWith("ie")
      ? `${base.slice(0, -2)}ying`
      : base.endsWith("e") && !base.endsWith("ee")
        ? `${base.slice(0, -1)}ing`
        : `${base}ing`;

    return {
      third,
      past,
      participle: past,
      gerund,
    };
  }

  private capitalize(value: string) {
    if (!value) return value;
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }
}
