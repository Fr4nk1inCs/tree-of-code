import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../model/project';
import { addChild, addRoot } from '../../model/tree';
import { CARD_WIDTH, getCardMetrics, layoutForest } from './layout';

describe('forest layout', () => {
  it('lays parents left of children and sizes every card', () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    project = addChild(project, 'root', 'child');
    project = addRoot(project, 'second-root');
    project.nodes.root.fragment = 'one\ntwo\nthree';

    const { nodes, edges } = layoutForest(project, {});
    const root = nodes.find((node) => node.id === 'root');
    const child = nodes.find((node) => node.id === 'child');
    const secondRoot = nodes.find((node) => node.id === 'second-root');

    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(1);
    expect(child!.position.x).toBeGreaterThan(root!.position.x);
    expect(secondRoot!.position.x).toBe(root!.position.x);
    expect(root!.style).toMatchObject({ width: CARD_WIDTH });
  });

  it('uses deterministic dimensions that shrink when annotations collapse', () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    const node = project.nodes.root;
    const expanded = getCardMetrics(project, node, false);
    const collapsed = getCardMetrics(project, node, true);

    expect(collapsed.annotationHeight).toBe(0);
    expect(collapsed.height).toBeLessThan(expanded.height);
    expect(layoutForest(project, { root: true }).nodes[0].style).toMatchObject({
      height: collapsed.height,
    });
    expect(getCardMetrics(project, node, false, 240).annotationHeight).toBe(240);
    expect(layoutForest(project, {}, { root: 240 }).nodes[0].style).toMatchObject({
      height: getCardMetrics(project, node, false, 240).height,
    });
  });

  it('places newly appended children below existing siblings', () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    project = addChild(project, 'root', 'first');
    project = addChild(project, 'root', 'second');
    project = addChild(project, 'root', 'new-child');

    const { nodes } = layoutForest(project, {});
    const y = (id: string) => nodes.find((node) => node.id === id)!.position.y;
    expect(y('new-child')).toBeGreaterThan(y('second'));
    expect(y('second')).toBeGreaterThan(y('first'));
  });

  it('keeps nested sibling subtrees collision-free after preserving their order', () => {
    let project = createEmptyProject();
    project = addRoot(project, 'root');
    project = addChild(project, 'root', 'emul');
    project = addChild(project, 'root', 'ctx');
    project = addChild(project, 'emul', 'turn14');
    project = addChild(project, 'turn14', 'turn15');
    project = addChild(project, 'turn15', 'turn16');
    project = addChild(project, 'ctx', 'insert');
    project = addChild(project, 'ctx', 'dbg1');
    project = addChild(project, 'insert', 'common');
    project = addChild(project, 'insert', 'test');
    project = addChild(project, 'common', 'diag');
    project = addChild(project, 'common', 'diag2');
    project = addChild(project, 'diag2', 'diag2fix');
    project = addChild(project, 'diag2fix', 'diag2fix2');
    project = addChild(project, 'dbg1', 'dbggone');
    for (const node of Object.values(project.nodes)) {
      node.fragment = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    }
    project.nodes.ctx.fragment = Array.from({ length: 6 }, (_, index) => `line ${index}`).join('\n');
    project.nodes.insert.fragment = 'one line';
    project.nodes.test.fragment = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n');

    const { nodes } = layoutForest(project, {});
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left];
        const b = nodes[right];
        if (a.position.x !== b.position.x) continue;
        const aHeight = Number(a.style?.height ?? 0);
        const bHeight = Number(b.style?.height ?? 0);
        const overlaps = a.position.y < b.position.y + bHeight
          && b.position.y < a.position.y + aHeight;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});
