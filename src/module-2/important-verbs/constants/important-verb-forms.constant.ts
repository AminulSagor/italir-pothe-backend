import {
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
} from "../types/important-verb.type";

export type ImportantVerbFormDefinition = {
  key: ImportantVerbFormKey;
  sortOrder: number;
  titleEn: string;
  titleBn: string;
  titleIt: string;
  descriptionEn: string;
  descriptionBn: string;
  descriptionIt: string;
  compound: boolean;
};

export const IMPORTANT_VERB_FORM_DEFINITIONS: ImportantVerbFormDefinition[] = [
  {
    key: ImportantVerbFormKey.PRESENT,
    sortOrder: 1,
    titleEn: "Present",
    titleBn: "বর্তমান কাল",
    titleIt: "Presente",
    descriptionEn:
      "Used for actions happening now, habitual actions, and general facts.",
    descriptionBn:
      "বর্তমানে ঘটছে, নিয়মিত ঘটে বা সাধারণ সত্য বোঝাতে ব্যবহৃত হয়।",
    descriptionIt: "Si usa per azioni presenti, abituali e fatti generali.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.IMPERFECT,
    sortOrder: 2,
    titleEn: "Imperfect",
    titleBn: "অসমাপ্ত অতীত",
    titleIt: "Imperfetto",
    descriptionEn:
      "Used for ongoing, habitual, or background actions in the past.",
    descriptionBn: "অতীতে চলমান, অভ্যাসগত বা পটভূমির কাজ বোঝাতে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa per azioni abituali, durative o di sfondo nel passato.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.REMOTE_PAST,
    sortOrder: 3,
    titleEn: "Remote Past",
    titleBn: "দূর অতীত",
    titleIt: "Passato remoto",
    descriptionEn:
      "Used mainly for completed actions in a distant or narrative past.",
    descriptionBn:
      "দূর অতীত বা বর্ণনামূলক অতীতে সম্পন্ন কাজ বোঝাতে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa soprattutto per azioni concluse in un passato lontano o narrativo.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.SIMPLE_FUTURE,
    sortOrder: 4,
    titleEn: "Simple Future",
    titleBn: "সাধারণ ভবিষ্যৎ",
    titleIt: "Futuro semplice",
    descriptionEn: "Used for future actions, plans, and predictions.",
    descriptionBn: "ভবিষ্যতের কাজ, পরিকল্পনা ও পূর্বানুমান বোঝাতে ব্যবহৃত হয়।",
    descriptionIt: "Si usa per azioni future, progetti e previsioni.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.PRESENT_PERFECT,
    sortOrder: 5,
    titleEn: "Present Perfect / Recent Past",
    titleBn: "নিকট অতীত",
    titleIt: "Passato prossimo",
    descriptionEn: "Used for completed past actions connected to the present.",
    descriptionBn:
      "সম্পন্ন অতীত কাজ যার বর্তমানের সঙ্গে সম্পর্ক আছে তা বোঝাতে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa per azioni passate concluse e collegate al presente.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.PAST_PERFECT,
    sortOrder: 6,
    titleEn: "Past Perfect",
    titleBn: "পূর্ব অতীত",
    titleIt: "Trapassato prossimo",
    descriptionEn: "Used for an action completed before another past action.",
    descriptionBn: "অতীতে অন্য একটি কাজের আগেই সম্পন্ন হয়েছিল এমন কাজ বোঝায়।",
    descriptionIt:
      "Indica un’azione conclusa prima di un’altra azione passata.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.REMOTE_PAST_PERFECT,
    sortOrder: 7,
    titleEn: "Remote Past Perfect",
    titleBn: "দূর পূর্ব অতীত",
    titleIt: "Trapassato remoto",
    descriptionEn:
      "Used in formal or literary narration for an action immediately before another remote-past action.",
    descriptionBn:
      "সাহিত্যিক বর্ণনায় দূর অতীতের আরেক কাজের ঠিক আগে সম্পন্ন কাজ বোঝায়।",
    descriptionIt:
      "Si usa nella narrazione formale per un’azione anteriore a un passato remoto.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.FUTURE_PERFECT,
    sortOrder: 8,
    titleEn: "Future Perfect",
    titleBn: "সম্পূর্ণ ভবিষ্যৎ",
    titleIt: "Futuro anteriore",
    descriptionEn:
      "Used for an action that will be completed before a future point.",
    descriptionBn: "ভবিষ্যতের একটি সময়ের আগেই সম্পন্ন হবে এমন কাজ বোঝায়।",
    descriptionIt:
      "Indica un’azione che sarà conclusa prima di un momento futuro.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.SUBJUNCTIVE_PRESENT,
    sortOrder: 9,
    titleEn: "Subjunctive Present",
    titleBn: "বর্তমান সম্ভাব্য রূপ",
    titleIt: "Congiuntivo presente",
    descriptionEn:
      "Used after expressions of doubt, opinion, emotion, or necessity.",
    descriptionBn: "সন্দেহ, মতামত, অনুভূতি বা প্রয়োজন প্রকাশের পরে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa dopo espressioni di dubbio, opinione, emozione o necessità.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT,
    sortOrder: 10,
    titleEn: "Subjunctive Imperfect",
    titleBn: "অসমাপ্ত সম্ভাব্য অতীত",
    titleIt: "Congiuntivo imperfetto",
    descriptionEn:
      "Used for hypothetical or dependent actions related to the past.",
    descriptionBn: "অতীত-সম্পর্কিত কল্পিত বা নির্ভরশীল কাজ বোঝাতে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa per azioni ipotetiche o dipendenti riferite al passato.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.SUBJUNCTIVE_PAST,
    sortOrder: 11,
    titleEn: "Subjunctive Past",
    titleBn: "সম্পন্ন সম্ভাব্য অতীত",
    titleIt: "Congiuntivo passato",
    descriptionEn:
      "Used for a completed action expressed with doubt, emotion, or opinion.",
    descriptionBn: "সন্দেহ, অনুভূতি বা মতামতের সঙ্গে সম্পন্ন অতীত কাজ বোঝায়।",
    descriptionIt:
      "Indica un’azione conclusa espressa con dubbio, emozione o opinione.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.SUBJUNCTIVE_PAST_PERFECT,
    sortOrder: 12,
    titleEn: "Subjunctive Past Perfect",
    titleBn: "পূর্ব সম্পন্ন সম্ভাব্য অতীত",
    titleIt: "Congiuntivo trapassato",
    descriptionEn:
      "Used for a hypothetical action completed before another past event.",
    descriptionBn: "অতীতে অন্য ঘটনার আগে সম্পন্ন কল্পিত কাজ বোঝায়।",
    descriptionIt:
      "Indica un’azione ipotetica conclusa prima di un altro evento passato.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.CONDITIONAL_PRESENT,
    sortOrder: 13,
    titleEn: "Conditional Present",
    titleBn: "বর্তমান শর্তসাপেক্ষ",
    titleIt: "Condizionale presente",
    descriptionEn:
      "Used for polite requests, wishes, and hypothetical present actions.",
    descriptionBn:
      "ভদ্র অনুরোধ, ইচ্ছা ও বর্তমানের কল্পিত কাজ বোঝাতে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa per richieste gentili, desideri e azioni ipotetiche presenti.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.CONDITIONAL_PAST,
    sortOrder: 14,
    titleEn: "Conditional Past",
    titleBn: "অতীত শর্তসাপেক্ষ",
    titleIt: "Condizionale passato",
    descriptionEn: "Used for an unreal or unfulfilled action in the past.",
    descriptionBn: "অতীতে বাস্তব হয়নি বা পূরণ হয়নি এমন কাজ বোঝায়।",
    descriptionIt: "Indica un’azione irreale o non realizzata nel passato.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.IMPERATIVE,
    sortOrder: 15,
    titleEn: "Imperative",
    titleBn: "আদেশবাচক",
    titleIt: "Imperativo",
    descriptionEn: "Used to give commands, instructions, or invitations.",
    descriptionBn: "আদেশ, নির্দেশ বা আমন্ত্রণ দিতে ব্যবহৃত হয়।",
    descriptionIt: "Si usa per dare ordini, istruzioni o inviti.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.INFINITIVE_PRESENT,
    sortOrder: 16,
    titleEn: "Infinitive Present",
    titleBn: "বর্তমান ক্রিয়ামূল",
    titleIt: "Infinito presente",
    descriptionEn: "The basic dictionary form of the verb.",
    descriptionBn: "ক্রিয়ার মৌলিক অভিধান রূপ।",
    descriptionIt: "La forma base del verbo usata nel dizionario.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.INFINITIVE_PAST,
    sortOrder: 17,
    titleEn: "Infinitive Past",
    titleBn: "অতীত ক্রিয়ামূল",
    titleIt: "Infinito passato",
    descriptionEn:
      "Used to express an action completed before the main action.",
    descriptionBn:
      "মূল কাজের আগে সম্পন্ন হওয়া একটি কাজ প্রকাশ করতে ব্যবহৃত হয়।",
    descriptionIt: "Esprime un’azione conclusa prima dell’azione principale.",
    compound: true,
  },
  {
    key: ImportantVerbFormKey.PRESENT_PARTICIPLE,
    sortOrder: 18,
    titleEn: "Present Participle",
    titleBn: "বর্তমান কৃদন্ত",
    titleIt: "Participio presente",
    descriptionEn:
      "A verbal form often used as an adjective or noun in modern Italian.",
    descriptionBn:
      "আধুনিক ইতালীয় ভাষায় বিশেষণ বা বিশেষ্য হিসেবে ব্যবহৃত ক্রিয়ারূপ।",
    descriptionIt: "Forma verbale spesso usata come aggettivo o sostantivo.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.PAST_PARTICIPLE,
    sortOrder: 19,
    titleEn: "Past Participle",
    titleBn: "অতীত কৃদন্ত",
    titleIt: "Participio passato",
    descriptionEn:
      "Used to build compound tenses and often used as an adjective.",
    descriptionBn: "যৌগিক কাল তৈরি করতে এবং অনেক সময় বিশেষণ হিসেবে ব্যবহৃত হয়।",
    descriptionIt:
      "Si usa per formare i tempi composti e spesso come aggettivo.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.GERUND_PRESENT,
    sortOrder: 20,
    titleEn: "Gerund Present",
    titleBn: "বর্তমান জেরুন্ড",
    titleIt: "Gerundio presente",
    descriptionEn:
      "Used for an action happening at the same time as another action.",
    descriptionBn: "অন্য একটি কাজের সঙ্গে একই সময়ে ঘটছে এমন কাজ বোঝায়।",
    descriptionIt: "Indica un’azione contemporanea a un’altra azione.",
    compound: false,
  },
  {
    key: ImportantVerbFormKey.GERUND_PAST,
    sortOrder: 21,
    titleEn: "Gerund Past",
    titleBn: "অতীত জেরুন্ড",
    titleIt: "Gerundio passato",
    descriptionEn: "Used for an action completed before another action.",
    descriptionBn: "অন্য একটি কাজের আগে সম্পন্ন হওয়া কাজ বোঝায়।",
    descriptionIt: "Indica un’azione conclusa prima di un’altra azione.",
    compound: true,
  },
];

