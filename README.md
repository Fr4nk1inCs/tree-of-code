# Tree of Code

A browser-only forest of annotated Python code fragments. Nodes are laid out left to right, every card shows the same project-defined static annotation view, and only the selected card mounts a Monaco code editor.

## Develop

The repository uses Nix/direnv and pnpm:

```sh
direnv allow        # or: nix develop
pnpm install
pnpm dev
```

Run checks through the development shell when Node/pnpm are not already on `PATH`:

```sh
nix develop -c pnpm lint
nix develop -c pnpm typecheck
nix develop -c pnpm test
nix develop -c pnpm exec playwright install chromium
nix develop -c pnpm test:e2e
nix develop -c pnpm build
```

## Deployment

The app is deployed to GitHub Pages at <https://tree-of-code.fr4nk1in.top/>. The **Deploy to GitHub Pages** workflow checks and builds every push to `main`, then publishes the static `dist` directory. It can also be run manually from the Actions tab.

## Model and operations

A project is an ordered forest. Every node stores only the code fragment appended to its parent; the application does not reconstruct, execute, compare, or analyze the resulting programs. Each fragment also has its own title, editable directly in the card header. Fragment titles are independent of annotation values, including an annotation property named `title`; an unnamed fragment falls back to its first nonempty code line.

Card and toolbar controls support:

- Add root and add child
- Reorder siblings
- Reparent a subtree or move it to a root (cycles are rejected)
- Split at the active editor cursor: the prefix stays, the suffix becomes a child, and former children move below the suffix
- Delete a subtree after confirmation

The layout is automatic and left to right. Cards cannot be dragged. Inactive cards use Monaco-tokenized previews; only one Monaco editor is mounted. React Flow culls offscreen cards for large projects. Expanded annotations use their natural height, and measured card heights feed back into layout so nested content does not overlap other nodes.

## Color schemes

The toolbar offers Monaco's Light, Dark, High Contrast Light, and High Contrast Dark themes. Monaco edits and tokenized previews use the selected theme directly. MUI, cards, the canvas, edges, controls, and scrollbars derive their colors from Monaco's resolved theme colors rather than a separate palette. The selection is stored as a browser-local UI preference and is not part of the project file.

## Annotation schema

The project has exactly one JSON Schema object. Every node displays static annotations generated from that schema and has independent values. Click **Schema** to edit the schema in Monaco. Use a card's **Edit annotation JSON** action to modify that node's values in a separate Monaco JSON editor; malformed JSON and schema-invalid values are rejected without changing the node.

The supported subset is intentionally small:

- Root `type: "object"` (or omitted), `properties`, `title`, `description`, and boolean `additionalProperties`
- Optional string, number, integer, and boolean properties
- Nested objects with their own `properties` and boolean `additionalProperties`
- Arrays with a single `items` schema, including arrays of objects and nested arrays
- Scalar `enum` values and recursively validated `default` values
- `title` and `description` metadata (descriptions are not repeated on cards)
- `format: "textarea"` for multiline strings, including nested strings

Standalone objects use compact, vertically centered property grids: scalar labels sit on the left and read-only values on the right. Nested objects and arrays have small disclosure rows. Each array of objects is presented as one table, with one centered row per object and one column per property; scalar-array properties such as `turns: [integer]` use inline value groups, with no nested editing controls. Complex object or nested-array properties open in an expandable detail row rather than stacking tables inside individual cells. `required`, `$ref`, tuple-style `items`, and other keywords are rejected. Removing a property removes its values from every node, including removed fields inside nested objects. Changing a property schema preserves values that remain valid and clears incompatible values; an array is cleared if any item becomes incompatible. New nodes receive explicit schema defaults; schema edits do not backfill defaults into existing nodes.

## Save, open, and drafts

**Save** downloads a pretty-printed, versioned `tree-of-code.project.json` file. **Open** validates the complete file, including graph invariants and annotation values, before replacing the current project. Invalid files leave the current project untouched. Replacing a project with unsaved file changes requires confirmation.

One current draft is autosaved to IndexedDB after changes and recovered on reload. There is no backend, account, synchronization, collaboration, trace ingestion, execution, image export, or per-node language/schema selection.

### Project format

The top-level fields are:

- `format: "tree-of-code"`
- `formatVersion: 1`
- `language: "python"`
- `schema`: the shared annotation schema
- `rootIds`: ordered root IDs
- `nodes`: normalized records keyed by node ID, each with `id`, `parentId`, ordered `childIds`, `title`, `fragment`, and `annotations`

Canvas positions and transient UI state are not serialized because layout is derived automatically.

## Implementation

Vite, React, and TypeScript; MUI for UI primitives; React Flow and Dagre for the canvas/layout; Monaco for code editing, JSON editing, and previews; Ajv for schema and annotation validation; Zustand for state; idb-keyval for draft persistence. Pure tree, schema, and project-file logic lives in `src/model` with unit tests.
