import type { RJSFSchema } from '@rjsf/utils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../model/project';
import { addRoot } from '../../model/tree';
import { useProjectStore } from '../../state/projectStore';
import { AnnotationView } from './AnnotationView';

function setSchema(schema: RJSFSchema) {
  useProjectStore.setState((state) => ({ project: { ...state.project, schema } }));
}

function setAnnotations(nodeId: string, annotations: Record<string, unknown>) {
  useProjectStore.setState((state) => ({
    project: {
      ...state.project,
      nodes: {
        ...state.project.nodes,
        [nodeId]: { ...state.project.nodes[nodeId], annotations },
      },
    },
  }));
}

describe('AnnotationView', () => {
  beforeEach(() => {
    let project = createEmptyProject();
    project = addRoot(project, 'a');
    project = addRoot(project, 'b');
    useProjectStore.setState({ project });
  });

  it('shows independent static values for the same shared schema', () => {
    setAnnotations('a', { title: 'First root' });
    setAnnotations('b', { title: 'Second root' });
    render(<><AnnotationView nodeId="a" /><AnnotationView nodeId="b" /></>);

    expect(screen.getByText('First root')).toBeVisible();
    expect(screen.getByText('Second root')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uses a centered property grid for conventional objects', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        title: { type: 'string', title: 'Title' },
        reviewed: { type: 'boolean', title: 'Reviewed' },
      },
      additionalProperties: false,
    };
    setSchema(schema);
    setAnnotations('a', { title: 'Fragment A', reviewed: true });
    render(<AnnotationView nodeId="a" />);

    const fields = screen.getByRole('table', { name: 'Annotations fields' });
    const titleRow = within(fields).getByRole('rowheader', { name: 'Title' }).closest('tr')!;
    expect(titleRow).toHaveTextContent('Fragment A');
    expect(within(fields).getByRole('rowheader', { name: 'Reviewed' })).toBeVisible();
  });

  it('keeps nested objects and scalar arrays in disclosure sections', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        details: {
          type: 'object',
          title: 'Details',
          description: 'This description should not be rendered.',
          properties: { note: { type: 'string', title: 'Note' } },
          additionalProperties: false,
        },
        tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
      },
      additionalProperties: false,
    };
    setSchema(schema);
    setAnnotations('a', { details: { note: 'Nested note' }, tags: ['python', 'tree'] });
    render(<AnnotationView nodeId="a" />);

    expect(screen.queryByText('This description should not be rendered.')).not.toBeInTheDocument();
    expect(screen.getByText('Nested note')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Details' }));
    expect(screen.queryByText('Nested note')).not.toBeInTheDocument();
    expect(screen.getByText('python')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Tags' }));
    expect(screen.queryByText('python')).not.toBeInTheDocument();
  });

  it('renders one centered object table with property columns and inline scalar arrays', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        usage: {
          type: 'array',
          title: 'usage',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', title: 'file' },
              turns: { type: 'array', title: 'turns', items: { type: 'integer' } },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    };
    setSchema(schema);
    setAnnotations('a', { usage: [{ file: 'a.py', turns: [1, 2] }, { file: 'b.py', turns: [3] }] });
    render(<AnnotationView nodeId="a" />);

    const table = screen.getByRole('table', { name: 'usage table' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole('columnheader', { name: 'file' })).toBeVisible();
    expect(within(rows[0]).getByRole('columnheader', { name: 'turns' })).toBeVisible();
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('a.py');
    expect(within(rows[1]).getByLabelText('turns values')).toHaveTextContent('12');
    expect(rows[1].querySelector('td')).toHaveStyle('vertical-align: middle');
    expect(screen.queryByRole('button', { name: /Add .* item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens complex object properties in a static detail row', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        usage: {
          type: 'array',
          title: 'usage',
          items: {
            type: 'object',
            properties: {
              details: {
                type: 'object',
                title: 'details',
                properties: { note: { type: 'string', title: 'Note' } },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    };
    setSchema(schema);
    setAnnotations('a', { usage: [{ details: { note: 'Nested detail' } }] });
    render(<AnnotationView nodeId="a" />);

    expect(screen.queryByText('Nested detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand details item 1' }));
    expect(screen.getByText('Nested detail')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse details item 1' }));
    expect(screen.queryByText('Nested detail')).not.toBeInTheDocument();
  });
});