export const IMPORTANT_VERB_PRONOUNS: Record<
  ImportantVerbPersonKey,
  { it: string; en: string; bn: string; sortOrder: number }
> = {
  [ImportantVerbPersonKey.IO]: {
    it: "io",
    en: "I",
    bn: "আমি",
    sortOrder: 1,
  },
  [ImportantVerbPersonKey.TU]: {
    it: "tu",
    en: "you",
    bn: "তুমি",
    sortOrder: 2,
  },
  [ImportantVerbPersonKey.LUI_LEI]: {
    it: "lui/lei",
    en: "he/she",
    bn: "সে",
    sortOrder: 3,
  },
  [ImportantVerbPersonKey.NOI]: {
    it: "noi",
    en: "we",
    bn: "আমরা",
    sortOrder: 4,
  },
  [ImportantVerbPersonKey.VOI]: {
    it: "voi",
    en: "you all",
    bn: "তোমরা",
    sortOrder: 5,
  },
  [ImportantVerbPersonKey.LORO]: {
    it: "loro",
    en: "they",
    bn: "তারা",
    sortOrder: 6,
  },
  [ImportantVerbPersonKey.BASE]: {
    it: "",
    en: "",
    bn: "",
    sortOrder: 1,
  },
};

export const COMPOUND_FORM_AUXILIARY_SOURCE: Partial<
  Record<ImportantVerbFormKey, ImportantVerbFormKey>
