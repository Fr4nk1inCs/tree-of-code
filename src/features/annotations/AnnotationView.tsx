import type { RJSFSchema } from '@rjsf/utils';
import { PlayArrow } from '@mui/icons-material';
import {
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';

interface AnnotationViewProps {
  nodeId: string;
}

interface ValueViewProps {
  schema: RJSFSchema;
  title: string;
  value: unknown;
}

function isSchema(value: unknown): value is RJSFSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayItemSchema(schema: RJSFSchema): RJSFSchema | undefined {
  return schema.type === 'array' && isSchema(schema.items) ? schema.items : undefined;
}

function isScalarArray(schema: RJSFSchema): boolean {
  const items = arrayItemSchema(schema);
  return Boolean(items && items.type !== 'object' && items.type !== 'array');
}

function isComplexProperty(schema: RJSFSchema): boolean {
  return schema.type === 'object' || (schema.type === 'array' && !isScalarArray(schema));
}

function propertySchema(schema: RJSFSchema, name: string): RJSFSchema {
  const property = schema.properties?.[name];
  return isSchema(property) ? property : {};
}

function propertyLabel(schema: RJSFSchema, name: string): string {
  return propertySchema(schema, name).title || name;
}

function objectProperties(schema: RJSFSchema, value: unknown): Array<{
  name: string;
  schema: RJSFSchema;
  value: unknown;
}> {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const names = Object.keys(schema.properties ?? {});
  if (schema.additionalProperties === true) {
    for (const name of Object.keys(record)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.map((name) => ({
    name,
    schema: propertySchema(schema, name),
    value: record[name],
  }));
}

function ScalarValue({ value }: { value: unknown }) {
  const missing = value === undefined || value === null || value === '';
  const text = missing
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return (
    <Typography
      component="span"
      color={missing ? 'text.secondary' : 'text.primary'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 20,
        fontSize: 12,
        lineHeight: '20px',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
    >
      {text}
    </Typography>
  );
}

function ScalarArrayValues({ values, title }: { values: unknown; title: string }) {
  const items = Array.isArray(values) ? values : [];
  if (items.length === 0) return <ScalarValue value={undefined} />;
  return (
    <Box
      component="span"
      className="annotation-scalar-array"
      aria-label={`${title} values`}
      sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0.5 }}
    >
      {items.map((item, index) => (
        <Box
          component="span"
          key={index}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 20,
            px: 0.5,
            borderRadius: 0.5,
            bgcolor: 'action.hover',
          }}
        >
          <ScalarValue value={item} />
        </Box>
      ))}
    </Box>
  );
}

