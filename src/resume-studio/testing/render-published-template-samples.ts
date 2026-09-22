import { NestFactory } from '@nestjs/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { AppModule } from '../../app.module';
import { S3Service } from '../../files/services/s3.service';
import {
  ResumeTemplate,
  ResumeTemplateStatus,
} from '../entities/resume-template.entity';
import { ResumeTemplateVersion } from '../entities/resume-template-version.entity';
import { ResumeRendererService } from '../services/resume-renderer.service';
import { ResumeSchemaService } from '../services/resume-schema.service';
import type { ResumeData } from '../types/resume-data.types';

const TEMPLATE_NAMES = [
  'Modern Blue Standard',
  'Navy Sidebar Kitchen Assistant',
  'Navy Worker Operator',
] as const;

const SAMPLE_DATA: Record<'half' | 'full', ResumeData> = {
  half: {
    personal: {
      fullName: 'Rahim Ahmed',
      jobTitle: 'Kitchen Assistant',
      email: 'rahim.ahmed@example.com',
      phone: '+39 320 555 0142',
      location: 'Bologna, Italy',
      availability: 'Available immediately',
    },
    summary:
      'Reliable kitchen assistant with practical food preparation and cleaning experience. Ready to learn and support a busy team.',
    experience: [
      {
        company: 'Bella Italia Restaurant',
        position: 'Kitchen Assistant',
        location: 'Bologna, Italy',
        startDate: '2024-02',
        endDate: 'present',
        isCurrent: true,
        bullets: [
          'Prepared ingredients and kept workstations organized.',
          'Supported cleaning and dishwashing during busy services.',
        ],
      },
    ],
    skills: ['Food preparation', 'Kitchen cleaning', 'Teamwork'],
    languages: [{ name: 'Italian', proficiency: 'Basic' }],
  },
  full: {
    personal: {
      fullName: 'Rahim Ahmed',
      jobTitle: 'Kitchen Assistant / Worker',
      email: 'rahim.ahmed@example.com',
      phone: '+39 320 555 0142',
      location: 'Bologna, Italy',
      availability: 'Available immediately',
      drivingLicense: ['B'],
    },
    summary:
      'Dependable kitchen and general worker with experience in food preparation, cleaning, stock handling, and fast-paced team environments. Careful with hygiene and safety procedures, physically fit, and available for flexible shifts.',
    experience: [
      {
        company: 'Bella Italia Restaurant',
        position: 'Kitchen Assistant',
        location: 'Bologna, Italy',
        startDate: '2024-02',
        endDate: 'present',
        isCurrent: true,
        bullets: [
          'Prepared vegetables, sauces, and ingredients before service.',
          'Maintained clean workstations and followed food-safety rules.',
          'Supported chefs and dishwashing staff during busy periods.',
        ],
      },
      {
        company: 'Emilia Logistics',
        position: 'Warehouse Worker',
        location: 'Bologna, Italy',
        startDate: '2022-05',
        endDate: '2024-01',
        bullets: [
          'Picked, packed, and checked customer orders.',
          'Loaded goods safely and kept the work area organized.',
          'Worked with the team to meet daily dispatch targets.',
        ],
      },
    ],
    education: [
      {
        institution: 'Istituto Professionale Bologna',
        degree: 'Professional Qualification in Food Preparation',
        location: 'Bologna, Italy',
        startDate: '2019',
        endDate: '2021',
      },
    ],
    skills: [
      'Food preparation',
      'Kitchen cleaning',
      'Food hygiene',
      'Stock handling',
      'Packing and loading',
      'Teamwork',
      'Time management',
      'Following instructions',
    ],
    skillProficiencies: [
      { name: 'Food preparation', proficiency: 'Advanced' },
      { name: 'Teamwork', proficiency: 'Expert' },
      { name: 'Stock handling', proficiency: 'Intermediate' },
    ],
    languages: [
      { name: 'Bengali', proficiency: 'Native' },
      { name: 'English', proficiency: 'Intermediate' },
      { name: 'Italian', proficiency: 'Basic' },
    ],
    certifications: [
      {
        name: 'Food Safety and HACCP',
        issuer: 'Bologna Training Centre',
        issueDate: '2025-03',
        doesNotExpire: true,
      },
    ],
    additionalInformation: [
      'Available for full-time and shift work',
      'Driving licence category B',
      'Available to start immediately',
    ],
  },
};

interface OutputLink {
  template: string;
  sample: 'half' | 'full';
  pages: number;
  warnings: string[];
  localPdf: string;
  localPreview: string;
  pdfUrl?: string;
  previewUrl?: string;
}

interface RenderJob {
  template: ResumeTemplate;
  version: ResumeTemplateVersion;
  sample: 'half' | 'full';
  data: ResumeData;
}

