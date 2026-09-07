import { z } from "zod";

export interface SchemaValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Checks if a given object is a Zod schema
 */
export function isZodSchema(schema: any): schema is z.ZodType<any> {
  return (
    schema !== null &&
    typeof schema === "object" &&
    typeof schema.safeParse === "function" &&
    "_def" in schema
  );
}

/**
 * Converts a Zod schema or JSON Schema definition into an MCP-compliant JSON Schema object
 */
export function normalizeToJsonSchema(
  schema?: z.ZodType<any> | Record<string, any>
): Record<string, any> {
  if (!schema) {
    return { type: "object", properties: {} };
  }

  if (isZodSchema(schema)) {
    return zodToJsonSchemaShallow(schema);
  }

  return schema;
}

/**
 * Lightweight shallow converter for Zod Object schemas to standard JSON Schema
 */
function zodToJsonSchemaShallow(zodSchema: z.ZodType<any>): Record<string, any> {
  // If it's a ZodObject, inspect its shape
  if ("shape" in zodSchema && typeof (zodSchema as any).shape === "object") {
    const shape = (zodSchema as any).shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, propSchema] of Object.entries(shape) as [string, any][]) {
      const typeName = propSchema._def.typeName;
      const isOptional = typeName === "ZodOptional" || typeName === "ZodDefault";
      const unwrapped = isOptional ? propSchema._def.innerType : propSchema;

      properties[key] = {
        type: mapZodTypeToJsonSchemaType(unwrapped._def.typeName),
        description: propSchema.description,
      };

      if (!isOptional) {
        required.push(key);
      }
    }

    const result: Record<string, any> = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      result.required = required;
    }

    return result;
  }

  return { type: "object", properties: {} };
}

function mapZodTypeToJsonSchemaType(typeName: string): string {
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
      return "object";
    default:
      return "string";
  }
}

/**
 * Validates tool arguments against either a Zod schema or a JSON Schema definition.
 * Mirrors Anthropic's validateToolInput() in @modelcontextprotocol/sdk.
 */
export function validateToolArguments(
  schema: z.ZodType<any> | Record<string, any> | undefined,
  args: any = {},
  toolName: string
): SchemaValidationResult {
  if (!schema) {
    return { success: true, data: args };
  }

  // 1. Zod Schema Validation
  if (isZodSchema(schema)) {
    const parseResult = schema.safeParse(args || {});
    if (!parseResult.success) {
      const formattedErrors = parseResult.error.errors
        .map((e) => `${e.path.join(".") || "value"}: ${e.message}`)
        .join("; ");
      return {
        success: false,
        error: `Input validation error for tool '${toolName}': ${formattedErrors}`,
      };
    }
    return { success: true, data: parseResult.data };
  }

  // 2. Standard JSON Schema Validation
  const jsonSchema = schema;
  const input = args || {};

  // Check required fields
  if (Array.isArray(jsonSchema.required)) {
    for (const requiredField of jsonSchema.required) {
      if (input[requiredField] === undefined || input[requiredField] === null || input[requiredField] === "") {
        return {
          success: false,
          error: `Missing required parameter '${requiredField}' for tool '${toolName}'.`,
        };
      }
    }
  }

  // Check property types
  if (jsonSchema.properties && typeof jsonSchema.properties === "object") {
    for (const [key, val] of Object.entries(input)) {
      const propDef = jsonSchema.properties[key];
      if (propDef && propDef.type) {
        const expectedType = propDef.type;
        const actualType = typeof val;

        if (expectedType === "number" && actualType !== "number") {
          return {
            success: false,
            error: `Invalid type for '${key}' on tool '${toolName}': expected number, received ${actualType}.`,
          };
        }
        if (expectedType === "integer" && (!Number.isInteger(val) || actualType !== "number")) {
          return {
            success: false,
            error: `Invalid type for '${key}' on tool '${toolName}': expected integer, received ${actualType}.`,
          };
        }
        if (expectedType === "string" && actualType !== "string") {
          return {
            success: false,
            error: `Invalid type for '${key}' on tool '${toolName}': expected string, received ${actualType}.`,
          };
        }
        if (expectedType === "boolean" && actualType !== "boolean") {
          return {
            success: false,
            error: `Invalid type for '${key}' on tool '${toolName}': expected boolean, received ${actualType}.`,
          };
        }
        if (expectedType === "array" && !Array.isArray(val)) {
          return {
            success: false,
            error: `Invalid type for '${key}' on tool '${toolName}': expected array.`,
          };
        }
      }
    }
  }

  return { success: true, data: input };
}
