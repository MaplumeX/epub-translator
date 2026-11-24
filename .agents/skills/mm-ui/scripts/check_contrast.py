#!/usr/bin/env python3
"""WCAG contrast checker for design tokens and hand-picked pairs.

Usage:
    check_contrast.py "#ffffff" "#333333"
    check_contrast.py "#fff:#333" "#0055ff:#fff" --large
    check_contrast.py --file pairs.txt

Each pair is foreground:background. Exit code is 1 if any pair falls below the
threshold, so it can gate a token change.

Thresholds: 4.5:1 for body text, 3:1 for large text (>=18px, or >=14px bold).
"""

from __future__ import annotations

import argparse
import colorsys
import math
import sys

BODY = 4.5
LARGE = 3.0


def _split_css_args(inner: str) -> list[str]:
    """Split comma- or whitespace-separated CSS color function arguments."""
    if "," in inner:
        return [p.strip() for p in inner.split(",")]
    return inner.split()


def _parse_percent(token: str) -> float:
    if not token.endswith("%"):
        raise ValueError(f"expected percentage: {token!r}")
    val = float(token[:-1])
    if not 0.0 <= val <= 100.0:
        raise ValueError(f"percentage out of range: {token!r}")
    return val / 100.0


def _parse_hue_deg(token: str) -> float:
    t = token.strip().lower()
    if t == "none":
        return 0.0
    if t.endswith("turn"):
        return (float(t[:-4]) * 360.0) % 360.0
    if t.endswith("grad"):
        return (float(t[:-4]) * 0.9) % 360.0
    if t.endswith("rad"):
        return math.degrees(float(t[:-3])) % 360.0
    if t.endswith("deg"):
        return float(t[:-3]) % 360.0
    return float(t) % 360.0


def _oklch_to_rgb(inner: str) -> tuple[int, int, int]:
    body = inner.strip()
    if "/" in body:
        color_part, alpha_part = body.split("/", 1)
        a_tok = alpha_part.strip()
        alpha = _parse_percent(a_tok) if a_tok.endswith("%") else float(a_tok)
        if alpha < 1.0:
            raise ValueError(f"translucent oklch alpha ({a_tok}) cannot be checked without backdrop")
        body = color_part.strip()

    parts = _split_css_args(body)
    if len(parts) != 3:
        raise ValueError(f"expected 3 oklch channels: {inner!r}")

    l_tok, c_tok, h_tok = parts
    l_val = _parse_percent(l_tok) if l_tok.endswith("%") else float(l_tok)
    if not 0.0 <= l_val <= 1.0:
        raise ValueError(f"oklch lightness out of range [0, 1]: {l_tok!r}")
    c_val = _parse_percent(c_tok) * 0.4 if c_tok.endswith("%") else float(c_tok)
    if c_val < 0.0:
        raise ValueError(f"oklch chroma must be >= 0: {c_tok!r}")
    h_deg = _parse_hue_deg(h_tok)

    h_rad = math.radians(h_deg)
    a = c_val * math.cos(h_rad)
    b = c_val * math.sin(h_rad)

    l_ = l_val + 0.3963377774 * a + 0.2158037573 * b
    m_ = l_val - 0.1055613458 * a - 0.0638541728 * b
    s_ = l_val - 0.0894841775 * a - 1.2914855480 * b

    l_cubed = l_ * l_ * l_
    m_cubed = m_ * m_ * m_
    s_cubed = s_ * s_ * s_

    lin_rgb = (
        +4.0767416621 * l_cubed - 3.3077115913 * m_cubed + 0.2309699292 * s_cubed,
        -1.2684380046 * l_cubed + 2.6097574011 * m_cubed - 0.3413193965 * s_cubed,
        -0.0041960863 * l_cubed - 0.7034186147 * m_cubed + 1.7076147010 * s_cubed,
    )

    out: list[int] = []
    for c_lin in lin_rgb:
        c_clamped = max(0.0, min(1.0, c_lin))
        c_srgb = 12.92 * c_clamped if c_clamped <= 0.0031308 else 1.055 * (c_clamped ** (1.0 / 2.4)) - 0.055
        out.append(round(max(0.0, min(1.0, c_srgb)) * 255))
    return (out[0], out[1], out[2])


def parse_color(value: str) -> tuple[int, int, int]:
    """Parse #rgb, #rrggbb, rgb(...), hsl(...), or oklch(...) into an 8-bit RGB tuple."""
    v = value.strip().lower()
    if v.startswith("#"):
        v = v[1:]
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) == 6:
        try:
            return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
        except ValueError:
            pass
    if v.startswith("rgb(") and v.endswith(")"):
        parts = _split_css_args(v[4:-1])
        if len(parts) == 3:
            rgb = tuple(int(p) for p in parts)
            if all(0 <= c <= 255 for c in rgb):
                return rgb  # type: ignore[return-value]
    if v.startswith("hsl(") and v.endswith(")"):
        parts = _split_css_args(v[4:-1])
        if len(parts) == 3:
            h_deg = _parse_hue_deg(parts[0])
            h = h_deg / 360.0
            s = _parse_percent(parts[1])
            l = _parse_percent(parts[2])
            r, g, b = colorsys.hls_to_rgb(h, l, s)
            return (round(r * 255), round(g * 255), round(b * 255))
    if v.startswith("oklch(") and v.endswith(")"):
        return _oklch_to_rgb(v[6:-1])
    raise ValueError(f"cannot parse color: {value!r}")


def channel(c: int) -> float:
    s = c / 255
    return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    ap = argparse.ArgumentParser(description="WCAG contrast checker")
    ap.add_argument("pairs", nargs="*", help='pairs as "fg:bg" or two bare colors')
    ap.add_argument("--file", help="file with one fg:bg per line")
    ap.add_argument("--large", action="store_true", help="use the 3:1 large-text threshold")
    args = ap.parse_args()

    raw: list[str] = list(args.pairs)
    if args.file:
        with open(args.file, encoding="utf-8") as fh:
            raw += [line.strip() for line in fh.read().splitlines() if line.strip()]

    if len(raw) == 2 and ":" not in raw[0] and ":" not in raw[1]:
        raw = [f"{raw[0]}:{raw[1]}"]

    if not raw:
        ap.print_help()
        return 2

    threshold = LARGE if args.large else BODY
    failed = 0
    print(f"threshold: {threshold}:1 ({'large' if args.large else 'body'})")
    for item in raw:
        if ":" not in item:
            print(f"  skip (expected fg:bg): {item}")
            continue
        fg_s, bg_s = item.split(":", 1)
        try:
            fg, bg = parse_color(fg_s), parse_color(bg_s)
        except ValueError as exc:
            print(f"  skip: {exc}")
            continue
        r = contrast(fg, bg)
        ok = r >= threshold
        if not ok:
            failed += 1
        print(f"  {fg_s:>9} on {bg_s:<9} {r:5.2f}:1  {'pass' if ok else 'FAIL'}")

    if failed:
        print(f"{failed} pair(s) below threshold")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
