import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { promises as fs } from 'node:fs';

import type { ResumeData } from '../types/resume-data.types';
import type { ResumeRendererConfig } from '../types/template-schema.types';

import { ResumePaginationService } from './resume-pagination.service';
import { ResumeSchemaService } from './resume-schema.service';
import { ResumeTemplateEngineService } from './resume-template-engine.service';

interface PuppeteerBrowserLike {
  newPage(): Promise<PuppeteerPageLike>;
  close(): Promise<void>;
}

interface PuppeteerPageLike {
  setViewport(viewport: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  }): Promise<void>;

  setContent(html: string, options?: Record<string, unknown>): Promise<void>;

  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;

  pdf(options: Record<string, unknown>): Promise<Uint8Array>;

  screenshot(options: Record<string, unknown>): Promise<Uint8Array>;

  emulateMediaType(type: 'screen' | 'print'): Promise<void>;
}

interface PuppeteerLike {
  launch(options: Record<string, unknown>): Promise<PuppeteerBrowserLike>;
}

export interface ResumeRenderResult {
  pdfBuffer: Buffer;
  previewImageBuffer: Buffer;
  pageCount: number;
  warnings: string[];
}

@Injectable()
export class ResumeRendererService {
  constructor(
    private readonly configService: ConfigService,
    private readonly templateEngine: ResumeTemplateEngineService,
    private readonly schemaService: ResumeSchemaService,
    private readonly paginationService: ResumePaginationService,
  ) {}

  async render(params: {
    html: string;
    css: string;
    data: ResumeData;
    rendererConfig: ResumeRendererConfig;
  }): Promise<ResumeRenderResult> {
    /*
     * -----------------------------------------
     * 1. BUILD DOCUMENT
     * -----------------------------------------
     */

    const renderData = params.data as unknown as Record<string, unknown>;

    const renderedBody = this.templateEngine.render(params.html, renderData);

    const fontCss = await this.buildFontCss();

    const emptySectionCss = this.buildEmptySectionCss(params.data);

    const documentHtml = this.wrapDocument(
      renderedBody,
      params.css,
      fontCss,
      emptySectionCss,
      params.rendererConfig.locale ?? 'en',
    );

    /*
     * -----------------------------------------
     * 2. START CHROMIUM
     * -----------------------------------------
     */

    const puppeteer = this.loadPuppeteer();

    const executablePath = this.configService
      .get<string>('CV_RENDER_CHROMIUM_PATH')
      ?.trim();

    const browser = await puppeteer.launch({
      headless: true,

      executablePath: executablePath || undefined,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      /*
       * -----------------------------------------
       * 3. CREATE PAGE
       * -----------------------------------------
       */

      const page = await browser.newPage();

      await page.setViewport({
        width: 794,
        height: 1123,
        deviceScaleFactor: 1.5,
      });

      /*
       * -----------------------------------------
       * 4. LOAD HTML
       * -----------------------------------------
       */

      await page.setContent(documentHtml, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      /*
       * -----------------------------------------
       * 5. WAIT FOR FONTS + IMAGES
       * -----------------------------------------
       */

      await page.evaluate(async () => {
        if ('fonts' in document) {
          await (
            document as Document & {
              fonts?: {
                ready: Promise<unknown>;
              };
            }
          ).fonts?.ready;
        }

        const images = Array.from(document.images);

        await Promise.all(
          images.map((image) => {
            if (image.complete) {
              return Promise.resolve();
            }

            return new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });

              image.addEventListener('error', () => resolve(), { once: true });
            });
          }),
        );
      });

      /*
       * -----------------------------------------
       * 6. SWITCH TO PRINT LAYOUT
       * -----------------------------------------
       */

      await page.emulateMediaType('print');

      /*
       * -----------------------------------------
       * 7. REMOVE BROKEN IMAGES
       * -----------------------------------------
       *
       * Do this BEFORE pagination because a
       * broken image may still occupy layout
       * space and make measurements incorrect.
       */

      const imageDiagnostics = await page.evaluate(() => {
        const brokenImages = Array.from(document.images).filter(
          (image) => !image.naturalWidth || !image.naturalHeight,
        );

        brokenImages.forEach((image) => {
          image.style.display = 'none';
        });

        /*
         * Force browser layout recalculation
         * after removing broken images.
         */
        void document.body.offsetHeight;

        return {
          brokenImages: brokenImages.length,
        };
      });

      /*
       * -----------------------------------------
       * 8. SMART PAGINATION
       * -----------------------------------------
       *
       * This is the important new stage.
       *
       * It:
       * - keeps small sections together
       * - prevents orphan headings
       * - moves entries that would split badly
       * - allows oversized entries to split
       */

