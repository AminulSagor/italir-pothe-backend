import { IMPORTANT_VERB_FORM_DEFINITIONS } from "../constants/important-verb-forms.constant";
import {
  ImportantVerbAuxiliary,
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
  ImportantVerbRegularity,
} from "../types/important-verb.type";
import { ImportantVerbRulesService } from "./important-verb-rules.service";

describe("ImportantVerbRulesService", () => {
  const service = new ImportantVerbRulesService();

  it("defines all 21 Figma form groups", () => {
    expect(IMPORTANT_VERB_FORM_DEFINITIONS).toHaveLength(21);
  });

  it("builds regular -are present and future forms", () => {
    const present = service.generateRegularSimpleConjugations(
      "parlare",
      ImportantVerbFormKey.PRESENT,
    );
    const future = service.generateRegularSimpleConjugations(
      "parlare",
      ImportantVerbFormKey.SIMPLE_FUTURE,
    );

    expect(present[ImportantVerbPersonKey.IO]).toBe("parlo");
    expect(present[ImportantVerbPersonKey.NOI]).toBe("parliamo");
    expect(future[ImportantVerbPersonKey.IO]).toBe("parlerò");
  });

  it("supports common -isc verbs", () => {
    const present = service.generateRegularSimpleConjugations(
      "finire",
      ImportantVerbFormKey.PRESENT,
    );

    expect(present[ImportantVerbPersonKey.IO]).toBe("finisco");
    expect(present[ImportantVerbPersonKey.LORO]).toBe("finiscono");
  });

  it("detects common irregular verbs and essere auxiliaries", () => {
    expect(service.determineRegularity({ infinitive: "essere" })).toBe(
      ImportantVerbRegularity.IRREGULAR,
    );
    expect(service.determineAuxiliary({ infinitive: "andare" })).toBe(
      ImportantVerbAuxiliary.ESSERE,
    );
  });

  it("does not classify imperfect tags as remote past", () => {
    const result = service.mapKaikkiForm([
      "indicative",
      "past",
      "imperfect",
      "first-person",
      "singular",
    ]);

    expect(result).toEqual({
      formKey: ImportantVerbFormKey.IMPERFECT,
      personKey: ImportantVerbPersonKey.IO,
    });
  });

  it("builds deterministic English display meanings", () => {
    expect(
      service.buildEnglishConjugation({
        englishMeaning: "to speak",
        formKey: ImportantVerbFormKey.PRESENT,
        personKey: ImportantVerbPersonKey.IO,
      }),
    ).toBe("I speak");
  });
});
