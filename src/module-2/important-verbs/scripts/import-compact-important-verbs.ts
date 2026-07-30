import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../../../app.module';
import { ImportantVerbConjugation } from '../entities/important-verb-conjugation.entity';
import { ImportantVerbExample } from '../entities/important-verb-example.entity';
import { ImportantVerbForm } from '../entities/important-verb-form.entity';
import { ImportantVerb } from '../entities/important-verb.entity';
import {
  ImportantVerbAuxiliary,
  ImportantVerbEndingType,
  ImportantVerbExampleSource,
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
  ImportantVerbRegularity,
} from '../types/important-verb.type';

type LanguageTriple = [english: string, bangla: string, italian: string];
type TranslationRow = [italian: string, english: string, bangla: string];
type ExampleRow = [italian: string, english: string, bangla: string];

type PersonMetadata = {
  it: string;
  en: string;
  bn: string;
};

type FormMetadata = {
  key: ImportantVerbFormKey;
  title: LanguageTriple;
  description: LanguageTriple;
  persons: ImportantVerbPersonKey[];
};

type VerbFormData = {
  rows: TranslationRow[];
  example: ExampleRow;
};

type CompactVerb = {
  infinitive: string;
  meaning: {
    en: string;
    bn: string;
  };
  regularity: ImportantVerbRegularity;
  ending: ImportantVerbEndingType;
  auxiliary: ImportantVerbAuxiliary;
  forms: Partial<Record<ImportantVerbFormKey, VerbFormData>>;
};

type CompactDataset = {
  schemaVersion: string;
  persons: Record<ImportantVerbPersonKey, PersonMetadata>;
  forms: FormMetadata[];
  verbs: CompactVerb[];
};

const COMPOUND_FORMS = new Set<ImportantVerbFormKey>([
  ImportantVerbFormKey.PRESENT_PERFECT,
  ImportantVerbFormKey.PAST_PERFECT,
  ImportantVerbFormKey.REMOTE_PAST_PERFECT,
  ImportantVerbFormKey.FUTURE_PERFECT,
  ImportantVerbFormKey.SUBJUNCTIVE_PAST,
  ImportantVerbFormKey.SUBJUNCTIVE_PAST_PERFECT,
  ImportantVerbFormKey.CONDITIONAL_PAST,
  ImportantVerbFormKey.INFINITIVE_PAST,
  ImportantVerbFormKey.GERUND_PAST,
]);

function validateRows(
  verb: CompactVerb,
  formMeta: FormMetadata,
  formData: VerbFormData,
): void {
  if (formData.rows.length !== formMeta.persons.length) {
    throw new Error(
      `${verb.infinitive}/${formMeta.key}: expected ` +
        `${formMeta.persons.length} rows, received ${formData.rows.length}`,
    );
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const filePath = join(
      __dirname,
      '../data/important-verbs-108-compact.json',
    );

    const dataset = JSON.parse(
      await readFile(filePath, 'utf8'),
    ) as CompactDataset;

    await dataSource.transaction(async (manager) => {
      const verbRepository = manager.getRepository(ImportantVerb);
      const formRepository = manager.getRepository(ImportantVerbForm);
      const conjugationRepository = manager.getRepository(
        ImportantVerbConjugation,
      );
      const exampleRepository = manager.getRepository(ImportantVerbExample);

      for (const [verbIndex, verbData] of dataset.verbs.entries()) {
        let verb = await verbRepository.findOne({
          where: { infinitive: verbData.infinitive },
        });

        verb ??= verbRepository.create({
          infinitive: verbData.infinitive,
          slug: verbData.infinitive,
        });

        Object.assign(verb, {
          infinitive: verbData.infinitive,
          slug: verbData.infinitive,
          englishMeaning: verbData.meaning.en,
          banglaMeaning: verbData.meaning.bn,
          italianMeaning: null,
          regularity: verbData.regularity,
          endingType: verbData.ending,
          auxiliary: verbData.auxiliary,
          tags: [verbData.regularity, verbData.ending, 'static-json'],
          frequencyRank: null,
          sortOrder: verbIndex + 1,
          isPublished: true,
          sourceHash: null,
          translationSourceHash: null,
          sourceVersion: dataset.schemaVersion,
        });

        verb = await verbRepository.save(verb);

        for (const [formIndex, formMeta] of dataset.forms.entries()) {
          const formData = verbData.forms[formMeta.key];
          if (!formData) {
            throw new Error(
              `${verbData.infinitive}: missing form ${formMeta.key}`,
            );
          }

          validateRows(verbData, formMeta, formData);

          let form = await formRepository.findOne({
            where: {
              verbId: verb.id,
              formKey: formMeta.key,
            },
          });

          form ??= formRepository.create({
            verbId: verb.id,
            formKey: formMeta.key,
          });

          Object.assign(form, {
            verbId: verb.id,
            formKey: formMeta.key,
            titleEn: formMeta.title[0],
            titleBn: formMeta.title[1],
            titleIt: formMeta.title[2],
            descriptionEn: formMeta.description[0],
            descriptionBn: formMeta.description[1],
            descriptionIt: formMeta.description[2],
            isCompound: COMPOUND_FORMS.has(formMeta.key),
            sortOrder: formIndex + 1,
            sourceHash: null,
          });

          form = await formRepository.save(form);

          // The compact JSON has exactly one form-level example. Delete old
          // generated examples and conjugations before inserting its rows.
          await exampleRepository.delete({ formId: form.id });
          await conjugationRepository.delete({ formId: form.id });

          const conjugations = formData.rows.flatMap((row, rowIndex) => {
            // Some modal verbs (dovere, potere, volere) do not normally use
            // the imperative. Their compact JSON rows contain null instead
            // of an Italian conjugated form, so skip those placeholder rows.
            if (!row[0]) {
              return [];
            }

            const personKey = formMeta.persons[rowIndex];
            const person = dataset.persons[personKey];

            return [
              conjugationRepository.create({
                formId: form.id,
                personKey,
                pronounIt: person.it || null,
                pronounEn: person.en || null,
                pronounBn: person.bn || null,
                conjugatedText: row[0],
                englishMeaning: row[1],
                banglaMeaning: row[2],
                sourceTags: ['static-json', 'curated'],
                sortOrder: rowIndex + 1,
                sourceHash: null,
                translationSourceHash: null,
              }),
            ];
          });

          if (conjugations.length > 0) {
            await conjugationRepository.save(conjugations);
          }

          await exampleRepository.save(
            exampleRepository.create({
              formId: form.id,
              conjugationId: null,
              italianText: formData.example[0],
              englishText: formData.example[1],
              banglaText: formData.example[2],
              source: ImportantVerbExampleSource.TEMPLATE,
              sourceReference: 'important-verbs-108-compact.json',
              sourceLicense: 'internal-static',
              sortOrder: 1,
              sourceHash: null,
              translationSourceHash: null,
            }),
          );
        }

        console.log(`Imported ${verbData.infinitive}`);
      }
    });

    console.log(`Imported ${dataset.verbs.length} verbs successfully.`);
  } finally {
    await app.close();
  }
}

void bootstrap();