> = {
  [ImportantVerbFormKey.PRESENT_PERFECT]: ImportantVerbFormKey.PRESENT,
  [ImportantVerbFormKey.PAST_PERFECT]: ImportantVerbFormKey.IMPERFECT,
  [ImportantVerbFormKey.REMOTE_PAST_PERFECT]: ImportantVerbFormKey.REMOTE_PAST,
  [ImportantVerbFormKey.FUTURE_PERFECT]: ImportantVerbFormKey.SIMPLE_FUTURE,
  [ImportantVerbFormKey.SUBJUNCTIVE_PAST]:
    ImportantVerbFormKey.SUBJUNCTIVE_PRESENT,
  [ImportantVerbFormKey.SUBJUNCTIVE_PAST_PERFECT]:
    ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT,
  [ImportantVerbFormKey.CONDITIONAL_PAST]:
    ImportantVerbFormKey.CONDITIONAL_PRESENT,
};

export const ITALIAN_AUXILIARY_FORMS: Record<
  "avere" | "essere",
  Partial<
    Record<
      ImportantVerbFormKey,
      Partial<Record<ImportantVerbPersonKey, string>>
    >
  >
> = {
  avere: {
    [ImportantVerbFormKey.PRESENT]: {
      io: "ho",
      tu: "hai",
      lui_lei: "ha",
      noi: "abbiamo",
      voi: "avete",
      loro: "hanno",
    },
    [ImportantVerbFormKey.IMPERFECT]: {
      io: "avevo",
      tu: "avevi",
      lui_lei: "aveva",
      noi: "avevamo",
      voi: "avevate",
      loro: "avevano",
    },
    [ImportantVerbFormKey.REMOTE_PAST]: {
      io: "ebbi",
      tu: "avesti",
      lui_lei: "ebbe",
      noi: "avemmo",
      voi: "aveste",
      loro: "ebbero",
    },
    [ImportantVerbFormKey.SIMPLE_FUTURE]: {
      io: "avrò",
      tu: "avrai",
      lui_lei: "avrà",
      noi: "avremo",
      voi: "avrete",
      loro: "avranno",
    },
    [ImportantVerbFormKey.SUBJUNCTIVE_PRESENT]: {
      io: "abbia",
      tu: "abbia",
      lui_lei: "abbia",
      noi: "abbiamo",
      voi: "abbiate",
      loro: "abbiano",
    },
    [ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT]: {
      io: "avessi",
      tu: "avessi",
      lui_lei: "avesse",
      noi: "avessimo",
      voi: "aveste",
      loro: "avessero",
    },
    [ImportantVerbFormKey.CONDITIONAL_PRESENT]: {
      io: "avrei",
      tu: "avresti",
      lui_lei: "avrebbe",
      noi: "avremmo",
      voi: "avreste",
      loro: "avrebbero",
    },
    [ImportantVerbFormKey.INFINITIVE_PRESENT]: {
      base: "avere",
    },
    [ImportantVerbFormKey.GERUND_PRESENT]: {
      base: "avendo",
    },
  },
  essere: {
    [ImportantVerbFormKey.PRESENT]: {
      io: "sono",
      tu: "sei",
      lui_lei: "è",
      noi: "siamo",
      voi: "siete",
      loro: "sono",
    },
    [ImportantVerbFormKey.IMPERFECT]: {
      io: "ero",
      tu: "eri",
      lui_lei: "era",
      noi: "eravamo",
      voi: "eravate",
      loro: "erano",
    },
    [ImportantVerbFormKey.REMOTE_PAST]: {
      io: "fui",
      tu: "fosti",
      lui_lei: "fu",
      noi: "fummo",
      voi: "foste",
      loro: "furono",
    },
    [ImportantVerbFormKey.SIMPLE_FUTURE]: {
      io: "sarò",
      tu: "sarai",
      lui_lei: "sarà",
      noi: "saremo",
      voi: "sarete",
      loro: "saranno",
    },
    [ImportantVerbFormKey.SUBJUNCTIVE_PRESENT]: {
      io: "sia",
      tu: "sia",
      lui_lei: "sia",
      noi: "siamo",
      voi: "siate",
      loro: "siano",
    },
    [ImportantVerbFormKey.SUBJUNCTIVE_IMPERFECT]: {
      io: "fossi",
      tu: "fossi",
      lui_lei: "fosse",
      noi: "fossimo",
      voi: "foste",
      loro: "fossero",
    },
    [ImportantVerbFormKey.CONDITIONAL_PRESENT]: {
      io: "sarei",
      tu: "saresti",
      lui_lei: "sarebbe",
      noi: "saremmo",
      voi: "sareste",
      loro: "sarebbero",
    },
    [ImportantVerbFormKey.INFINITIVE_PRESENT]: {
      base: "essere",
    },
    [ImportantVerbFormKey.GERUND_PRESENT]: {
      base: "essendo",
    },
  },
};
