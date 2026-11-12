/** Legacy worker intentionally retired: it never persisted real draft IDs.
 * The web daily-content workflow owns generation and notification.
 * Do not enable placeholder notifications by supplying provider keys.
 */
export async function dailyBlogDraft(): Promise<void> {
  throw new Error("Legacy daily-blog-draft worker disabled: use the verified web daily-content workflow.");
}
