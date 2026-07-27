const ITALIAN_INTERNAL_ACCENT_REPLACEMENTS: Readonly<Record<string, string>> = {
  à: 'a',
  á: 'a',
  è: 'e',
  é: 'e',
  ì: 'i',
  í: 'i',
  ò: 'o',
  ó: 'o',
  ù: 'u',
  ú: 'u',

  À: 'A',
  Á: 'A',
  È: 'E',
  É: 'E',
  Ì: 'I',
  Í: 'I',
  Ò: 'O',
  Ó: 'O',
  Ù: 'U',
  Ú: 'U',
};

/**
 * Removes artificial stress marks inside Italian words.
 *
 * Examples:
 * abbandóno -> abbandono
 * pàrlo     -> parlo
 *
 * Valid final accents remain:
 * perché -> perché
 * andrò  -> andrò
 * può    -> può
 */
export function normalizeItalianConjugation(value: string): string {
  const normalized = value.normalize('NFC').replace(/\s+/g, ' ').trim();

  return normalized.replace(
    /[A-Za-zÀÁÈÉÌÍÒÓÙÚàáèéìíòóùú]+/gu,
    (word: string) => {
      const characters = Array.from(word);

      if (characters.length <= 1) {
        return word;
      }

      // Do not modify the final character because final Italian accents
      // can be grammatically correct.
      for (let index = 0; index < characters.length - 1; index += 1) {
        characters[index] =
          ITALIAN_INTERNAL_ACCENT_REPLACEMENTS[characters[index]] ??
          characters[index];
      }

      return characters.join('');
    },
  );
}

/**
 * Creates exactly what Flutter TTS should pronounce.
 *
 * Example:
 * pronoun: "io"
 * conjugation: "abbandóno"
 * result: "io abbandono"
 */
export function buildItalianConjugationTtsText(
  pronoun: string | null | undefined,
  conjugatedText: string,
): string {
  const normalizedPronoun = pronoun?.trim() ?? '';
  const normalizedConjugation = normalizeItalianConjugation(conjugatedText);

  return [normalizedPronoun, normalizedConjugation]
    .filter((part) => part.length > 0)
    .join(' ');
}
