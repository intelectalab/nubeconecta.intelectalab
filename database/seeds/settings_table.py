"""Render y validación de la tabla de ajustes de 09-centro-de-configuracion.md.

Uso:
  python3 settings_table.py render <settings.json> <doc.md>    # reescribe la tabla entre marcadores
  python3 settings_table.py validate <settings.json> <doc.md>  # valida JSON y tabla
"""
import json
import re
import sys

START = "<!-- settings-table:start -->"
END = "<!-- settings-table:end -->"
HEADER = "| Key | Descripción | Defecto | Niveles | Edita |\n|---|---|---|---|---|"
TYPES = {"integer", "decimal", "boolean", "string", "enum", "json", "list"}
LEVELS = {"global", "brand", "product", "customer", "contract"}
ROLES = {"admin", "sales", "finance", "support", "documentation", "external_accountant",
         "temp_technician", "customer_admin", "customer_user"}


def render_default(st):
    v = st["default"]
    if v is None:
        return "null (por definir)" if st["requires_definition"] else "null"
    if isinstance(v, bool):
        return "`true`" if v else "`false`"
    if isinstance(v, (dict, list)):
        txt = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        return f"`{txt}`" if len(txt) <= 60 else "JSON, ver detalle"
    return f"`{v}`"


def cell(t):
    return str(t).replace("|", "\\|").replace("\n", " ")


def row(st):
    return "| " + " | ".join([
        f"`{st['key']}`",
        cell(st["description"]),
        cell(render_default(st)),
        ", ".join(st["levels"]),
        ", ".join(st["edit_roles"]),
    ]) + " |"


def table(settings):
    return HEADER + "\n" + "\n".join(row(s) for s in settings)


def render(js, md):
    data = json.load(open(js, encoding="utf-8"))
    text = open(md, encoding="utf-8").read()
    new = text.split(START)[0] + START + "\n" + table(data["settings"]) + "\n" + END + text.split(END)[1]
    open(md, "w", encoding="utf-8").write(new)


def validate(js, md):
    errors = []
    try:
        raw = open(js, encoding="utf-8").read()
        data = json.loads(raw)
    except Exception as e:  # JSON inválido
        print(f"FALLA: settings.json no es JSON válido: {e}")
        return 1
    settings = data.get("settings", [])
    keys = [s.get("key") for s in settings]
    dup = sorted({k for k in keys if keys.count(k) > 1})
    if dup:
        errors.append(f"keys duplicadas: {dup}")
    req = ["key", "group", "description", "type", "default", "requires_definition", "levels", "edit_roles", "edit_permission"]
    for s in settings:
        k = s.get("key")
        for f in req:
            if f not in s:
                errors.append(f"{k}: falta campo {f}")
        if not re.fullmatch(r"[a-z0-9_]+(\.[a-z0-9_]+)+", k or ""):
            errors.append(f"{k}: formato de key inválido")
        if s.get("type") not in TYPES:
            errors.append(f"{k}: tipo inválido {s.get('type')}")
        if not set(s.get("levels", [])) <= LEVELS or not s.get("levels"):
            errors.append(f"{k}: niveles inválidos")
        if not set(s.get("edit_roles", [])) <= ROLES:
            errors.append(f"{k}: rol fuera del contrato")
        if s.get("requires_definition") and s.get("default") is not None:
            # se admite solo si el valor es parcial (json con nulls internos)
            if s.get("type") != "json":
                errors.append(f"{k}: requires_definition con valor por defecto no nulo")
        if s.get("default") is None and not s.get("requires_definition") and not s.get("notes"):
            errors.append(f"{k}: null sin requires_definition ni nota que lo justifique")
        if s.get("type") == "enum" and s.get("default") is not None and s.get("default") not in s.get("enum_values", []):
            errors.append(f"{k}: defecto fuera de enum_values")
        d = s.get("default")
        t = s.get("type")
        if d is not None:
            ok = {"integer": isinstance(d, int) and not isinstance(d, bool),
                  "decimal": isinstance(d, (int, float)) and not isinstance(d, bool),
                  "boolean": isinstance(d, bool), "string": isinstance(d, str),
                  "enum": isinstance(d, str), "json": isinstance(d, (dict, list)),
                  "list": isinstance(d, list)}[t]
            if not ok:
                errors.append(f"{k}: el defecto no coincide con el tipo {t}")

    text = open(md, encoding="utf-8").read()
    if START not in text or END not in text:
        errors.append("faltan marcadores de la tabla en el .md")
    else:
        block = text.split(START)[1].split(END)[0].strip()
        expected = table(settings).strip()
        if block != expected:
            got = [l for l in block.splitlines()[2:]]
            exp = [l for l in expected.splitlines()[2:]]
            errors.append(f"la tabla del .md no coincide con el JSON (filas md={len(got)}, json={len(exp)})")
            for a, b in zip(got, exp):
                if a != b:
                    errors.append(f"  primera diferencia:\n    md:   {a}\n    json: {b}")
                    break
        md_keys = re.findall(r"^\| `([^`]+)` \|", block, flags=re.M)
        if sorted(md_keys) != sorted(keys):
            errors.append("las keys de la tabla no son las mismas del JSON")

    if errors:
        print("FALLA")
        for e in errors:
            print(" -", e)
        return 1
    rd = sum(1 for s in settings if s["requires_definition"])
    print(f"OK: JSON válido, {len(settings)} ajustes, keys únicas, {rd} requieren definición, tabla del .md idéntica al JSON ({len(settings)} filas).")
    return 0


if __name__ == "__main__":
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2]
    args = sys.argv[1:]
    cmd = args[0] if args else "validate"
    js = args[1] if len(args) > 1 else str(root / "database/seeds/settings.json")
    md = args[2] if len(args) > 2 else str(root / "docs/09-centro-de-configuracion.md")
    if cmd == "render":
        render(js, md)
    else:
        sys.exit(validate(js, md))
