// Pure grouping of approved reorder lines into one draft PO per distributor. No DB access.

export const PO_ACTIONS = ["REORDER_NOW", "REORDER_INCREASED"] as const;

export interface EligibleLine {
  recommendationId: number;
  skuId: string;
  skuName: string;
  uom: string;
  distributorId: string;
  finalAction: string;
  finalQty: number;
  wasOverridden: boolean;
}

export interface DraftPo {
  poNumber: string;
  distributorId: string;
  lines: EligibleLine[];
}

/** Only decided reorders with a positive quantity become PO lines; pauses and no-action never do. */
export function isPoLine(l: Pick<EligibleLine, "finalAction" | "finalQty">): boolean {
  return (PO_ACTIONS as readonly string[]).includes(l.finalAction) && l.finalQty > 0;
}

/** PO-20261022-DIST001, then PO-20261022-DIST001-2 if that number is taken (e.g. a later batch). */
export function poNumberFor(runDate: string, distributorId: string, taken: Set<string>): string {
  const base = `PO-${runDate.replace(/-/g, "")}-${distributorId}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function buildDraftPos(lines: EligibleLine[], runDate: string, takenNumbers: Iterable<string>): DraftPo[] {
  const taken = new Set(takenNumbers);
  const byDist = new Map<string, EligibleLine[]>();
  for (const l of lines.filter(isPoLine)) {
    if (!byDist.has(l.distributorId)) byDist.set(l.distributorId, []);
    byDist.get(l.distributorId)!.push(l);
  }
  return [...byDist.keys()].sort().map((distributorId) => {
    const poNumber = poNumberFor(runDate, distributorId, taken);
    taken.add(poNumber);
    return { poNumber, distributorId, lines: byDist.get(distributorId)!.sort((a, b) => a.skuId.localeCompare(b.skuId)) };
  });
}
