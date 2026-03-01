import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "This tool will find the routes exposed through openapi.json and the parameter/types that it takes",
  args: {
  },
  async execute(args) {
    const baseUrlRaw = process.env.TARGET_BASE_URL;
    if (!baseUrlRaw) {
      throw new Error("TARGET_BASE_URL is not set");
    }

    const baseUrl = baseUrlRaw.replace(/\/+$/u, "");
    const openapiUrl = `${baseUrl}/openapi.json`;

    const response = await fetch(openapiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
    }

    const openapi = (await response.json()) as {
      paths?: Record<string, Record<string, any>>;
      components?: { schemas?: Record<string, { required?: string[] }> };
    };

    const routes: Array<{
      method: string;
      path: string;
      schemaName?: string;
      bodySchema?: Array<{
        name: string;
        type: string;
        required: boolean;
        default?: unknown;
        example?: unknown;
        enum?: unknown[];
      }>;
      bodyExample?: unknown;
      bodySample?: unknown;
    }> = [];

    const refToName = (ref?: string): string | undefined => {
      if (!ref) return undefined;
      const parts = ref.split("/");
      return parts[parts.length - 1];
    };

    const componentsSchemas = openapi.components?.schemas ?? {};

    const dereferenceSchema = (schemaNode: any): any => {
      if (!schemaNode || typeof schemaNode !== "object") return undefined;
      if (schemaNode.$ref) {
        const refName = refToName(schemaNode.$ref);
        return refName ? componentsSchemas[refName] : undefined;
      }
      return schemaNode;
    };

    const normalizeSchema = (schemaNode: any): any => {
      const direct = dereferenceSchema(schemaNode);
      if (!direct || typeof direct !== "object") return direct;
      const composite = direct.oneOf || direct.anyOf || direct.allOf;
      if (Array.isArray(composite) && composite.length > 0) {
        return normalizeSchema(composite[0]);
      }
      return direct;
    };

    const typeToSchemaToken = (type?: string): string => {
      switch (type) {
        case "integer":
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "array":
          return "list";
        case "object":
          return "object";
        case "string":
        default:
          return "string";
      }
    };

    const resolveTypeToken = (schemaNode: any): string => {
      const normalized = normalizeSchema(schemaNode);
      if (!normalized || typeof normalized !== "object") return "str";
      if (normalized.type) return typeToSchemaToken(normalized.type);
      return "str";
    };

    const extractInlineExample = (schemaNode: any): unknown => {
      const normalized = normalizeSchema(schemaNode);
      if (!normalized || typeof normalized !== "object") return undefined;
      if (normalized.example !== undefined) return normalized.example;
      if (normalized.default !== undefined) return normalized.default;
      if (Array.isArray(normalized.enum) && normalized.enum.length > 0) return normalized.enum[0];
      return undefined;
    };

    const buildSampleFromSchema = (schemaNode: any): unknown => {
      const normalized = normalizeSchema(schemaNode);
      if (!normalized || typeof normalized !== "object") return undefined;

      if (normalized.example !== undefined) return normalized.example;
      if (normalized.default !== undefined) return normalized.default;
      if (Array.isArray(normalized.enum) && normalized.enum.length > 0) return normalized.enum[0];

      switch (normalized.type) {
        case "object": {
          const required = new Set(Array.isArray(normalized.required) ? normalized.required : []);
          const properties = normalized.properties ?? {};
          const obj: Record<string, unknown> = {};
          for (const [propName, propSchema] of Object.entries(properties)) {
            const propNormalized = normalizeSchema(propSchema);
            const shouldInclude =
              required.has(propName) ||
              extractInlineExample(propNormalized) !== undefined ||
              propNormalized?.default !== undefined;
            if (!shouldInclude) continue;
            const value = buildSampleFromSchema(propSchema);
            if (value !== undefined) {
              obj[propName] = value;
            }
          }
          return Object.keys(obj).length > 0 ? obj : {};
        }
        case "array": {
          const itemValue = buildSampleFromSchema(normalized.items);
          return itemValue === undefined ? [] : [itemValue];
        }
        case "integer":
          return 1;
        case "number":
          return 1;
        case "boolean":
          return true;
        case "string":
        default:
          if (normalized.format === "email") return "loadtest@example.com";
          if (normalized.format === "date-time") return "2026-03-01T00:00:00Z";
          if (normalized.format === "date") return "2026-03-01";
          return "sample";
      }
    };

    const buildFieldSchema = (schemaNode: any) => {
      const normalized = normalizeSchema(schemaNode);
      if (!normalized || typeof normalized !== "object") return undefined;
      const required = Array.isArray(normalized.required) ? normalized.required : [];
      const properties = normalized.properties ?? {};
      return Object.entries(properties).map(([propName, propSchema]) => {
        const propNormalized = normalizeSchema(propSchema);
        return {
          name: propName,
          type: resolveTypeToken(propSchema),
          required: required.includes(propName),
          default: propNormalized?.default,
          example: propNormalized?.example,
          enum: Array.isArray(propNormalized?.enum) ? propNormalized.enum : undefined,
        };
      });
    };

    const extractSchemaName = (schemaNode: any): string | undefined => {
      if (!schemaNode || typeof schemaNode !== "object") return undefined;
      if (schemaNode.$ref) return refToName(schemaNode.$ref);
      const composite = schemaNode.oneOf || schemaNode.anyOf || schemaNode.allOf;
      if (Array.isArray(composite)) {
        for (const entry of composite) {
          const name = extractSchemaName(entry);
          if (name) return name;
        }
      }
      return undefined;
    };

    const paths = openapi.paths ?? {};
    for (const [path, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== "object") continue;
      for (const [method, operation] of Object.entries(methods)) {
        if (!operation || typeof operation !== "object") continue;
        const route: {
          method: string;
          path: string;
          schemaName?: string;
          bodySchema?: Array<{
            name: string;
            type: string;
            required: boolean;
            default?: unknown;
            example?: unknown;
            enum?: unknown[];
          }>;
          bodyExample?: unknown;
          bodySample?: unknown;
        } = {
          method: method.toUpperCase(),
          path,
        };

        const requestBody = operation.requestBody;
        if (requestBody && typeof requestBody === "object") {
          const content = requestBody.content;
          if (content && typeof content === "object") {
            const contentType =
              content["application/json"] ??
              content["application/*+json"] ??
              content["*/*"] ??
              content[Object.keys(content)[0]];
            const schemaNode = contentType?.schema;
            const schemaName = extractSchemaName(schemaNode);
            if (schemaName) {
              route.schemaName = schemaName;
            }
            if (contentType?.example !== undefined) {
              route.bodyExample = contentType.example;
            } else if (contentType?.examples && typeof contentType.examples === "object") {
              const firstExample = Object.values(contentType.examples)[0] as { value?: unknown } | undefined;
              if (firstExample?.value !== undefined) {
                route.bodyExample = firstExample.value;
              }
            } else {
              route.bodyExample = extractInlineExample(schemaNode);
            }
            route.bodySample = buildSampleFromSchema(schemaNode);
            const fieldSchema = buildFieldSchema(schemaNode);
            if (fieldSchema && fieldSchema.length > 0) {
              route.bodySchema = fieldSchema;
            }
          }
        }

        routes.push(route);
      }
    }

    const result = {
      baseUrl,
      routes,
    };

    return JSON.stringify(result, null, 2);
  },
})
