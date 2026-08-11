import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { EXTREME_RESUME_DATA } from './extreme-resume.fixture';
import { ResumeRendererService } from '../services/resume-renderer.service';
import { ResumeSchemaService } from '../services/resume-schema.service';
import { ResumeTemplateEngineService } from '../services/resume-template-engine.service';

const describeRenderer = process.env.RUN_CV_RENDER_TESTS === 'true' ? describe : describe.skip;

describeRenderer('ResumeRendererService extreme visual contract', () => {
  const schema = new ResumeSchemaService();
  const renderer = new ResumeRendererService(
    new ConfigService(process.env),
    new ResumeTemplateEngineService(),
    schema,
  );

  const html = `
    <main class="page">
      <h1>{{personal.fullName}}</h1>
      <p>{{personal.jobTitle}}</p>
      <section data-resume-section="experience">
        <h2 data-resume-section-title>Experience</h2>
        {{#each experience}}
          <article data-resume-entry>
            <h3>{{position}} — {{company}}</h3>
            <p>{{description}}</p>
            <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
          </article>
        {{/each}}
      </section>
      <section data-resume-section="skills"><h2 data-resume-section-title>Skills</h2>{{#each skills}}<span>{{this}} </span>{{/each}}</section>
    </main>`;
  const css = `.page{width:210mm;min-height:297mm;padding:14mm;font-family:Arial,sans-serif;}h1{overflow-wrap:anywhere;}article{margin-bottom:5mm;}span{display:inline-block;margin:1mm;}`;

  it('rejects pathological content that exceeds the hard page maximum', async () => {
    await expect(
      renderer.render({
        html,
        css,
        data: EXTREME_RESUME_DATA,
        rendererConfig: {
          layout: 'single-column',
          sidebarContinuation: 'not-applicable',
          recommendedMaxPages: 2,
          hardMaxPages: 6,
          locale: 'en',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('renders long names and missing photos without layout-specific Flutter logic', async () => {
    const data = {
      personal: EXTREME_RESUME_DATA.personal,
      experience: EXTREME_RESUME_DATA.experience?.slice(0, 2),
      skills: EXTREME_RESUME_DATA.skills?.slice(0, 20),
    };
    const result = await renderer.render({
      html,
      css,
      data,
      rendererConfig: {
        layout: 'single-column',
        sidebarContinuation: 'not-applicable',
        recommendedMaxPages: 2,
        hardMaxPages: 6,
        locale: 'en',
      },
    });
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pdfBuffer.length).toBeGreaterThan(1000);
  });
});
