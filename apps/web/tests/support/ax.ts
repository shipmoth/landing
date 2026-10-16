/**
 * What Chromium actually exposes to assistive tech, read from its accessibility tree (CDP).
 *
 * Playwright's `ariaSnapshot()` is a convenient approximation but it does not model two things these
 * specs care about: the children of `role="img"` are presentational (not exposed), and CSS `content`
 * alternative text (`content: "## " / ""`) replaces the generated text. Chromium's own tree does the
 * second. For the first, the raw CDP tree still lists an image's text nodes (the platform APIs prune
 * them), so exposedNodes() drops everything below an image itself.
 */
import type { Page } from '@playwright/test';

export interface AxEntry {
  role: string;
  name: string;
}

interface CdpAxNode {
  nodeId: string;
  parentId?: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
}

/** every node assistive tech can reach (not ignored), in document order, with its role and name */
export async function exposedNodes(page: Page): Promise<AxEntry[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: CdpAxNode[] };
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const insideImage = (n: CdpAxNode): boolean => {
      for (let p = byId.get(n.parentId ?? ''); p; p = byId.get(p.parentId ?? '')) {
        if (p.role?.value === 'image' && !p.ignored) return true;
      }
      return false;
    };
    return nodes
      .filter((n) => !n.ignored && !insideImage(n))
      .map((n) => ({ role: String(n.role?.value ?? ''), name: String(n.name?.value ?? '') }))
      .filter((n) => n.name.length > 0);
  } finally {
    await cdp.detach();
  }
}

/** the exposed tree as one `role "name"` line per node, for regex checks and readable failures */
export async function exposedText(page: Page): Promise<string> {
  return (await exposedNodes(page)).map((n) => `${n.role} "${n.name}"`).join('\n');
}
