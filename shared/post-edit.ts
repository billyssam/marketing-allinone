/** 편집한 본문이 일반 복사와 HTML 주입 모두에 동일하게 반영되게 한다. */
export function plainTextHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return escaped.split(/\r?\n\s*\r?\n/).map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, '<br>')}</p>`).join('');
}