function DisclosureHeader({
  expanded,
  label,
  onToggle,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <IconButton
        size="small"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        onClick={onToggle}
        sx={{ p: 0.125, ml: -0.125 }}
      >
        <PlayArrow
          sx={{
            fontSize: 10,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms',
          }}
        />
      </IconButton>
      <Typography
        variant="body2"
        onClick={onToggle}
        sx={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, userSelect: 'none' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function ObjectDetailProperty({
  name,
  schema,
  value,
}: {
  name: string;
  schema: RJSFSchema;
  value: unknown;
}) {
  const [expanded, setExpanded] = useState(true);
  const label = propertyLabel(schema, name);
  return (
    <>
      <TableRow>
        <TableCell colSpan={2} sx={{ px: 0 }}>
          <DisclosureHeader
            expanded={expanded}
            label={label}
            onToggle={() => setExpanded((current) => !current)}
          />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={2} sx={{ pl: 1.5, pr: 0 }}>
            <ValueView schema={propertySchema(schema, name)} title={label} value={value} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ObjectFields({ schema, title, value }: ValueViewProps) {
  const properties = objectProperties(schema, value);
  if (properties.length === 0) {
    return <Typography variant="caption" color="text.secondary">No fields</Typography>;
  }
  return (
    <Table
      size="small"
      aria-label={`${title} fields`}
      sx={{
        width: '100%',
        tableLayout: 'fixed',
        '& .MuiTableCell-root': {
          px: 0.5,
          py: 0.25,
          fontSize: 12,
          lineHeight: '20px',
          verticalAlign: 'middle',
        },
        '& .MuiTableRow-root:last-child > .MuiTableCell-root': { borderBottom: 0 },
      }}
    >
      <TableBody>
        {properties.map((property) => {
          if (property.schema.type === 'object' || property.schema.type === 'array') {
            return (
              <ObjectDetailProperty
                key={property.name}
                name={property.name}
                schema={schema}
                value={property.value}
              />
            );
          }
          return (
            <TableRow key={property.name}>
              <TableCell
                component="th"
                scope="row"
                sx={{ width: '28%', color: 'text.secondary', fontWeight: 500, overflowWrap: 'anywhere' }}
              >
                {propertyLabel(schema, property.name)}
              </TableCell>
              <TableCell>
                {isScalarArray(property.schema)
                  ? <ScalarArrayValues values={property.value} title={propertyLabel(schema, property.name)} />
                  : <ScalarValue value={property.value} />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const arrayTableSx = {
  width: '100%',
  tableLayout: 'fixed',
  border: '1px solid',
  borderSpacing: 0,
  borderColor: 'divider',
  borderRadius: 1,
  overflow: 'hidden',
  '& .MuiTableCell-root': {
    px: 0.75,
    py: 0.375,
    fontSize: 12,
    lineHeight: '20px',
    verticalAlign: 'middle',
  },
  '& .MuiTableHead-root .MuiTableCell-root': { bgcolor: 'action.hover', fontWeight: 600 },
} as const;

function arrayColumnNames(schema: RJSFSchema, items: unknown[]): string[] {
  const names = Object.keys(schema.properties ?? {});
  if (schema.additionalProperties === true) {
    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      for (const name of Object.keys(item)) {
        if (!names.includes(name)) names.push(name);
      }
    }
  }
  return names;
}

function ArrayObjectRow({
  schema,
  value,
  index,
  names,
}: {
  schema: RJSFSchema;
  value: unknown;
  index: number;
  names: string[];
}) {
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const record = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const expanded = names.find((name) => name === expandedProperty);
  return (
    <>
      <TableRow hover>
        <TableCell component="th" scope="row" sx={{ width: 30, color: 'text.secondary' }}>
          {index + 1}
        </TableCell>
        {names.map((name) => {
          const fieldSchema = propertySchema(schema, name);
          const label = propertyLabel(schema, name);
          const isExpanded = expandedProperty === name;
          return (
            <TableCell key={name}>
              {isComplexProperty(fieldSchema) ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                  <IconButton
                    size="small"
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} item ${index + 1}`}
                    onClick={() => setExpandedProperty(isExpanded ? null : name)}
                    sx={{ p: 0.125 }}
                  >
                    <PlayArrow sx={{ fontSize: 10, transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
                  </IconButton>
                  <Typography variant="caption" color="text.secondary">Details</Typography>
                </Box>
              ) : isScalarArray(fieldSchema) ? (
                <ScalarArrayValues values={record[name]} title={label} />
              ) : <ScalarValue value={record[name]} />}
            </TableCell>
          );
        })}
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={names.length + 1} sx={{ bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              {propertyLabel(schema, expanded)} · item {index + 1}
            </Typography>
            <ValueView
              schema={propertySchema(schema, expanded)}
              title={propertyLabel(schema, expanded)}
              value={record[expanded]}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ArrayObjectsTable({ schema, title, value }: ValueViewProps) {
  const items = Array.isArray(value) ? value : [];
  const names = arrayColumnNames(schema, items);
  return (
    <Table size="small" aria-label={`${title} table`} sx={arrayTableSx}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 30 }}>#</TableCell>
          {names.map((name) => <TableCell key={name}>{propertyLabel(schema, name)}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {items.length === 0 ? (
          <TableRow><TableCell colSpan={names.length + 1}><ScalarValue value={undefined} /></TableCell></TableRow>
        ) : items.map((item, index) => (
          <ArrayObjectRow key={index} schema={schema} value={item} index={index} names={names} />
        ))}
      </TableBody>
    </Table>
  );
}

function ArrayValue({ schema, title, value }: ValueViewProps) {
  const itemSchema = arrayItemSchema(schema) ?? {};
  if (itemSchema.type === 'object') {
    return <ArrayObjectsTable schema={itemSchema} title={title} value={value} />;
  }
  if (isScalarArray(schema)) return <ScalarArrayValues values={value} title={title} />;
  const items = Array.isArray(value) ? value : [];
  if (items.length === 0) return <ScalarValue value={undefined} />;
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      {items.map((item, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 16, lineHeight: '20px' }}>
            {index + 1}.
          </Typography>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <ValueView schema={itemSchema} title={`${title} ${index + 1}`} value={item} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ValueView(props: ValueViewProps) {
  if (props.schema.type === 'object') return <ObjectFields {...props} />;
  if (props.schema.type === 'array') return <ArrayValue {...props} />;
  return <ScalarValue value={props.value} />;
}

export function AnnotationView({ nodeId }: AnnotationViewProps) {
  const schema = useProjectStore((state) => state.project.schema);
  const value = useProjectStore((state) => state.project.nodes[nodeId]?.annotations ?? {});
  return <ObjectFields schema={schema} title="Annotations" value={value} />;
}
