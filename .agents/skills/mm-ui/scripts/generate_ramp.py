#!/usr/bin/env python3
"""Programmatic 9-step color ramp generator following §5.3, §5.4, and §5.5.

Derives a 9-step ramp (100..900) from a 500 base color:
  base (500) -> edges (900 / 100) -> midpoints (700 / 300) -> fill (800 / 600 / 400 / 200)

Applies §5.4 (increases saturation as lightness moves away from 50%) and optional
hue rotation (§5.4.2, capped at <= 25 deg) toward bright hues (60/180/300) when
lightening and dark hues (0/120/240) when darkening.

Usage:
    generate_ramp.py --name primary --base "#3b82f6"
    generate_ramp.py --name neutral --base "hsl(215, 16%, 47%)" --neutral cool
    generate_ramp.py --name warning --base "#eab308" --hue-shift 18 --format json
"""

from __future__ import annotations

import argparse
import colorsys
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_contrast import parse_color  # noqa: E402

STEPS = (100, 200, 300, 400, 500, 600, 700, 800, 900)


def rgb_to_hsl(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """Convert 8-bit RGB to (H in [0, 360), S in [0, 100], L in [0, 100])."""
    r, g, b = (c / 255.0 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360.0, s * 100.0, l * 100.0)


def hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """Convert HSL (H in deg, S/L in 0..100) to 8-bit RGB."""
    r, g, b = colorsys.hls_to_rgb((h % 360.0) / 360.0, max(0.0, min(1.0, l / 100.0)), max(0.0, min(1.0, s / 100.0)))
    return (round(r * 255), round(g * 255), round(b * 255))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def _nearest_target(hue: float, targets: tuple[int, ...]) -> float:
    best = targets[0]
    best_dist = 360.0
    for t in targets:
        d = (t - hue + 540.0) % 360.0 - 180.0
        if abs(d) < abs(best_dist):
            best_dist = d
            best = t
    return best_dist


def _rotate_hue(hue: float, shift_max: float, direction: str) -> float:
    if shift_max <= 0:
        return hue
    targets = (60, 180, 300) if direction == "bright" else (0, 120, 240)
    delta = _nearest_target(hue, targets)
    if delta == 0:
        return hue
    step = min(abs(delta), shift_max)
    return (hue + (step if delta > 0 else -step)) % 360.0


def build_ramp(
    base_hsl: tuple[float, float, float],
    light_l: float,
    dark_l: float,
    sat_boost: float,
    hue_shift: float,
    is_neutral: bool = False,
) -> dict[int, dict[str, str]]:
    h_base, s_base, l_base = base_hsl
    if is_neutral and s_base < 4.0:
        s_base = 8.0

    if not (dark_l < l_base < light_l):
        raise ValueError(f"base lightness ({l_base:.1f}%) must sit strictly between dark-l ({dark_l}%) and light-l ({light_l}%)")

    # §5.3: 500 -> 900/100 -> 700/300 -> 800/600/400/200
    l_map: dict[int, float] = {500: l_base, 100: light_l, 900: dark_l}
    l_map[300] = (l_map[100] + l_map[500]) / 2.0
    l_map[700] = (l_map[500] + l_map[900]) / 2.0
    l_map[200] = (l_map[100] + l_map[300]) / 2.0
    l_map[400] = (l_map[300] + l_map[500]) / 2.0
    l_map[600] = (l_map[500] + l_map[700]) / 2.0
    l_map[800] = (l_map[700] + l_map[900]) / 2.0

    ramp: dict[int, dict[str, str]] = {}
    for step in STEPS:
        l_val = l_map[step]
        if step == 500:
            h_val, s_val = h_base, s_base
        elif step < 500:
            t = (500 - step) / 400.0
            # §5.4: boost saturation as lightness moves away from 50%
            dist_factor = max(0.0, (abs(l_val - 50.0) - abs(l_base - 50.0)) / 50.0)
            s_val = min(98.0, s_base + sat_boost * max(t * 0.4, dist_factor))
            h_val = _rotate_hue(h_base, hue_shift * t, "bright")
        else:
            t = (step - 500) / 400.0
            dist_factor = max(0.0, (abs(l_val - 50.0) - abs(l_base - 50.0)) / 50.0)
            s_val = min(98.0, s_base + sat_boost * max(t * 0.4, dist_factor))
            h_val = _rotate_hue(h_base, hue_shift * t, "dark")

        rgb = hsl_to_rgb(h_val, s_val, l_val)
        hx = rgb_to_hex(rgb)
        if hx in ("#000000", "#ffffff"):
            raise ValueError(f"step {step} collapsed to pure {hx}; adjust --light-l / --dark-l")
        ramp[step] = {
            "hex": hx,
            "hsl": f"hsl({round(h_val)}, {round(s_val)}%, {round(l_val)}%)",
        }
    return ramp


def main() -> int:
    ap = argparse.ArgumentParser(description="Programmatic 9-step color ramp generator (§5.3–§5.5)")
    ap.add_argument("--name", required=True, help="ramp group name, e.g. primary, neutral, danger")
    ap.add_argument("--base", help="base 500 color (#rrggbb, rgb(...), or hsl(...))")
    ap.add_argument("--neutral", choices=["cool", "warm"], help="preset neutral tint if --base is omitted")
    ap.add_argument("--light-l", type=float, default=96.0, help="lightness for step 100 (default: 96)")
    ap.add_argument("--dark-l", type=float, default=14.0, help="lightness for step 900 (default: 14)")
    ap.add_argument("--sat-boost", type=float, default=14.0, help="saturation boost toward edges per §5.4 (default: 14)")
    ap.add_argument("--hue-shift", type=float, default=0.0, help="max hue rotation at edges in degrees, <= 25 (§5.4.2)")
    ap.add_argument("--format", choices=["css", "json", "table"], default="css", help="output format")
    args = ap.parse_args()

    if args.hue_shift > 25.0 or args.hue_shift < 0.0:
        print("error: --hue-shift must be between 0 and 25 degrees (§5.4.2)", file=sys.stderr)
        return 2

    is_neutral = args.neutral is not None or args.name.lower() in ("neutral", "gray", "grey")
    if args.base:
        try:
            rgb = parse_color(args.base)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        base_hsl = rgb_to_hsl(rgb)
    elif args.neutral == "cool":
        base_hsl = (216.0, 14.0, 48.0)
    elif args.neutral == "warm":
        base_hsl = (34.0, 12.0, 48.0)
    else:
        print("error: provide --base or --neutral cool|warm", file=sys.stderr)
        return 2

    try:
        ramp = build_ramp(
            base_hsl=base_hsl,
            light_l=args.light_l,
            dark_l=args.dark_l,
            sat_boost=args.sat_boost,
            hue_shift=args.hue_shift,
            is_neutral=is_neutral,
        )
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps({args.name: {str(k): v["hex"] for k, v in ramp.items()}}, indent=2))
    elif args.format == "table":
        for step in STEPS:
            print(f"  {args.name}-{step}: {ramp[step]['hex']}  ({ramp[step]['hsl']})")
    else:
        for step in STEPS:
            print(f"  --color-{args.name}-{step}: {ramp[step]['hex']}; /* {ramp[step]['hsl']} */")
    return 0


if __name__ == "__main__":
    sys.exit(main())
