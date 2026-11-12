import sanitizeHtml from 'sanitize-html';

/** Parse HTML with a strict allowlist; never trust generated attributes or URLs. */
export function safeDraftHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http'],
    allowProtocolRelative: false,
  });
}
