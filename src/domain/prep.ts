import type { Component, EquipmentId } from "./types";

export interface PrepStep {
  id: string;
  componentId: string | null;
  label: string;
  equipment?: EquipmentId;
  /** Minutos desde el inicio de la sesión. */
  start: number;
  /** Hasta aquí necesita tu atención; después el equipo sigue solo. */
  activeEnd: number;
  end: number;
  batch?: { n: number; of: number };
}

export interface PrepPlan {
  steps: PrepStep[];
  totalMin: number;
  batches: Record<string, number>;
}

interface Node {
  id: string;
  componentId: string | null;
  label: string;
  equipment?: EquipmentId;
  active: number;
  passive: number;
  deps: string[];
  batch?: { n: number; of: number };
  order: number;
}

const PACK_MIN_PER_PORTION = 2;

/** Expande tareas por tanda y resuelve dependencias entre instancias. */
function buildGraph(
  components: Component[],
  portions: Record<string, number>,
): { nodes: Node[]; batches: Record<string, number> } {
  const nodes: Node[] = [];
  const batches: Record<string, number> = {};
  let order = 0;

  for (const c of components) {
    const p = portions[c.id] ?? 0;
    if (p <= 0) continue;
    const n = Math.max(1, Math.ceil(p / c.batchPortions - 1e-9));
    batches[c.id] = n;
    const instances = new Map<string, string[]>();
    for (const t of c.tasks) {
      const count = t.perBatch ? n : 1;
      const ids = Array.from({ length: count }, (_, i) =>
        count > 1 ? `${c.id}:${t.id}#${i + 1}` : `${c.id}:${t.id}`,
      );
      instances.set(t.id, ids);
      ids.forEach((id, i) => {
        const deps = (t.after ?? []).flatMap((dep) => {
          const depIds = instances.get(dep);
          if (!depIds)
            throw new Error(
              `${c.id}: "${t.id}" depende de "${dep}", que debe declararse antes`,
            );
          // Tanda i de una tarea por tanda depende de la tanda i de otra tarea por tanda.
          return count > 1 && depIds.length === count ? [depIds[i]] : depIds;
        });
        if (i > 0) deps.push(ids[i - 1]);
        nodes.push({
          id,
          componentId: c.id,
          label: t.label,
          equipment: t.equipment,
          active: t.activeMin,
          passive: t.passiveMin ?? 0,
          deps,
          batch: count > 1 ? { n: i + 1, of: count } : undefined,
          order: order++,
        });
      });
    }
  }
  return { nodes, batches };
}

/**
 * Planifica una sesión de meal prep con una sola persona cocinando.
 * Scheduling por lista: la persona hace una tarea activa a la vez; cada equipo
 * atiende una tarea a la vez; las esperas pasivas (arrocera, hervor) liberan a la persona.
 * Prioridad = camino crítico restante, así lo lento (arroz) arranca temprano.
 */
export function planPrep(
  components: Component[],
  portionsByComponent: Record<string, number>,
  totalPortions: number,
): PrepPlan {
  const { nodes, batches } = buildGraph(components, portionsByComponent);
  if (nodes.length === 0) return { steps: [], totalMin: 0, batches };

  nodes.push({
    id: "armado",
    componentId: null,
    label: `Repartir en ${totalPortions} táperes poco profundos y etiquetar`,
    active: Math.max(5, totalPortions * PACK_MIN_PER_PORTION),
    passive: 0,
    deps: nodes.map((n) => n.id),
    order: nodes.length,
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const succ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const n of nodes) for (const d of n.deps) succ.get(d)?.push(n.id);

  const tail = new Map<string, number>();
  const tailOf = (id: string): number => {
    const cached = tail.get(id);
    if (cached !== undefined) return cached;
    const n = byId.get(id) as Node;
    const v =
      n.active + n.passive + Math.max(0, ...(succ.get(id) ?? []).map(tailOf));
    tail.set(id, v);
    return v;
  };

  const done = new Map<string, number>();
  const equipFree = new Map<EquipmentId, number>();
  let cookFree = 0;
  const steps: PrepStep[] = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    let best: { node: Node; start: number } | null = null;
    for (const id of remaining) {
      const n = byId.get(id) as Node;
      if (!n.deps.every((d) => done.has(d))) continue;
      const start = Math.max(
        cookFree,
        n.equipment ? (equipFree.get(n.equipment) ?? 0) : 0,
        ...n.deps.map((d) => done.get(d) as number),
      );
      if (
        !best ||
        start < best.start ||
        (start === best.start && tailOf(n.id) > tailOf(best.node.id)) ||
        (start === best.start &&
          tailOf(n.id) === tailOf(best.node.id) &&
          n.order < best.node.order)
      ) {
        best = { node: n, start };
      }
    }
    if (!best) throw new Error("Dependencias circulares en la sesión de prep");

    const { node, start } = best;
    const activeEnd = start + node.active;
    const end = activeEnd + node.passive;
    cookFree = activeEnd;
    if (node.equipment) equipFree.set(node.equipment, end);
    done.set(node.id, end);
    remaining.delete(node.id);
    steps.push({
      id: node.id,
      componentId: node.componentId,
      label: node.label,
      equipment: node.equipment,
      start,
      activeEnd,
      end,
      batch: node.batch,
    });
  }

  steps.sort((a, b) => a.start - b.start || a.end - b.end);
  return { steps, totalMin: Math.max(...steps.map((s) => s.end)), batches };
}
