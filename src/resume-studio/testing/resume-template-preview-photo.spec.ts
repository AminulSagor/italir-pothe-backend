import { DEFAULT_RESUME_FIELD_SCHEMA } from '../constants/resume-field-catalog';
import { ResumeTemplateService } from '../services/resume-template.service';
import type { ResumeData } from '../types/resume-data.types';
import type { ResumeTemplateFieldSchema } from '../types/template-schema.types';

const createService = () =>
  new ResumeTemplateService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );

const addDefaultPreviewPhoto = (
  service: ResumeTemplateService,
  data: ResumeData,
) =>
  (
    service as unknown as {
      withDefaultPreviewPhoto: (
        value: ResumeData,
        schema: ResumeTemplateFieldSchema,
      ) => ResumeData;
    }
  ).withDefaultPreviewPhoto(
    data,
    DEFAULT_RESUME_FIELD_SCHEMA as ResumeTemplateFieldSchema,
  );

describe('ResumeTemplateService preview photo', () => {
  it('uses the bundled generated portrait in photo-enabled previews', () => {
    const preview = addDefaultPreviewPhoto(createService(), {
      personal: { fullName: 'Alex Morgan' },
    });

    expect(preview.personal?.photoUrl).toMatch(
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
    );
  });

  it('preserves a supplied candidate photo', () => {
    const suppliedPhoto = 'https://example.com/candidate-photo.jpg';
    const preview = addDefaultPreviewPhoto(createService(), {
      personal: { fullName: 'Alex Morgan', photoUrl: suppliedPhoto },
    });

    expect(preview.personal?.photoUrl).toBe(suppliedPhoto);
  });
});
