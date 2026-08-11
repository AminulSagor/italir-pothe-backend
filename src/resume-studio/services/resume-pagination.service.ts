import { Injectable } from '@nestjs/common';

interface ResumePaginationPageLike {
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}

export interface ResumePaginationResult {
  movedSections: number;
  movedEntries: number;
  splitEntries: number;
  orphanHeadingsFixed: number;
  passes: number;
}

@Injectable()
export class ResumePaginationService {
  async apply(page: ResumePaginationPageLike): Promise<ResumePaginationResult> {
    return page.evaluate(() => {
      /*
       * A4 is 297mm high.
       *
       * We measure 297mm inside Chromium instead of relying on a
       * hard-coded px value because Chromium/Puppeteer scaling can vary.
       */
      const probe = document.createElement('div');

      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.width = '1px';
      probe.style.height = '297mm';

      document.body.appendChild(probe);

      const measuredPageHeight = probe.getBoundingClientRect().height;

      probe.remove();

      const pageHeight = measuredPageHeight > 0 ? measuredPageHeight : 1122.52;

      const EPSILON = 2;
      const PAGE_START_TOLERANCE = 5;

      /*
       * A section smaller than this percentage of one page is treated
       * as a "small section".
       *
       * Example:
       * Languages, Certifications, References.
       *
       * If such a section would split, move the entire section.
       */
      const SMALL_SECTION_MAX_RATIO = 0.48;

      const MAX_PASSES = 4;

      let movedSections = 0;
      let movedEntries = 0;
      let splitEntries = 0;
      let orphanHeadingsFixed = 0;
      let passes = 0;

      const getRect = (element: Element) => {
        const rect = element.getBoundingClientRect();

        const top = rect.top + window.scrollY;
        const bottom = rect.bottom + window.scrollY;

        return {
          top,
          bottom,
          height: rect.height,
        };
      };

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.height > 0
        );
      };

      const pageIndex = (position: number) => {
        return Math.floor(Math.max(0, position - EPSILON) / pageHeight);
      };

      const crossesPage = (rect: {
        top: number;
        bottom: number;
        height: number;
      }) => {
        if (rect.height <= 0) {
          return false;
        }

        return (
          pageIndex(rect.top) !==
          pageIndex(Math.max(rect.top, rect.bottom - EPSILON))
        );
      };

      const isAtPageStart = (top: number) => {
        const offset = ((top % pageHeight) + pageHeight) % pageHeight;

        return offset <= PAGE_START_TOLERANCE;
      };

      const forceBreakBefore = (
        element: Element,
        type: 'section' | 'entry',
      ) => {
        if (element.classList.contains('resume-page-break-before')) {
          return false;
        }

        const htmlElement = element as HTMLElement;

        element.classList.add('resume-page-break-before');

        htmlElement.style.setProperty('break-before', 'page', 'important');

        htmlElement.style.setProperty(
          'page-break-before',
          'always',
          'important',
        );

        element.setAttribute('data-resume-pagination-moved', type);

        return true;
      };

      const allowSplit = (element: Element) => {
        if (element.classList.contains('resume-allow-split')) {
          return false;
        }

        const htmlElement = element as HTMLElement;

        element.classList.add('resume-allow-split');

        htmlElement.style.setProperty('break-inside', 'auto', 'important');

        htmlElement.style.setProperty('page-break-inside', 'auto', 'important');

        element.setAttribute('data-resume-pagination-split', 'true');

        return true;
      };

      /*
       * Remove pagination changes if apply() somehow runs twice
       * against the same page.
       */
      document
        .querySelectorAll('[data-resume-pagination-moved]')
        .forEach((element) => {
          const htmlElement = element as HTMLElement;

          element.classList.remove('resume-page-break-before');

          element.removeAttribute('data-resume-pagination-moved');

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

      for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        passes = pass + 1;

        let changed = false;

        /*
         * --------------------------------------------------
         * 1. HANDLE OVERSIZED ENTRIES
         * --------------------------------------------------
         *
         * If one job/education/project is itself taller than
         * one A4 page, keeping it together is impossible.
         *
         * Allow Chromium to split only that entry.
         */
        const entries = Array.from(
          document.querySelectorAll('[data-resume-entry]'),
        );

        for (const entry of entries) {
          if (!isVisible(entry)) {
            continue;
          }

          const rect = getRect(entry);

          if (rect.height >= pageHeight - 8) {
            if (allowSplit(entry)) {
              splitEntries += 1;
              changed = true;
            }
          }
        }

        /*
         * --------------------------------------------------
         * 2. SMALL SECTION PROTECTION
         * --------------------------------------------------
         *
         * Example from your screenshot:
         *
         * LANGUAGES
         * English / French on page 1
         * German / Spanish on page 2
         *
         * If the entire Languages section fits on one page,
         * move the complete section to page 2 instead.
         */
        const sections = Array.from(
          document.querySelectorAll('[data-resume-section]'),
        );

        for (const section of sections) {
          if (!isVisible(section)) {
            continue;
          }

          if (section.classList.contains('resume-page-break-before')) {
            continue;
          }

          const rect = getRect(section);

          const smallEnough =
            rect.height <= pageHeight * SMALL_SECTION_MAX_RATIO;

          if (smallEnough && crossesPage(rect) && !isAtPageStart(rect.top)) {
            if (forceBreakBefore(section, 'section')) {
              movedSections += 1;
              changed = true;
            }

            continue;
          }

          /*
           * ------------------------------------------------
           * 3. ORPHAN HEADING PROTECTION
           * ------------------------------------------------
           *
           * Prevent:
           *
           * EXPERIENCE
           * ---------------------
           *             PAGE END
           *
           * Company starts next page.
           */
          const heading = section.querySelector('[data-resume-section-title]');

          const firstEntry = section.querySelector('[data-resume-entry]');

          if (
            !heading ||
            !firstEntry ||
            !isVisible(heading) ||
            !isVisible(firstEntry)
          ) {
            continue;
          }

          const headingRect = getRect(heading);
          const firstEntryRect = getRect(firstEntry);

          const headingAndFirstEntry = {
            top: headingRect.top,
            bottom: firstEntryRect.bottom,
            height: firstEntryRect.bottom - headingRect.top,
          };

          /*
           * Only move the section start when the heading +
           * first entry can reasonably fit on one page.
           */
          if (
            headingAndFirstEntry.height < pageHeight * 0.5 &&
            crossesPage(headingAndFirstEntry) &&
            !isAtPageStart(headingAndFirstEntry.top)
          ) {
            if (forceBreakBefore(section, 'section')) {
              movedSections += 1;
              orphanHeadingsFixed += 1;
              changed = true;
            }
          }
        }

        /*
         * --------------------------------------------------
         * 4. ENTRY PROTECTION
         * --------------------------------------------------
         *
         * Normal entries should not be chopped in half.
         *
         * If one starts near the bottom of the page and would
         * cross the boundary, push it to the next page.
         */
        const currentEntries = Array.from(
          document.querySelectorAll('[data-resume-entry]'),
        );

        for (const entry of currentEntries) {
          if (!isVisible(entry)) {
            continue;
          }

          if (entry.classList.contains('resume-allow-split')) {
            continue;
          }

          if (entry.classList.contains('resume-page-break-before')) {
            continue;
          }

          const rect = getRect(entry);

          if (crossesPage(rect) && !isAtPageStart(rect.top)) {
            if (forceBreakBefore(entry, 'entry')) {
              movedEntries += 1;
              changed = true;
            }
          }
        }

        /*
         * Layout is stable.
         */
        if (!changed) {
          break;
        }

        /*
         * Force Chromium to synchronously recalculate layout
         * before the next pass.
         */
        void document.body.offsetHeight;
      }

      return {
        movedSections,
        movedEntries,
        splitEntries,
        orphanHeadingsFixed,
        passes,
      };
    });
  }
}
