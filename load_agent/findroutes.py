#!/usr/bin/env python3
"""Fetch and summarize an OpenAPI schema from TARGET_BASE_URL/openapi.json."""

import json
import os
import sys
import textwrap
from typing import Any, Dict, Iterable, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def build_openapi_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/openapi.json"


def fetch_json(url: str) -> Dict[str, Any]:
    req = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=20) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            data = resp.read().decode(charset)
            return json.loads(data)
    except HTTPError as exc:
        raise RuntimeError(f"HTTP error {exc.code} when fetching {url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error when fetching {url}: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Response from {url} was not valid JSON: {exc}") from exc


def get_paths(openapi: Dict[str, Any]) -> Dict[str, Any]:
    paths = openapi.get("paths", {})
    return paths if isinstance(paths, dict) else {}


def get_components_schemas(openapi: Dict[str, Any]) -> Dict[str, Any]:
    components = openapi.get("components", {})
    if not isinstance(components, dict):
        return {}
    schemas = components.get("schemas", {})
    return schemas if isinstance(schemas, dict) else {}


def iter_methods(paths: Dict[str, Any]) -> Iterable[Tuple[str, str, Dict[str, Any]]]:
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, spec in path_item.items():
            if method.lower() in {
                "get",
                "put",
                "post",
                "delete",
                "patch",
                "options",
                "head",
                "trace",
            }:
                if isinstance(spec, dict):
                    yield path, method.lower(), spec


def summarize_schema(schema: Dict[str, Any]) -> str:
    parts = []
    schema_type = schema.get("type")
    if schema_type:
        parts.append(schema_type)
    if schema.get("format"):
        parts.append(schema["format"])
    if schema.get("nullable") is True:
        parts.append("nullable")
    if schema.get("enum"):
        parts.append(f"enum[{len(schema['enum'])}]")
    if schema.get("items"):
        item = schema.get("items", {})
        if isinstance(item, dict) and item.get("type"):
            parts.append(f"items:{item['type']}")
    return ", ".join(parts) if parts else "(unspecified)"


def print_header(title: str) -> None:
    print(title)
    print("-" * len(title))


def print_kv(label: str, value: Any) -> None:
    if value is None:
        return
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value)
    print(f"{label}: {value}")


def main() -> int:
    base_url = os.environ.get("TARGET_BASE_URL")
    if not base_url:
        eprint("Missing TARGET_BASE_URL env var.")
        return 2

    url = build_openapi_url(base_url)
    try:
        spec = fetch_json(url)
    except RuntimeError as exc:
        eprint(str(exc))
        return 1

    info = spec.get("info", {}) if isinstance(spec.get("info", {}), dict) else {}
    print_header("OpenAPI Summary")
    print_kv("Source", url)
    print_kv("OpenAPI", spec.get("openapi"))
    print_kv("Title", info.get("title"))
    print_kv("Version", info.get("version"))
    if info.get("description"):
        desc = textwrap.shorten(str(info.get("description")), width=180, placeholder="...")
        print_kv("Description", desc)

    servers = spec.get("servers", []) if isinstance(spec.get("servers", []), list) else []
    if servers:
        print("Servers:")
        for server in servers:
            if isinstance(server, dict):
                print(f"- {server.get('url', '')}".rstrip())
        print("")

    paths = get_paths(spec)
    methods = list(iter_methods(paths))
    print_header("Routes")
    print_kv("Paths", len(paths))
    print_kv("Operations", len(methods))

    for path in sorted(paths.keys()):
        ops = [m for m in methods if m[0] == path]
        if not ops:
            continue
        print(path)
        for _, method, op in sorted(ops, key=lambda x: x[1]):
            summary = op.get("summary") or op.get("operationId") or ""
            if summary:
                print(f"  {method.upper():<6} {summary}")
            else:
                print(f"  {method.upper():<6}")
    print("")

    schemas = get_components_schemas(spec)
    print_header("Schemas")
    print_kv("Schema count", len(schemas))
    if schemas:
        for name in sorted(schemas.keys()):
            schema = schemas.get(name, {})
            if not isinstance(schema, dict):
                continue
            print(name)
            print(f"  {summarize_schema(schema)}")
            props = schema.get("properties", {})
            if isinstance(props, dict) and props:
                for prop_name, prop_schema in props.items():
                    if isinstance(prop_schema, dict):
                        print(f"  - {prop_name}: {summarize_schema(prop_schema)}")
            required = schema.get("required", [])
            if isinstance(required, list) and required:
                print(f"  required: {', '.join(str(r) for r in required)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
