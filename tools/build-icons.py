"""tools/icon.svg から public/ のアイコン PNG を作る。

使い方: python3 tools/build-icons.py   （Playwright と Chrome、日本語フォント Noto Serif CJK JP が必要）
"""
import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = (ROOT / "tools" / "icon.svg").read_text(encoding="utf-8")
OUT = ROOT / "public"
SIZES = {
    "icon-512.png": 512,
    "icon-192.png": 192,
    "apple-touch-icon.png": 180,
}


async def main(chrome: str | None):
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
        for name, size in SIZES.items():
            page = await browser.new_page(viewport={"width": size, "height": size})
            await page.set_content(
                f'<html><body style="margin:0">{SVG.replace("<svg ", f"<svg width=\"{size}\" height=\"{size}\" ", 1)}</body></html>'
            )
            await page.wait_for_timeout(200)
            await page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": size, "height": size})
            await page.close()
            print("wrote", name)
        await browser.close()


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
