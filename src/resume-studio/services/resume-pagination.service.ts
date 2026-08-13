import { Injectable } from '@nestjs/common';

interface ResumePaginationPageLike {
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}

export interface ResumePaginationResult {
  inspectedEntries: number;
  splitEntries: number;
}

/**
 * Chromium is the source of truth for paged-media fragmentation.
 *
 * This service deliberately does NOT calculate page indexes and does NOT
 * inject `break-before: page`. Manual page-position guesses are brittle once
 * print fragmentation, cloned page padding, fonts, images, grids, and dynamic
 * content are involved.
 *
 * Its only job is to relax `break-inside: avoid` for an individual repeatable
 * entry that is physically too tall to fit inside one printable page fragment.
 * Everything else is left to Chromium's native print layout engine.
 */
@Injectable()
export class ResumePaginationService {
  async apply(page: ResumePaginationPageLike): Promise<ResumePaginationResult> {
    return page.evaluate(() => {
      const FALLBACK_A4_HEIGHT_PX = 1122.52;
      const OVERSIZE_TOLERANCE_PX = 2;

      const measureA4Height = (): number => {
        const probe = document.createElement('div');

        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.width = '1px';
        probe.style.height = '297mm';

        document.body.appendChild(probe);

        const height = probe.getBoundingClientRect().height;

        probe.remove();

        return height > 0 ? height : FALLBACK_A4_HEIGHT_PX;
      };

      const isVisible = (element: Element): boolean => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const parseCssPixels = (value: string): number => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      /**
       * Most CV templates use one top-level A4 wrapper whose padding acts as
       * the printable-page inset. Measuring that wrapper keeps the oversized
       * threshold aligned with the template without creating a second margin
       * configuration in TypeScript.
       */
      const getTopLevelLayoutRoot = (element: Element): HTMLElement | null => {
        let current = element.parentElement;
        let root: HTMLElement | null = null;

        while (current && current !== document.body) {
          root = current;
          current = current.parentElement;
        }

        return root;
      };

      const getPrintableFragmentHeight = (
        element: Element,
        a4Height: number,
      ): number => {
        const root = getTopLevelLayoutRoot(element);

        if (!root) {
          return a4Height;
        }

        const style = window.getComputedStyle(root);

        const verticalInsets =
          parseCssPixels(style.paddingTop) +
          parseCssPixels(style.paddingBottom) +
          parseCssPixels(style.borderTopWidth) +
          parseCssPixels(style.borderBottomWidth);

        /*
         * A malformed template can theoretically consume the entire page with
         * padding. In that case fall back to the physical A4 height so this
         * safety pass never creates an invalid negative/zero threshold.
         */
        const available = a4Height - verticalInsets;

        return available > 0 ? available : a4Height;
      };

      const allowSplit = (element: Element): void => {
        const htmlElement = element as HTMLElement;

        element.classList.add('resume-allow-split');
        element.setAttribute('data-resume-pagination-split', 'true');

        htmlElement.style.setProperty('break-inside', 'auto', 'important');
        htmlElement.style.setProperty('page-break-inside', 'auto', 'important');
      };

      /*
       * apply() is idempotent. Also remove attributes/classes written by the
       * previous paginator implementation so a reused Chromium page can never
       * retain a stale forced page break.
       */
      document
        .querySelectorAll(
          '[data-resume-pagination-moved], .resume-page-break-before',
        )
        .forEach((element) => {
          const htmlElement = element as HTMLElement;

          element.classList.remove('resume-page-break-before');
          element.removeAttribute('data-resume-pagination-moved');
          element.removeAttribute('data-resume-pagination-lock-children');

          htmlElement.style.removeProperty('break-before');
          htmlElement.style.removeProperty('page-break-before');
        });

      document
        .querySelectorAll('[data-resume-pagination-split]')
        .forEach((element) => {
          const htmlElement = element as HTMLElement;

          element.classList.remove('resume-allow-split');
          element.removeAttribute('data-resume-pagination-split');

          htmlElement.style.removeProperty('break-inside');
          htmlElement.style.removeProperty('page-break-inside');
        });

      void document.documentElement.offsetHeight;

      const a4Height = measureA4Height();
      const entries = Array.from(
        document.querySelectorAll('[data-resume-entry]'),
      ).filter(isVisible);

      let splitEntries = 0;

      for (const entry of entries) {
        const rect = entry.getBoundingClientRect();
        const printableHeight = getPrintableFragmentHeight(entry, a4Height);

        if (rect.height > printableHeight + OVERSIZE_TOLERANCE_PX) {
          allowSplit(entry);
          splitEntries += 1;
        }
      }

      if (splitEntries > 0) {
        void document.documentElement.offsetHeight;
      }

      return {
        inspectedEntries: entries.length,
        splitEntries,
      };
    });
  }
}
