import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { RJSFSchema } from '@rjsf/utils';
import type { AnnotationValues, Project } from './project';

const ROOT_KEYWORDS = new Set([
  'type',
  'properties',
  'title',
  'description',
  'additionalProperties',
]);
const FIELD_KEYWORDS = new Set([
  'type',
  'title',
  'description',
  'default',
  'enum',
  'format',
  'properties',
  'additionalProperties',
  'items',
]);
const FIELD_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);

type ScalarType = 'string' | 'number' | 'integer' | 'boolean';
type FieldType = ScalarType | 'object' | 'array';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isScalarOfType(value: unknown, type: ScalarType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
  }
}

function inferredScalarType(value: unknown): ScalarType | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value === value ? (typeof value as ScalarType) : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return 'number';
  }
  return undefined;
}

function checkMetadata(
  schema: Record<string, unknown>,
  location: string,
  errors: string[],
): void {
  if (hasOwn(schema, 'title') && typeof schema.title !== 'string') {
    errors.push(`${location} title must be a string.`);
  }
  if (hasOwn(schema, 'description') && typeof schema.description !== 'string') {
    errors.push(`${location} description must be a string.`);
  }
}

function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addFormat('textarea', true);
  return ajv;
}

function checkFieldSchema(
  field: unknown,
  location: string,
  errors: string[],
): void {
  if (!isObject(field)) {
    errors.push(`${location} schema must be an object.`);
    return;
  }

  for (const keyword of Object.keys(field)) {
    if (!FIELD_KEYWORDS.has(keyword)) {
      errors.push(`${location} uses unsupported keyword "${keyword}".`);
    }
  }
  checkMetadata(field, location, errors);

  let type: FieldType | undefined;
  if (hasOwn(field, 'type')) {
    if (typeof field.type !== 'string' || !FIELD_TYPES.has(field.type)) {
      errors.push(
        `${location} type must be one of string, number, integer, boolean, object, or array.`,
      );
    } else {
      type = field.type as FieldType;
    }
  }

  if (hasOwn(field, 'format')) {
    if (field.format !== 'textarea' || (type !== undefined && type !== 'string')) {
      errors.push(`${location} only supports format "textarea" on string properties.`);
    }
  }

  if (hasOwn(field, 'properties') || hasOwn(field, 'additionalProperties')) {
    if (type !== 'object') {
      errors.push(`${location} object fields must declare type "object".`);
    }
    if (hasOwn(field, 'additionalProperties') && typeof field.additionalProperties !== 'boolean') {
      errors.push(`${location} additionalProperties must be a boolean.`);
    }
    if (hasOwn(field, 'properties')) {
      if (!isObject(field.properties)) {
        errors.push(`${location} properties must be an object.`);
      } else {
        for (const [name, property] of Object.entries(field.properties)) {
          checkFieldSchema(property, `${location} property "${name}"`, errors);
        }
      }
    }
  }

  if (hasOwn(field, 'items')) {
    if (type !== 'array') {
      errors.push(`${location} items is only supported on array fields.`);
    }
    checkFieldSchema(field.items, `${location} items`, errors);
  } else if (type === 'array') {
    errors.push(`${location} array fields must declare an items schema.`);
  }

  let enumValues: unknown[] | undefined;
  if (hasOwn(field, 'enum')) {
    if (!Array.isArray(field.enum) || field.enum.length === 0) {
      errors.push(`${location} enum must be a non-empty array of scalar values.`);
    } else {
      enumValues = field.enum;
      const unique = new Set(enumValues);
      if (unique.size !== enumValues.length) {
        errors.push(`${location} enum values must be unique.`);
      }
      for (const value of enumValues) {
        const inferred = inferredScalarType(value);
        if (!inferred || (type !== undefined && (type === 'object' || type === 'array' || !isScalarOfType(value, type)))) {
          errors.push(
            `${location} enum value ${JSON.stringify(value)} does not match ${type ?? 'a scalar type'}.`,
          );
        }
      }
      if (type === undefined && enumValues.length > 0) {
        const kinds = new Set(
          enumValues.map((value) =>
            typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value,
          ),
        );
        if (kinds.has('integer') && kinds.has('number')) {
          kinds.delete('integer');
        }
        if (kinds.size > 1) {
          errors.push(`${location} enum values must have one consistent scalar type.`);
        }
      }
    }
  }

  if (hasOwn(field, 'default')) {
    const value = field.default;
    if (!hasOwn(field, 'type') && inferredScalarType(value) === undefined) {
      errors.push(`${location} default must be a scalar when type is omitted.`);
    } else {
      try {
        const validate = createAjv().compile(field as RJSFSchema);
        const enumMismatch = Boolean(enumValues && !enumValues.includes(value));
        if (enumMismatch) {
          errors.push(`${location} default must be one of its enum values.`);
        } else if (!validate(value)) {
          errors.push(`${location} default does not match its schema.`);
        }
      } catch {
        // Structural and keyword errors are reported above with their exact locations.
      }
    }
  }
}

export function getSchemaValidationErrors(schema: unknown): string[] {
  if (!isObject(schema)) {
    return ['Schema root must be an object.'];
  }

  const errors: string[] = [];
  for (const keyword of Object.keys(schema)) {
    if (!ROOT_KEYWORDS.has(keyword)) {
      errors.push(`Schema root uses unsupported keyword "${keyword}".`);
    }
  }
  if (hasOwn(schema, 'type') && schema.type !== 'object') {
    errors.push('Schema root type must be "object".');
  }
  checkMetadata(schema, 'Schema root', errors);
  if (
    hasOwn(schema, 'additionalProperties') &&
    typeof schema.additionalProperties !== 'boolean'
  ) {
    errors.push('Schema root additionalProperties must be a boolean.');
  }
  if (hasOwn(schema, 'properties')) {
    if (!isObject(schema.properties)) {
      errors.push('Schema root properties must be an object.');
    } else {
      for (const [name, property] of Object.entries(schema.properties)) {
        checkFieldSchema(property, `Property "${name}"`, errors);
      }
    }
  }
  return errors;
}

