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
import { ResumeSchemaService } from './resume-schema.service';
import { ResumeTemplateEngineService } from './resume-template-engine.service';

interface PuppeteerBrowserLike {
  newPage(): Promise<PuppeteerPageLike>;
  close(): Promise<void>;
}

interface PuppeteerPageLike {
  setViewport(viewport: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
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
  ) {}

  async render(params: {
    html: string;
    css: string;
    data: ResumeData;
    rendererConfig: ResumeRendererConfig;
  }): Promise<ResumeRenderResult> {
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

    const puppeteer = this.loadPuppeteer();
    const executablePath = this.configService.get<string>('CV_RENDER_CHROMIUM_PATH')?.trim();
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.5 });
      await page.setContent(documentHtml, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(async () => {
        if ('fonts' in document) {
          await (document as any).fonts.ready;
        }
        const images = Array.from(document.images);
        await Promise.all(
          images.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            });
          }),
        );
      });
      await page.emulateMediaType('print');
      const diagnostics = await page.evaluate(() => {
        const brokenImages = Array.from(document.images).filter(
          (image) => !image.naturalWidth || !image.naturalHeight,
        );
        brokenImages.forEach((image) => {
          image.style.display = 'none';
        });
        const oversizedEntries = Array.from(
          document.querySelectorAll('[data-resume-entry]'),
        ).filter((element) => element.getBoundingClientRect().height > 1123).length;
        const horizontalOverflow =
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        return {
          brokenImages: brokenImages.length,
          oversizedEntries,
          horizontalOverflow,
        };
      });

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        displayHeaderFooter: false,
      });
      const pdfBuffer = Buffer.from(pdfBytes);
      const pageCount = (await PDFDocument.load(pdfBuffer)).getPageCount();

      if (pageCount > params.rendererConfig.hardMaxPages) {
        throw new BadRequestException(
          `CV is ${pageCount} pages. This template allows a maximum of ${params.rendererConfig.hardMaxPages} pages.`,
        );
      }

      const previewImageBuffer = Buffer.from(
        await page.screenshot({ type: 'png', fullPage: false }),
      );

      const warnings: string[] = [];
      if (pageCount > params.rendererConfig.recommendedMaxPages) {
        warnings.push(
          `CV is ${pageCount} pages; ${params.rendererConfig.recommendedMaxPages} or fewer is recommended for this template.`,
        );
      }
      if (diagnostics.oversizedEntries > 0) {
        warnings.push(
          `${diagnostics.oversizedEntries} content block(s) are taller than one A4 page and must split across pages.`,
        );
      }
      if (diagnostics.brokenImages > 0) {
        warnings.push(`${diagnostics.brokenImages} image(s) could not be loaded and were hidden.`);
      }
      if (diagnostics.horizontalOverflow) {
        warnings.push('Template contains horizontal overflow; review long names, URLs, or fixed-width elements.');
      }

      return { pdfBuffer, previewImageBuffer, pageCount, warnings };
    } finally {
      await browser.close();
    }
  }

  private loadPuppeteer(): PuppeteerLike {
    try {
      // Runtime require avoids coupling TypeScript compilation to a specific Puppeteer package version.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const moduleName = 'puppeteer';
      const loaded = require(moduleName) as PuppeteerLike | { default?: PuppeteerLike };
      return ('default' in loaded && loaded.default ? loaded.default : loaded) as PuppeteerLike;
    } catch {
      throw new InternalServerErrorException(
        'PDF renderer is unavailable. Install Puppeteer and configure CV_RENDER_CHROMIUM_PATH when required.',
      );
    }
  }

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
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
${fontCss}
${templateCss}
/* Renderer invariants intentionally come after template CSS. */
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 210mm; min-height: 297mm; }
body { overflow: visible; overflow-wrap: anywhere; word-break: normal; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
[data-resume-entry] { break-inside: avoid; page-break-inside: avoid; }
[data-resume-section-title] { break-after: avoid; page-break-after: avoid; }
[data-resume-photo] { object-fit: cover; object-position: center; }
a { overflow-wrap: anywhere; }
${emptySectionCss}
</style>
</head>
<body>${body}</body>
</html>`;
  }

  private buildEmptySectionCss(data: ResumeData): string {
    const empty = this.schemaService.getEmptySections(data);
    return empty
      .map((key) => `[data-resume-section="${key}"]{display:none!important;}`)
      .join('\n');
  }

  private async buildFontCss(): Promise<string> {
    const family = this.configService.get<string>('CV_RENDER_FONT_FAMILY')?.trim() || 'ResumeSans';
    const regular = this.configService.get<string>('CV_RENDER_FONT_REGULAR_PATH')?.trim();
    const bold = this.configService.get<string>('CV_RENDER_FONT_BOLD_PATH')?.trim();
    const fallbackPaths = (
      this.configService.get<string>('CV_RENDER_FONT_FALLBACK_PATHS') ?? ''
    )
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
    const declarations: string[] = [];
    const familyStack = [`"${this.escapeCss(family)}"`];

    if (regular) {
      const uri = await this.fontFileToDataUri(regular);
      declarations.push(`@font-face{font-family:"${this.escapeCss(family)}";src:url("${uri}");font-style:normal;font-weight:400;font-display:block;}`);
    }
    if (bold) {
      const uri = await this.fontFileToDataUri(bold);
      declarations.push(`@font-face{font-family:"${this.escapeCss(family)}";src:url("${uri}");font-style:normal;font-weight:700;font-display:block;}`);
    }
    for (let index = 0; index < fallbackPaths.length; index += 1) {
      const fallbackFamily = `ResumeFallback${index}`;
      const uri = await this.fontFileToDataUri(fallbackPaths[index]);
      declarations.push(`@font-face{font-family:"${fallbackFamily}";src:url("${uri}");font-style:normal;font-weight:400;font-display:block;}`);
      familyStack.push(`"${fallbackFamily}"`);
    }
    if (regular || bold || fallbackPaths.length) {
      declarations.push(`body{font-family:${familyStack.join(',')},Arial,sans-serif;}`);
    }
    return declarations.join('\n');
  }

  private async fontFileToDataUri(path: string): Promise<string> {
    try {
      const data = await fs.readFile(path);
      const extension = path.toLowerCase().endsWith('.otf') ? 'opentype' : 'truetype';
      return `data:font/${extension};base64,${data.toString('base64')}`;
    } catch {
      throw new InternalServerErrorException(`Configured CV renderer font could not be loaded: ${path}`);
    }
  }

  private escapeAttribute(value: string): string {
    return value.replace(/["&<>]/g, '');
  }

  private escapeCss(value: string): string {
    return value.replace(/["'\\{};]/g, '');
  }
}
