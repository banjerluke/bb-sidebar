import type { ServerContext, ServerHandlers } from "./server-context";
import { SECTION_ORDER_CHANNEL } from "./contract";

/**
 * Sections themselves are bb core state. The sidebar owns only the order its
 * section headers are drawn in, and moving a thread together with its tree.
 */
export function createServerSections(ctx: ServerContext) {
  const readSectionOrder = (): string[] =>
    (
      ctx.db.prepare(`SELECT section_id FROM section_order ORDER BY sort_index ASC, section_id ASC`).all() as Array<{
        section_id: string;
      }>
    ).map((row) => row.section_id);

  const replaceSectionOrder = ctx.db.transaction((sectionIds: string[]) => {
    ctx.db.prepare(`DELETE FROM section_order`).run();
    const insert = ctx.db.prepare(`INSERT INTO section_order (section_id, sort_index) VALUES (?, ?)`);
    sectionIds.forEach((sectionId, index) => insert.run(sectionId, index));
  });

  const listChildren = async (parentThreadId: string) => {
    const children: Awaited<ReturnType<typeof ctx.bb.sdk.threads.list>> = [];
    const limit = 100;
    // Archived children follow too, so restoring one returns it beside its parent.
    for (const archived of [false, true]) {
      for (let offset = 0; ; offset += limit) {
        const page = await ctx.bb.sdk.threads.list({ parentThreadId, archived, includeHidden: true, limit, offset });
        children.push(...page.filter((thread) => thread.deletedAt === null));
        if (page.length < limit) break;
      }
    }
    return children;
  };

  const handlers = {
    async listSectionOrder() {
      return { sectionIds: readSectionOrder() };
    },
    async reorderSections({ sectionIds }) {
      replaceSectionOrder(sectionIds);
      ctx.bb.realtime.publish(SECTION_ORDER_CHANNEL, {});
      return { sectionIds: readSectionOrder() };
    },
    async moveThreadToSection({ threadId, sectionId }) {
      const root = await ctx.bb.sdk.threads.get({ threadId });
      const tree: Array<{ id: string; sectionId: string | null }> = [root];
      const seen = new Set([root.id]);
      for (let index = 0; index < tree.length; index += 1) {
        for (const child of await listChildren(tree[index]!.id)) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          tree.push(child);
        }
      }
      const movedThreadIds: string[] = [];
      for (const thread of tree) {
        if (thread.sectionId === sectionId) continue;
        await ctx.bb.sdk.threads.update({ threadId: thread.id, sectionId });
        movedThreadIds.push(thread.id);
      }
      return { movedThreadIds };
    },
  } satisfies Pick<ServerHandlers, "listSectionOrder" | "reorderSections" | "moveThreadToSection">;

  return { handlers };
}
