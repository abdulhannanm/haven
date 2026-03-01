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

    const routes: Array<{ method: string; path: string; bodySchema?: Array<{ name: string; type: string }> }> = [];
    const schemaNames: string[] = [];
    const schemaNameSet = new Set<string>();
    const routeSchemas: Array<{ routeIndex: number; schemaName: string }> = [];

    const refToName = (ref?: string): string | undefined => {
      if (!ref) return undefined;
      const parts = ref.split("/");
      return parts[parts.length - 1];
    };

    const extractSchemaName = (schema: any): string | undefined => {
      if (!schema || typeof schema !== "object") return undefined;
      if (schema.$ref) return refToName(schema.$ref);
      const composite = schema.oneOf || schema.anyOf || schema.allOf;
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
        const route: { method: string; path: string; bodySchema?: Array<{ name: string; type: string }> } = {
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
            const schemaName = extractSchemaName(contentType?.schema);
            if (schemaName) {
              if (!schemaNameSet.has(schemaName)) {
                schemaNameSet.add(schemaName);
                schemaNames.push(schemaName);
              }
              routeSchemas.push({ routeIndex: routes.length, schemaName });
            }
          }
        }

        routes.push(route);
      }
    }

    const schemas: Record<string, { required: string[]; properties?: Record<string, any> }> = {};
    const componentsSchemas = openapi.components?.schemas ?? {};
    for (const name of schemaNames) {
      const schema = componentsSchemas[name];
      const required = Array.isArray(schema?.required) ? schema.required : [];
      schemas[name] = { required, properties: schema?.properties };
    }

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
      if (!schemaNode || typeof schemaNode !== "object") return "str";
      if (schemaNode.$ref) return "obj";
      if (schemaNode.type) return typeToSchemaToken(schemaNode.type);
      const composite = schemaNode.oneOf || schemaNode.anyOf || schemaNode.allOf;
      if (Array.isArray(composite)) {
        for (const entry of composite) {
          const token = resolveTypeToken(entry);
          if (token) return token;
        }
      }
      return "str";
    };

    for (const { routeIndex, schemaName } of routeSchemas) {
      const schema = componentsSchemas[schemaName];
      const required = Array.isArray(schema?.required) ? schema.required : [];
      const properties = schema?.properties ?? {};
      const bodySchema = required.map((propName: string) => ({
        name: propName,
        type: resolveTypeToken(properties[propName]),
      }));
      if (bodySchema.length > 0) {
        routes[routeIndex].bodySchema = bodySchema;
      }
    }

    const result = {
      baseUrl,
      routes,
    };

    return JSON.stringify(result, null, 2);
  },
})
