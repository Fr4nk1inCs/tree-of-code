import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../model/project';
import { addRoot } from '../../model/tree';
import { useProjectStore } from '../../state/projectStore';
import { AnnotationJsonDialog } from './AnnotationJsonDialog';

vi.mock('../code/JsonEditor', () => ({
  JsonEditor: ({ label, value, onChange }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe('AnnotationJsonDialog', () => {
  beforeEach(() => {
    let project = createEmptyProject();
    project = addRoot(project, 'a');
    project.schema = {
      type: 'object',
      properties: { count: { type: 'integer' } },
      additionalProperties: false,
    };
    project.nodes.a.annotations = { count: 1 };
    useProjectStore.setState({ project });
  });

  it('applies valid JSON to only the edited node', () => {
    const onClose = vi.fn();
    render(<AnnotationJsonDialog nodeId="a" open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Annotation JSON'), {
      target: { value: '{ "count": 2 }' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply annotations' }));

    expect(useProjectStore.getState().project.nodes.a.annotations).toEqual({ count: 2 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rejects malformed JSON and invalid values without changing annotations', () => {
    const onClose = vi.fn();
    render(<AnnotationJsonDialog nodeId="a" open onClose={onClose} />);
    const editor = screen.getByLabelText('Annotation JSON');

    fireEvent.change(editor, { target: { value: '{bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply annotations' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(useProjectStore.getState().project.nodes.a.annotations).toEqual({ count: 1 });

    fireEvent.change(editor, { target: { value: '{ "count": "wrong" }' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply annotations' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(useProjectStore.getState().project.nodes.a.annotations).toEqual({ count: 1 });
    expect(onClose).not.toHaveBeenCalled();
  });
});