async function bootstrap(): Promise<void> {
  const upload = process.argv.includes('--upload');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir =
    process.env.CV_TEST_OUTPUT_DIR?.trim() ||
    join('/tmp', 'resume-studio-render-tests', runId);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const renderer = app.get(ResumeRendererService);
    const schemaService = app.get(ResumeSchemaService);
    const s3Service = upload ? app.get(S3Service) : null;
    const templateRepository = dataSource.getRepository(ResumeTemplate);
    const versionRepository = dataSource.getRepository(ResumeTemplateVersion);

    const templates = await templateRepository
      .createQueryBuilder('template')
      .where('LOWER(template.name) IN (:...names)', {
        names: TEMPLATE_NAMES.map((name) => name.toLowerCase()),
      })
      .andWhere('template.status = :status', {
        status: ResumeTemplateStatus.PUBLISHED,
      })
      .getMany();

    const templatesByName = new Map(
      templates.map((template) => [template.name.toLowerCase(), template]),
    );
    const missing = TEMPLATE_NAMES.filter(
      (name) => !templatesByName.has(name.toLowerCase()),
    );

    if (missing.length > 0) {
      throw new Error(`Published template(s) not found: ${missing.join(', ')}`);
    }

    const jobs: RenderJob[] = [];

    for (const requestedName of TEMPLATE_NAMES) {
      const template = templatesByName.get(requestedName.toLowerCase())!;
      if (!template.publishedVersionId) {
        throw new Error(`${template.name} has no published version`);
      }

      const version = await versionRepository.findOne({
        where: { id: template.publishedVersionId },
      });
      if (!version) {
        throw new Error(`Published version missing for ${template.name}`);
      }

      for (const sample of ['half', 'full'] as const) {
        const normalized = schemaService.normalizeResumeData(
          SAMPLE_DATA[sample] as unknown as Record<string, unknown>,
          version.fieldSchema,
        );
        const visible = schemaService.applyTemplateVisibility(
          normalized,
          version.fieldSchema,
        );

        jobs.push({ template, version, sample, data: visible });
      }
    }

    // Validate all six template/data combinations before creating or uploading
    // anything, so a bad fixture can never leave behind a partial test run.
    await mkdir(outputDir, { recursive: true });

    const photoBuffer = await readFile(
      join(process.cwd(), 'assets', 'resume-studio', 'cv-preview-profile.png'),
    );
    const photoUrl = `data:image/png;base64,${photoBuffer.toString('base64')}`;
    const outputs: OutputLink[] = [];

    for (const job of jobs) {
      const { template, version, sample } = job;
      const renderData: ResumeData = {
        ...job.data,
        personal: { ...(job.data.personal ?? {}), photoUrl },
      };

      const rendered = await renderer.render({
        html: version.html,
        css: version.css,
        data: renderData,
        rendererConfig: version.rendererConfig,
      });
      const baseName = `${template.slug}-${sample}`;
      const pdfPath = join(outputDir, `${baseName}.pdf`);
      const previewPath = join(outputDir, `${baseName}.png`);

      await Promise.all([
        writeFile(pdfPath, rendered.pdfBuffer),
        writeFile(previewPath, rendered.previewImageBuffer),
      ]);

      const output: OutputLink = {
        template: template.name,
        sample,
        pages: rendered.pageCount,
        warnings: rendered.warnings,
        localPdf: pdfPath,
        localPreview: previewPath,
      };

      if (s3Service) {
        const prefix = `resume-studio/test-renders/${runId}`;
        const pdfStorageKey = `${prefix}/${baseName}.pdf`;
        const previewStorageKey = `${prefix}/${baseName}.png`;

        await Promise.all([
          s3Service.uploadBuffer({
            storageKey: pdfStorageKey,
            buffer: rendered.pdfBuffer,
            mimeType: 'application/pdf',
          }),
          s3Service.uploadBuffer({
            storageKey: previewStorageKey,
            buffer: rendered.previewImageBuffer,
            mimeType: 'image/png',
          }),
        ]);

        [output.pdfUrl, output.previewUrl] = await Promise.all([
          s3Service.createSignedReadUrl({
            storageKey: pdfStorageKey,
            mimeType: 'application/pdf',
            originalName: `${baseName}.pdf`,
            dispositionType: 'inline',
          }),
          s3Service.createSignedReadUrl({
            storageKey: previewStorageKey,
            mimeType: 'image/png',
            originalName: `${baseName}.png`,
            dispositionType: 'inline',
          }),
        ]);
      }

      outputs.push(output);
    }

    console.log(
      JSON.stringify(
        {
          runId,
          source: 'published production template versions',
          databaseWrites: 0,
          creditCharges: 0,
          outputDir,
          uploaded: upload,
          outputs,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
