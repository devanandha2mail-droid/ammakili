"""Small internal web service. Only the Nest server should be able to reach it."""
import asyncio
import hmac
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from .pipeline import BACKGROUNDS, CLOTH_MODEL, CUTOUT_MODEL, USE_CLOTH_CHECK, _session, style_photo

log = logging.getLogger("stylist")
KEY = os.getenv("STYLIST_KEY", "")
MAX_BYTES = int(os.getenv("STYLIST_MAX_MB", "15")) * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 60_000_000          # refuse "image bombs"

_one_at_a_time = asyncio.Semaphore(1)         # models are heavy: one photo at a time


@asynccontextmanager
async def lifespan(_app):
    if not KEY:
        log.warning("STYLIST_KEY is empty. Set it, and never expose this service to the internet.")
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _session, CUTOUT_MODEL)      # load models once, at start
    if USE_CLOTH_CHECK:
        await loop.run_in_executor(None, _session, CLOTH_MODEL)
    yield


app = FastAPI(title="Nest photo stylist", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/style")
async def style(file: UploadFile = File(...), mode: str = Form("auto"), hanger: str = Form("auto"),
                background: str = Form("pink"), x_stylist_key: str = Header(default="")):
    if KEY and not hmac.compare_digest(x_stylist_key, KEY):
        raise HTTPException(401, "Unauthorized")
    if mode not in ("auto", "hanging", "flat", "worn"):
        raise HTTPException(422, "mode must be auto, hanging, flat or worn")
    if hanger not in ("auto", "yes", "no"):
        raise HTTPException(422, "hanger must be auto, yes or no")
    if background not in BACKGROUNDS:
        raise HTTPException(422, "unknown background")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image is too large")
    hv = None if hanger == "auto" else hanger == "yes"
    async with _one_at_a_time:
        try:
            out, res = await asyncio.get_running_loop().run_in_executor(
                None, style_photo, data, mode, hv, background)
        except Exception:
            log.exception("styling failed")
            raise HTTPException(422, "Could not read or process that image")
    log.info("styled mode=%s quality=%s seconds=%s", res.mode_used, res.quality, res.seconds)
    return Response(content=out, media_type="image/webp",
                    headers={"X-Stylist-Meta": json.dumps(res.to_dict()), "Cache-Control": "no-store"})
