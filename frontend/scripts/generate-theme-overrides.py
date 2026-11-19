"""
Gera `src/styles/theme-overrides.css`.

Por que existe: as páginas usam muitas classes Tailwind com cores fixas do tema
escuro (ex.: `bg-[#090C13]`, `bg-white/[0.04]`, `text-slate-300`). Em vez de
reescrever ~25 mil linhas, este script varre o código, encontra exatamente as
classes usadas (inclusive com `hover:`/`focus:`/`group-hover:`) e emite
seletores precisos que remapeiam cada uma para os tokens dos temas
"Grafite" (dim) e "Claro Suave" (light).

Rode novamente sempre que novas páginas/cores forem adicionadas:
    python scripts/generate-theme-overrides.py
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = SRC / "styles" / "theme-overrides.css"

VARIANTS = {
    "": "{sel}",
    "hover": "{sel}:hover",
    "focus": "{sel}:focus",
    "focus-within": "{sel}:focus-within",
    "active": "{sel}:active",
    "group-hover": ".group:hover {sel}",
}

TOKEN_RE = re.compile(r"(?<![\w\-:/\[])((?:[a-z\-]+:)?)(bg|text|border|divide|ring|from|via|to|placeholder)-([\w\-\[\]#./%]+)")


def esc(cls: str) -> str:
    return "." + re.sub(r"([^a-zA-Z0-9_\-])", r"\\\1", cls)


def parse_alpha(raw: str | None) -> float:
    if raw is None:
        return 1.0
    raw = raw.strip("[]")
    try:
        v = float(raw.rstrip("%"))
    except ValueError:
        return 1.0
    return v / 100 if v > 1 or raw.endswith("%") or "." not in raw else v


def hex_lum(h: str) -> float | None:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) not in (6, 8):
        return None
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


HUE_DARK = {
    # Tom legível sobre fundo claro (Tailwind 700/800)
    "red": "#b91c1c", "rose": "#be123c", "orange": "#c2410c", "amber": "#a16207",
    "yellow": "#a16207", "lime": "#4d7c0f", "green": "#15803d", "emerald": "#047857",
    "teal": "#0f766e", "cyan": "#0e7490", "sky": "#0369a1", "blue": "#1d4ed8",
    "indigo": "#4338ca", "violet": "#6d28d9", "purple": "#7e22ce", "fuchsia": "#a21caf",
    "pink": "#be185d",
}
NEUTRALS = ("slate", "gray", "zinc", "neutral", "stone")


def collect_tokens() -> set[tuple[str, str, str]]:
    found: set[tuple[str, str, str]] = set()
    for f in SRC.rglob("*.tsx"):
        if f.name in ("LandingPage.tsx", "LoginPage.tsx", "FormResponderPage.tsx", "PrivacyPolicyPage.tsx"):
            continue  # páginas públicas têm visual próprio
        text = f.read_text(encoding="utf-8", errors="ignore")
        for m in TOKEN_RE.finditer(text):
            variant = m.group(1).rstrip(":")
            if variant not in VARIANTS:
                continue
            found.add((variant, m.group(2), m.group(3)))
    return found


def light_rule(kind: str, value: str) -> str | None:
    m_alpha = re.match(r"^(.*?)(?:/(\[?[\d.]+%?\]?))?$", value)
    base, alpha_raw = m_alpha.group(1), m_alpha.group(2)
    a = parse_alpha(alpha_raw)

    if kind == "bg":
        if base == "white" and alpha_raw:
            return f"background-color: rgb(var(--ink-rgb) / {min(0.035 + a * 0.55, 0.16):.3f})"
        if base == "black" and alpha_raw:
            if a >= 0.6:
                return f"background-color: rgb(28 32 42 / {a * 0.55:.3f})"  # backdrops
            return f"background-color: rgb(var(--ink-rgb) / {0.03 + a * 0.12:.3f})"
        if base.startswith("[#"):
            lum = hex_lum(base[1:-1])
            if lum is None or lum > 0.16:
                return None
            tier = "--surface-sunken" if lum < 0.025 else ("--surface" if lum < 0.06 else "--surface-raised")
            if alpha_raw and a < 0.55:
                return f"background-color: color-mix(in srgb, var({tier}) {int(a * 100)}%, transparent)"
            return f"background-color: var({tier}); background-image: none"
        for n in NEUTRALS:
            mm = re.match(rf"^{n}-(\d+)$", base)
            if mm and int(mm.group(1)) >= 700:
                if alpha_raw and a < 0.55:
                    return f"background-color: rgb(var(--ink-rgb) / {0.04 + a * 0.1:.3f})"
                return "background-color: var(--surface-raised)"
        return None

    if kind == "text":
        if base == "white" and not alpha_raw:
            return "color: var(--ink)"
        if base == "white":
            return f"color: rgb(var(--ink-rgb) / {max(a, 0.5):.2f})"
        if base == "[#a1a1a6]":
            return "color: var(--ink-muted)"
        for n in NEUTRALS:
            mm = re.match(rf"^{n}-(\d+)$", base)
            if mm:
                s = int(mm.group(1))
                if s <= 300:
                    return "color: var(--ink-2)"
                if s == 400:
                    return "color: var(--ink-muted)"
                if s == 500:
                    return "color: var(--ink-faint)"
                return None
        mm = re.match(r"^([a-z]+)-(\d+)$", base)
        if mm and mm.group(1) in HUE_DARK and int(mm.group(2)) <= 400:
            return f"color: {HUE_DARK[mm.group(1)]}"
        return None

    if kind in ("border", "divide"):
        prop = "border-color"
        if base == "white" and alpha_raw:
            return f"{prop}: rgb(var(--ink-rgb) / {min(0.06 + a * 0.6, 0.24):.3f})"
        if base.startswith("[#"):
            lum = hex_lum(base[1:-1])
            if lum is not None and lum < 0.16:
                return f"{prop}: var(--hairline)"
        for n in NEUTRALS:
            if re.match(rf"^{n}-([7-9]\d\d)$", base):
                return f"{prop}: var(--hairline)"
        return None

    if kind == "ring" and base == "white" and alpha_raw:
        return f"--tw-ring-color: rgb(var(--ink-rgb) / {min(0.08 + a * 0.6, 0.3):.3f})"

    if kind in ("from", "via", "to"):
        if base == "white" and alpha_raw:
            return f"--tw-gradient-{kind}: rgb(var(--ink-rgb) / {min(a * 0.35, 0.08):.3f})"
        if base.startswith("[#"):
            lum = hex_lum(base[1:-1])
            if lum is not None and lum < 0.16:
                return f"--tw-gradient-{kind}: var(--surface)"
    if kind == "placeholder" and (base.startswith(NEUTRALS) or base == "white"):
        return None
    return None


def dim_rule(kind: str, value: str) -> str | None:
    m_alpha = re.match(r"^(.*?)(?:/(\[?[\d.]+%?\]?))?$", value)
    base, alpha_raw = m_alpha.group(1), m_alpha.group(2)
    a = parse_alpha(alpha_raw)
    if kind == "bg" and base.startswith("[#"):
        lum = hex_lum(base[1:-1])
        if lum is None or lum > 0.16:
            return None
        tier = "--surface-sunken" if lum < 0.025 else ("--surface" if lum < 0.06 else "--surface-raised")
        if alpha_raw and a < 0.55:
            return f"background-color: color-mix(in srgb, var({tier}) {int(a * 100)}%, transparent)"
        return f"background-color: var({tier})"
    if kind == "bg" and base == "black" and alpha_raw and a < 0.6:
        return f"background-color: rgb(0 0 0 / {a * 0.55:.3f})"
    if kind in ("from", "via", "to") and base.startswith("[#"):
        lum = hex_lum(base[1:-1])
        if lum is not None and lum < 0.16:
            return f"--tw-gradient-{kind}: var(--surface)"
    return None


def selector(variant: str, kind: str, value: str, theme: str) -> str:
    cls = f"{variant + ':' if variant else ''}{kind}-{value}"
    sel = esc(cls)
    if kind == "divide":
        sel = f"{sel} > :not(:last-child)"
    if kind == "placeholder":
        sel = f"{sel}::placeholder"
    return f'html[data-theme="{theme}"] ' + VARIANTS[variant].format(sel=sel)


def main() -> None:
    tokens = sorted(collect_tokens())
    out = [
        "/* ARQUIVO GERADO por scripts/generate-theme-overrides.py — não edite à mão. */",
        "/* Remapeia classes de cor fixas (tema escuro) para os temas Grafite e Claro Suave. */",
        "",
    ]
    light, dim = [], []
    for variant, kind, value in tokens:
        r = light_rule(kind, value)
        if r:
            light.append(f"{selector(variant, kind, value, 'light')} {{ {r.replace('; ', ' !important; ')} !important; }}")
        r = dim_rule(kind, value)
        if r:
            dim.append(f"{selector(variant, kind, value, 'dim')} {{ {r.replace('; ', ' !important; ')} !important; }}")
    out.append("/* ---------- Claro Suave ---------- */")
    out.extend(light)
    # Texto branco precisa continuar branco sobre fundos coloridos sólidos (botões, chips cheios)
    solid = [f'[class~="bg-{h}-{s}"]' for h in ("red", "rose", "emerald", "green", "blue", "sky", "indigo", "violet", "purple", "amber", "orange", "teal", "cyan") for s in (500, 600, 700, 800)]
    solid += [f'[class~="hover:bg-{h}-{s}"]:hover' for h in ("red", "emerald", "blue") for s in (500, 600, 700)]
    solid += ['[class~="bg-[#e20613]"]', '[class~="bg-[#c20511]"]', '[class~="bg-[#c80510]"]', '[class~="bg-[#EE2C24]"]',
              '[class~="bg-[#3b82f6]"]', '[class~="bg-[#003399]"]', '[class~="bg-[#b91c1c]"]', '[class~="bg-[#ef4444]"]',
              '[class~="bg-[var(--color-primary)]"]', '[class*="from-red-"]', '[class*="from-[#e20613]"]', '[class*="from-[#FF382E]"]',
              '[class*="from-[#EE2C24]"]', '[class*="from-emerald-"]', '[class*="from-blue-"]', '[class*="from-sky-"]', '.btn-solid']
    joined = ", ".join(solid)
    out.append(f'html[data-theme="light"] :is({joined}), html[data-theme="light"] :is({joined}) :is(.text-white, [class*="text-white/"]) {{ color: #ffffff !important; }}')
    out.append("")
    out.append("/* ---------- Grafite ---------- */")
    out.extend(dim)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(light)} regras claras, {len(dim)} regras grafite")


if __name__ == "__main__":
    main()