export function assertSupportedSchema(
  schema: unknown,
): asserts schema is RJSFSchema {
  const errors = getSchemaValidationErrors(schema);
  if (errors.length > 0) {
    throw new Error(`Unsupported annotation schema:\n- ${errors.join('\n- ')}`);
  }
}

export function parseSchemaInput(text: string): RJSFSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Invalid schema JSON.${detail}`);
  }
  assertSupportedSchema(parsed);
  return structuredClone(parsed);
}

export function createAnnotationDefaults(schema: RJSFSchema): AnnotationValues {
  assertSupportedSchema(schema);
  const defaults: AnnotationValues = {};
  const properties = isObject(schema.properties) ? schema.properties : {};
  for (const [name, property] of Object.entries(properties)) {
    if (isObject(property) && hasOwn(property, 'default')) {
      defaults[name] = structuredClone(property.default);
    }
  }
  return defaults;
}

function effectiveObjectSchema(schema: RJSFSchema): RJSFSchema {
  return { ...schema, type: 'object' };
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map(
    (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}.`,
  );
}

function untypedFieldErrors(
  schema: RJSFSchema,
  value: unknown,
  path: string,
): string[] {
  if (value === undefined) return [];
  if (!hasOwn(schema, 'type')) {
    return inferredScalarType(value) === undefined ? [`${path} must be a scalar value.`] : [];
  }
  if (schema.type === 'object' && isObject(value) && isObject(schema.properties)) {
    return Object.entries(schema.properties).flatMap(([name, property]) =>
      isObject(property)
        ? untypedFieldErrors(property as RJSFSchema, value[name], `${path}/${name}`)
        : [],
    );
  }
  if (schema.type === 'array' && Array.isArray(value) && isObject(schema.items)) {
    return value.flatMap((item, index) =>
      untypedFieldErrors(schema.items as RJSFSchema, item, `${path}/${index}`),
    );
  }
  return [];
}

export function validateAnnotationValues(
  schema: RJSFSchema,
  values: unknown,
): string[] {
  assertSupportedSchema(schema);
  const ajv = createAjv();
  const validate = ajv.compile(effectiveObjectSchema(schema));
  validate(values);
  const untypedErrors = isObject(values) && isObject(schema.properties)
    ? Object.entries(schema.properties).flatMap(([name, property]) =>
        isObject(property) && hasOwn(values, name)
          ? untypedFieldErrors(property as RJSFSchema, values[name], `/${name}`)
          : [],
      )
    : [];
  return [...formatAjvErrors(validate.errors), ...untypedErrors];
}

interface SanitizedValue {
  valid: boolean;
  value?: unknown;
}

function sanitizeFieldValue(
  schema: RJSFSchema,
  value: unknown,
  validatorFor: (schema: RJSFSchema) => ValidateFunction,
): SanitizedValue {
  if (!hasOwn(schema, 'type') && inferredScalarType(value) === undefined) {
    return { valid: false };
  }

  let candidate = value;
  if (schema.type === 'object') {
    if (!isObject(value)) return { valid: false };
    const properties = isObject(schema.properties) ? schema.properties : {};
    const objectValue: Record<string, unknown> = {};
    for (const [name, childValue] of Object.entries(value)) {
      const property = properties[name];
      if (isObject(property)) {
        const sanitized = sanitizeFieldValue(property as RJSFSchema, childValue, validatorFor);
        if (!sanitized.valid) return { valid: false };
        objectValue[name] = sanitized.value;
      } else if (schema.additionalProperties === true) {
        objectValue[name] = childValue;
      }
    }
    candidate = objectValue;
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || !isObject(schema.items)) return { valid: false };
    const arrayValue: unknown[] = [];
    for (const item of value) {
      const sanitized = sanitizeFieldValue(schema.items as RJSFSchema, item, validatorFor);
      if (!sanitized.valid) return { valid: false };
      arrayValue.push(sanitized.value);
    }
    candidate = arrayValue;
  }

  return validatorFor(schema)(candidate)
    ? { valid: true, value: candidate }
    : { valid: false };
}

export function applySchema(project: Project, nextSchema: RJSFSchema): Project {
  assertSupportedSchema(nextSchema);
  const properties = isObject(nextSchema.properties) ? nextSchema.properties : {};
  const ajv = createAjv();
  const validators = new WeakMap<RJSFSchema, ValidateFunction>();
  const validatorFor = (schema: RJSFSchema): ValidateFunction => {
    const existing = validators.get(schema);
    if (existing) return existing;
    const validator = ajv.compile(schema);
    validators.set(schema, validator);
    return validator;
  };

  const nodes = Object.fromEntries(
    Object.entries(project.nodes).map(([id, node]) => {
      const annotations: AnnotationValues = {};
      for (const [name, value] of Object.entries(node.annotations)) {
        const property = properties[name];
        if (isObject(property)) {
          const sanitized = sanitizeFieldValue(property as RJSFSchema, value, validatorFor);
          if (sanitized.valid) annotations[name] = sanitized.value;
        }
      }
      return [id, { ...node, annotations }];
    }),
  );

  return { ...project, schema: structuredClone(nextSchema), nodes };
}