      const pagination = await this.paginationService.apply(page);

      /*
       * -----------------------------------------
       * 9. FINAL LAYOUT DIAGNOSTICS
       * -----------------------------------------
       */

      const diagnostics = await page.evaluate(() => {
        const horizontalOverflow =
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2;

        return {
          horizontalOverflow,
        };
      });

      /*
       * -----------------------------------------
       * 10. GENERATE PDF
       * -----------------------------------------
       */

      const pdfBytes = await page.pdf({
        format: 'A4',

        printBackground: true,

        preferCSSPageSize: true,

        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },

        displayHeaderFooter: false,
      });

      const pdfBuffer = Buffer.from(pdfBytes);

      /*
       * -----------------------------------------
       * 11. READ REAL PDF PAGE COUNT
       * -----------------------------------------
       */

      const pdfDocument = await PDFDocument.load(pdfBuffer);

      const pageCount = pdfDocument.getPageCount();

      /*
       * -----------------------------------------
       * 12. HARD PAGE LIMIT
       * -----------------------------------------
       */

      if (pageCount > params.rendererConfig.hardMaxPages) {
        throw new BadRequestException(
          `CV is ${pageCount} pages. This template allows a maximum of ${params.rendererConfig.hardMaxPages} pages.`,
        );
      }

      /*
       * -----------------------------------------
       * 13. GENERATE PREVIEW IMAGE
       * -----------------------------------------
       */

      const previewImageBuffer = Buffer.from(
        await page.screenshot({
          type: 'png',
          fullPage: false,
        }),
      );

      /*
       * -----------------------------------------
       * 14. BUILD WARNINGS
       * -----------------------------------------
       */

      const warnings: string[] = [];

      /*
       * Recommended page count warning.
       */

      if (pageCount > params.rendererConfig.recommendedMaxPages) {
        warnings.push(
          `CV is ${pageCount} pages; ${params.rendererConfig.recommendedMaxPages} or fewer is recommended for this template.`,
        );
      }

      /*
       * Oversized entry warning.
       */

      if (pagination.splitEntries > 0) {
        warnings.push(
          `${pagination.splitEntries} content block(s) are taller than one A4 page and were allowed to split safely.`,
        );
      }

      /*
       * Automatic pagination adjustments.
       */

      if (pagination.movedSections > 0 || pagination.movedEntries > 0) {
        warnings.push(
          `Pagination automatically repositioned ${pagination.movedSections} section(s) and ${pagination.movedEntries} entry block(s) to avoid awkward page breaks.`,
        );
      }

      /*
       * Orphan heading correction.
       */

      if (pagination.orphanHeadingsFixed > 0) {
        warnings.push(
          `${pagination.orphanHeadingsFixed} section heading(s) were moved with their first content block to avoid orphan headings.`,
        );
      }

      /*
       * Broken image warning.
       */

      if (imageDiagnostics.brokenImages > 0) {
        warnings.push(
          `${imageDiagnostics.brokenImages} image(s) could not be loaded and were hidden.`,
        );
      }

      /*
       * Horizontal overflow warning.
       */

      if (diagnostics.horizontalOverflow) {
        warnings.push(
          'Template contains horizontal overflow; review long names, URLs, or fixed-width elements.',
        );
      }

      /*
       * -----------------------------------------
       * 15. RETURN RESULT
       * -----------------------------------------
       */

      return {
        pdfBuffer,
        previewImageBuffer,
        pageCount,
        warnings,
      };
    } finally {
      /*
       * Always close Chromium.
       */

      await browser.close();
    }
  }

  /*
   * =========================================
   * PUPPETEER LOADER
   * =========================================
   */

  private loadPuppeteer(): PuppeteerLike {
    try {
      /*
       * Runtime require avoids coupling
       * TypeScript compilation to one
       * particular Puppeteer version.
       */

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const moduleName = 'puppeteer';

      const loaded = require(moduleName) as
        | PuppeteerLike
        | {
            default?: PuppeteerLike;
          };

      return (
        'default' in loaded && loaded.default ? loaded.default : loaded
      ) as PuppeteerLike;
    } catch {
      throw new InternalServerErrorException(
        'PDF renderer is unavailable. Install Puppeteer and configure CV_RENDER_CHROMIUM_PATH when required.',
      );
    }
  }

  /*
   * =========================================
   * DOCUMENT WRAPPER
   * =========================================
   */

  private wrapDocument(
    body: string,
    templateCss: string,
    fontCss: string,
    emptySectionCss: string,
    locale: string,
  ): string {
    return `<!doctype html>
<html lang="${this.escapeAttribute(locale)}">

<head>

<meta charset="utf-8" />

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
/>

<style>

${fontCss}

${templateCss}

/*
 * =========================================
 * RENDERER INVARIANTS
 * =========================================
 *
 * These intentionally come AFTER template CSS.
 */

@page {
  size: A4;
  margin: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;

  width: 210mm;
  min-height: 297mm;
}

body {
  overflow: visible;

  overflow-wrap: anywhere;
  word-break: normal;

  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/*
 * Keep standard CV entries together.
 */

[data-resume-entry] {
  break-inside: avoid;
  page-break-inside: avoid;
}

/*
 * Never leave section heading alone
 * at the bottom of a page.
 */

[data-resume-section-title] {
  break-after: avoid;
  page-break-after: avoid;
}

/*
 * Standard photo behaviour.
 */

[data-resume-photo] {
  object-fit: cover;
  object-position: center;
}

/*
 * Added dynamically by
 * ResumePaginationService.
 *
 * Moves a block cleanly to the next page.
 */

.resume-page-break-before {
  break-before: page !important;
  page-break-before: always !important;
}

/*
 * Added dynamically when one individual
 * block is taller than an A4 page.
 */

.resume-allow-split {
  break-inside: auto !important;
  page-break-inside: auto !important;
}

/*
 * Long URLs must never overflow horizontally.
 */

a {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/*
 * Hide empty CV sections.
 */

${emptySectionCss}

</style>

</head>

<body>

${body}

</body>

</html>`;
  }

  /*
   * =========================================
   * EMPTY SECTION CSS
   * =========================================
   */

  private buildEmptySectionCss(data: ResumeData): string {
    const empty = this.schemaService.getEmptySections(data);

    return empty
      .map((key) => `[data-resume-section="${key}"]{display:none!important;}`)
      .join('\n');
  }

  /*
   * =========================================
   * FONT CSS
   * =========================================
   */

  private async buildFontCss(): Promise<string> {
    const family =
      this.configService.get<string>('CV_RENDER_FONT_FAMILY')?.trim() ||
      'ResumeSans';

    const regular = this.configService
      .get<string>('CV_RENDER_FONT_REGULAR_PATH')
      ?.trim();

    const bold = this.configService
      .get<string>('CV_RENDER_FONT_BOLD_PATH')
      ?.trim();

    const fallbackPaths = (
      this.configService.get<string>('CV_RENDER_FONT_FALLBACK_PATHS') ?? ''
    )
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);

    const declarations: string[] = [];

    const familyStack = [`"${this.escapeCss(family)}"`];

    /*
     * Regular font.
     */

    if (regular) {
      const uri = await this.fontFileToDataUri(regular);

      declarations.push(
        `@font-face{font-family:"${this.escapeCss(family)}";src:url("${uri}");font-style:normal;font-weight:400;font-display:block;}`,
      );
    }

    /*
     * Bold font.
     */

    if (bold) {
      const uri = await this.fontFileToDataUri(bold);

      declarations.push(
        `@font-face{font-family:"${this.escapeCss(family)}";src:url("${uri}");font-style:normal;font-weight:700;font-display:block;}`,
      );
    }

    /*
     * Unicode fallback fonts.
     */

    for (let index = 0; index < fallbackPaths.length; index += 1) {
      const fallbackFamily = `ResumeFallback${index}`;

      const uri = await this.fontFileToDataUri(fallbackPaths[index]);

      declarations.push(
        `@font-face{font-family:"${fallbackFamily}";src:url("${uri}");font-style:normal;font-weight:400;font-display:block;}`,
      );

      familyStack.push(`"${fallbackFamily}"`);
    }

    /*
     * Override template font only when
     * renderer fonts were actually configured.
     */

    if (regular || bold || fallbackPaths.length) {
      declarations.push(
        `body{font-family:${familyStack.join(',')},Arial,sans-serif;}`,
      );
    }

    return declarations.join('\n');
  }

  /*
   * =========================================
   * FONT FILE → DATA URI
   * =========================================
   */

  private async fontFileToDataUri(path: string): Promise<string> {
    try {
      const data = await fs.readFile(path);

      const extension = path.toLowerCase().endsWith('.otf')
        ? 'opentype'
        : 'truetype';

      return `data:font/${extension};base64,${data.toString('base64')}`;
    } catch {
      throw new InternalServerErrorException(
        `Configured CV renderer font could not be loaded: ${path}`,
      );
    }
  }

  /*
   * =========================================
   * SANITIZATION HELPERS
   * =========================================
   */

  private escapeAttribute(value: string): string {
    return value.replace(/["&<>]/g, '');
  }

  private escapeCss(value: string): string {
    return value.replace(/["'\\{};]/g, '');
  }
}
