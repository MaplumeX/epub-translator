#!/usr/bin/env python3
"""Headless-browser visual capture, runtime audit, and contact-sheet builder for mm-ui.

Captures real-browser screenshots at desktop (1440x900) and mobile (400x844)
viewports using Playwright, inspects runtime layout health (horizontal overflow,
console/page errors, broken images), and stitches captures into a labeled
contact sheet (`sheet.png`) when Pillow is available.

Usage:
    shoot.py page.html --out shots/
    shoot.py http://localhost:3000 --out shots/ --states default,empty,loading,error
    shoot.py http://localhost:4173 --serve "npx vite preview --port 4173 --strictPort" --out shots/ --strict
    shoot.py explore/manifest.json --out shots/explore/
    shoot.py page.html --out shots/ --full-page --strict
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

VIEWPORTS = {
    "desktop": (1440, 900),
    "mobile": (400, 844),
}


@dataclass
class ShotResult:
    label: str
    viewport: str
    state: str
    path: Path
    overflow_px: int
    console_errors: list[str]
    page_errors: list[str]
    broken_images: list[str]


def _resolve_target_url(raw_target: str) -> str:
    if raw_target.startswith(("http://", "https://", "file://")):
        return raw_target
    p = Path(raw_target).resolve()
    return p.as_uri()


def _load_targets(target_arg: str) -> tuple[list[dict[str, str]], Path | None]:
    p = Path(target_arg)
    if p.is_dir():
        p = p / "manifest.json"
    if p.exists() and p.suffix.lower() == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        base = p.parent
        items: list[dict[str, str]] = []
        for idx, entry in enumerate(data.get("directions", data.get("targets", [])), 1):
            raw_file = entry.get("file") or entry.get("url") or ""
            if not raw_file:
                continue
            resolved = raw_file if raw_file.startswith(("http://", "https://", "file://")) else str((base / raw_file).resolve())
            items.append(
                {
                    "name": entry.get("name") or entry.get("label") or f"option-{idx}",
                    "url": _resolve_target_url(resolved),
                }
            )
        if not items:
            raise ValueError(f"no targets/directions found in manifest: {p}")
        return items, base
    return [{"name": Path(target_arg).stem if not target_arg.startswith("http") else "page", "url": _resolve_target_url(target_arg)}], None


def _activate_state(page: Any, base_url: str, state: str) -> None:
    if state == "default":
        return
    # Strategy 1: click an interactive state switcher control if present (e.g. data-state="empty")
    clicked = page.evaluate(
        """(st) => {
            const el = document.querySelector(`[data-state="${st}"], [data-mm-state="${st}"]`);
            if (el && typeof el.click === 'function') {
                el.click();
                return true;
            }
            return false;
        }""",
        state,
    )
    if clicked:
        page.wait_for_timeout(150)
        return
    # Strategy 2: fallback to ?state=<state> query parameter
    sep = "&" if "?" in base_url else "?"
    page.goto(f"{base_url}{sep}state={state}", wait_until="networkidle")
    page.wait_for_timeout(150)


def _audit_page(page: Any) -> tuple[int, list[str]]:
    result = page.evaluate(
        """() => {
            const docEl = document.documentElement;
            const overflowPx = Math.max(0, Math.round(docEl.scrollWidth - window.innerWidth));
            const brokenImgs = [];
            for (const img of document.querySelectorAll('img')) {
                const style = window.getComputedStyle(img);
                if (style.display !== 'none' && style.visibility !== 'hidden' && img.complete && img.naturalWidth === 0) {
                    brokenImgs.push(img.getAttribute('src') || img.alt || '<img without src>');
                }
            }
            return { overflowPx, brokenImgs };
        }"""
    )
    return int(result["overflowPx"]), list(result["brokenImgs"])


def _build_contact_sheet(shots: list[ShotResult], out_path: Path, cols: int = 2) -> bool:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False

    if not shots:
        return False

    thumb_w = 720
    header_h = 34
    pad = 16
    cells: list[tuple[Image.Image, ShotResult]] = []
    for shot in shots:
        with Image.open(shot.path) as im:
            rgb = im.convert("RGB")
            ratio = thumb_w / rgb.width
            thumb_h = max(120, min(900, int(rgb.height * ratio)))
            resized = rgb.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            cells.append((resized, shot))

    rows = (len(cells) + cols - 1) // cols
    row_heights: list[int] = []
    for r in range(rows):
        chunk = cells[r * cols : (r + 1) * cols]
        row_heights.append(max(im.height for im, _ in chunk) + header_h)

    sheet_w = pad + cols * (thumb_w + pad)
    sheet_h = pad + sum(h + pad for h in row_heights)
    sheet = Image.new("RGB", (sheet_w, sheet_h), (244, 245, 247))
    draw = ImageDraw.Draw(sheet)

    y = pad
    for r in range(rows):
        chunk = cells[r * cols : (r + 1) * cols]
        for c, (im, shot) in enumerate(chunk):
            x = pad + c * (thumb_w + pad)
            has_issue = bool(shot.overflow_px > 1 or shot.console_errors or shot.page_errors or shot.broken_images)
            bar_color = (185, 28, 28) if has_issue else (24, 24, 27)
            draw.rectangle([x, y, x + thumb_w, y + header_h], fill=bar_color)
            status = f"OVERFLOW +{shot.overflow_px}px" if shot.overflow_px > 1 else "OK"
            if shot.console_errors or shot.page_errors:
                status += f" | {len(shot.console_errors) + len(shot.page_errors)} err"
            if shot.broken_images:
                status += f" | {len(shot.broken_images)} broken img"
            caption = f"{shot.label} · {shot.viewport} · {shot.state} [{status}]"
            draw.text((x + 10, y + 10), caption, fill=(250, 250, 250))
            sheet.paste(im, (x, y + header_h))
        y += row_heights[r] + pad

    sheet.save(out_path, format="PNG")
    return True


def _slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    return re.sub(r"-+", "-", cleaned).strip("-") or "shot"


def _start_server(command: str) -> subprocess.Popen[bytes]:
    """Start a preview/dev server in its own process group so teardown kills children too."""
    kwargs: dict[str, Any] = {
        "shell": True,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.PIPE,
    }
    if os.name == "posix":
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def _stop_server(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGTERM)
        else:
            proc.terminate()
        proc.wait(timeout=3.0)
    except subprocess.TimeoutExpired:
        try:
            if os.name == "posix":
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
            proc.wait(timeout=2.0)
        except Exception:
            pass
    except ProcessLookupError:
        pass


def _wait_for_server(url: str, proc: subprocess.Popen[bytes], timeout_s: float) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            err = proc.stderr.read().decode("utf-8", errors="replace").strip() if proc.stderr else ""
            raise RuntimeError(f"server exited early with code {proc.returncode}" + (f": {err}" if err else ""))
        try:
            with opener.open(url, timeout=1.0):
                return
        except urllib.error.HTTPError:
            return
        except (urllib.error.URLError, OSError):
            time.sleep(0.2)
    raise RuntimeError(f"server did not respond at {url} within {timeout_s:.1f}s")


def main() -> int:
    ap = argparse.ArgumentParser(description="Capture desktop/mobile/state screenshots and runtime layout audits")
    ap.add_argument("target", help="HTML file path, URL, or manifest.json (or directory containing manifest.json)")
    ap.add_argument("--out", default="shots", help="output directory for PNG captures and sheet.png (default: shots)")
    ap.add_argument("--states", default="default", help="comma-separated states to capture (e.g. default,empty,loading,error)")
    ap.add_argument("--viewports", default="desktop,mobile", help="comma-separated viewports from: desktop,mobile")
    ap.add_argument("--full-page", action="store_true", help="capture full scrollable page height")
    ap.add_argument("--strict", action="store_true", help="exit 1 if overflow, console/page errors, or broken images occur")
    ap.add_argument("--no-sheet", action="store_true", help="skip generating composite sheet.png")
    ap.add_argument("--serve", help="command to start a local HTTP server for an http(s) target and stop it on exit")
    ap.add_argument("--serve-timeout", type=float, default=20.0, help="seconds to wait for --serve URL readiness (default: 20)")
    args = ap.parse_args()

    if args.serve and not args.target.startswith(("http://", "https://")):
        print("error: --serve requires an http:// or https:// target URL", file=sys.stderr)
        return 2

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "error: playwright is not installed in Python environment; install with 'pip install playwright && playwright install chromium'",
            file=sys.stderr,
        )
        return 2

    try:
        targets, _ = _load_targets(args.target)
    except Exception as exc:
        print(f"error: failed to load target '{args.target}': {exc}", file=sys.stderr)
        return 2

    if not args.target.startswith(("http://", "https://", "file://")) and not Path(args.target).exists():
        print(f"error: target path not found: {args.target}", file=sys.stderr)
        return 2

    states = [s.strip() for s in args.states.split(",") if s.strip()]
    vp_names = [v.strip() for v in args.viewports.split(",") if v.strip()]
    invalid_vps = [v for v in vp_names if v not in VIEWPORTS]
    if invalid_vps:
        print(f"error: unknown viewport(s): {', '.join(invalid_vps)} (expected: {', '.join(VIEWPORTS)})", file=sys.stderr)
        return 2

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    results: list[ShotResult] = []

    server_proc: subprocess.Popen[bytes] | None = None
    try:
        if args.serve:
            server_proc = _start_server(args.serve)
            try:
                _wait_for_server(args.target, server_proc, args.serve_timeout)
            except Exception as exc:
                print(f"error: failed to start server for '{args.target}': {exc}", file=sys.stderr)
                return 2

        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                for item in targets:
                    name = item["name"]
                    url = item["url"]
                    for vp_name in vp_names:
                        vw, vh = VIEWPORTS[vp_name]
                        for state in states:
                            console_errs: list[str] = []
                            page_errs: list[str] = []
                            context = browser.new_context(viewport={"width": vw, "height": vh})
                            page = context.new_page()
                            page.on("console", lambda msg, errs=console_errs: errs.append(msg.text) if msg.type == "error" else None)
                            page.on("pageerror", lambda err, errs=page_errs: errs.append(str(err)))
                            page.goto(url, wait_until="networkidle")
                            page.wait_for_timeout(120)
                            _activate_state(page, url, state)
                            overflow_px, broken_imgs = _audit_page(page)
                            out_file = out_dir / f"{_slug(name)}-{vp_name}-{_slug(state)}.png"
                            page.screenshot(path=str(out_file), full_page=args.full_page)
                            context.close()
                            results.append(
                                ShotResult(
                                    label=name,
                                    viewport=f"{vp_name} ({vw}px)",
                                    state=state,
                                    path=out_file,
                                    overflow_px=overflow_px,
                                    console_errors=console_errs,
                                    page_errors=page_errs,
                                    broken_images=broken_imgs,
                                )
                            )
            finally:
                browser.close()
    finally:
        if server_proc is not None:
            _stop_server(server_proc)

    sheet_written = False
    sheet_path = out_dir / "sheet.png"
    if not args.no_sheet:
        sheet_written = _build_contact_sheet(results, sheet_path, cols=min(2, max(1, len(results))))

    issues = 0
    for r in results:
        flags: list[str] = []
        if r.overflow_px > 1:
            flags.append(f"overflow=+{r.overflow_px}px")
        if r.console_errors:
            flags.append(f"console_errors={len(r.console_errors)}")
        if r.page_errors:
            flags.append(f"page_errors={len(r.page_errors)}")
        if r.broken_images:
            flags.append(f"broken_images={len(r.broken_images)}")
        issues += len(flags)
        status = ", ".join(flags) if flags else "clean"
        print(f"shot: {r.path} | {r.viewport} | state={r.state} | {status}")
        for err in r.console_errors + r.page_errors:
            print(f"  runtime error: {err}")
        for img in r.broken_images:
            print(f"  broken image: {img}")

    if sheet_written:
        print(f"contact sheet: {sheet_path}")
    elif not args.no_sheet:
        print("note: Pillow not installed; skipped composite sheet.png (individual PNGs saved)")

    if args.strict and issues > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
