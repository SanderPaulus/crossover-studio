/**
 * Turning a user-chosen name (a design tab, a project) into a filename.
 *
 * The exports used to keep only `[\w\- ]`, which quietly deleted anything else
 * — including the dot in a name like "20260731.1", so the file landed as
 * "202607311.adsfilter.json" and two fields ran together. A dot is a perfectly
 * legal filename character; what actually has to go is the handful that break
 * a path or that Windows refuses.
 *
 * Kept: letters (any script), digits, spaces, and . _ - ( ) [ ] + # & , '
 * Dropped: / \ : * ? " < > | and control characters.
 * Also guarded: a leading dot (a hidden file on Unix, and ".." is a directory),
 * and a trailing dot or space (Windows silently strips those, so a round trip
 * would not give back the name the user typed).
 */
export function fileSafeName(name: string, fallback: string): string {
  const cleaned = name
    // Whitespace first, and turned INTO a space: a tab between two words is a
    // word boundary, and deleting it would glue them together — the same
    // mistake as dropping the dot.
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return cleaned || fallback;
}
