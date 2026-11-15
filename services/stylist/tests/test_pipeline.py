"""Fast tests: no AI models are downloaded or run. The mask is faked, so these check
our own logic: layout, hanger placement, colour safety, fallbacks and the web API."""
import io, json
import numpy as np
import pytest
from PIL import Image, ImageDraw
from stylist import pipeline as P


def fake_photo(w=900, h=1200, colour=(190, 60, 100)):
    img = Image.new("RGB", (w, h), (205, 200, 190))
    d = ImageDraw.Draw(img)
    d.polygon([(330, 260), (570, 260), (700, 1000), (200, 1000)], fill=colour)   # dress-like shape
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=92)
    return buf.getvalue()


def fake_mask(shape):
    m = np.zeros(shape, np.uint8)
    img = Image.fromarray(m); d = ImageDraw.Draw(img)
    h, w = shape
    d.polygon([(330, 260), (570, 260), (700, 1000), (200, 1000)], fill=255)
    return np.array(img)


@pytest.fixture(autouse=True)
def no_models(monkeypatch):
    monkeypatch.setattr(P, "predict_mask", lambda img, model: fake_mask((img.height, img.width)))


def decode(webp):
    return Image.open(io.BytesIO(webp)).convert("RGB")


def test_output_is_4x5_webp():
    out, res = P.style_photo(fake_photo(), "flat")
    im = decode(out)
    assert im.size == (P.CANVAS_W, P.CANVAS_H)
    assert res.quality == "good"


def test_flat_adds_hanger_hanging_does_not():
    _, flat = P.style_photo(fake_photo(), "flat")
    _, hang = P.style_photo(fake_photo(), "hanging")
    assert flat.hanger_added is True and hang.hanger_added is False


def test_hanger_override():
    _, r = P.style_photo(fake_photo(), "flat", hanger=False)
    assert r.hanger_added is False


def test_worn_never_gets_hanger_and_warns():
    _, r = P.style_photo(fake_photo(), "worn", hanger=True)
    assert r.hanger_added is False and r.warnings


def test_dress_colour_is_not_changed():
    out, _ = P.style_photo(fake_photo(colour=(190, 60, 100)), "flat")
    im = np.array(decode(out)).astype(int)
    target = np.array((190, 60, 100))
    close = (np.abs(im - target).sum(axis=2) < 24)
    assert close.sum() > 20000                           # a large block of the exact dress colour survives
    ys, xs = np.where(close)
    assert abs(im[ys, xs].mean(axis=0) - target).max() < 6


def test_nothing_found_is_flagged_poor(monkeypatch):
    monkeypatch.setattr(P, "predict_mask", lambda img, model: np.zeros((img.height, img.width), np.uint8))
    _, r = P.style_photo(fake_photo(), "flat")
    assert r.quality == "poor" and r.warnings


def test_all_backgrounds_work():
    for bg in P.BACKGROUNDS:
        out, r = P.style_photo(fake_photo(), "flat", background=bg)
        assert r.background == bg and decode(out).size == (P.CANVAS_W, P.CANVAS_H)


def test_clean_mask_drops_specks_and_fills_pattern_holes():
    m = np.zeros((400, 400), np.uint8)
    m[50:350, 100:300] = 255
    m[200:206, 200:206] = 0           # tiny hole (a print): should be filled
    m[10:14, 10:14] = 255             # speck: should vanish
    alpha, parts = P.clean_mask(m)
    assert parts == 1 and alpha[203, 203] > 0.9 and alpha[11, 11] == 0


def test_bad_file_raises():
    with pytest.raises(Exception):
        P.style_photo(b"not an image", "flat")


# ------------------------------------------------------------------ web API
def client(monkeypatch, key="secret"):
    from fastapi.testclient import TestClient
    from stylist import app as A
    monkeypatch.setattr(A, "KEY", key)
    monkeypatch.setattr(A, "_session", lambda name: None)    # skip model warm-up
    return TestClient(A.app)


def test_api_requires_key(monkeypatch):
    c = client(monkeypatch)
    r = c.post("/style", files={"file": ("a.jpg", fake_photo(), "image/jpeg")})
    assert r.status_code == 401


def test_api_returns_webp_and_meta(monkeypatch):
    c = client(monkeypatch)
    r = c.post("/style", files={"file": ("a.jpg", fake_photo(), "image/jpeg")},
               data={"mode": "flat", "background": "cream"}, headers={"X-Stylist-Key": "secret"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    meta = json.loads(r.headers["x-stylist-meta"])
    assert meta["hanger_added"] is True and meta["background"] == "cream"


def test_api_rejects_garbage_and_bad_options(monkeypatch):
    c = client(monkeypatch)
    h = {"X-Stylist-Key": "secret"}
    assert c.post("/style", files={"file": ("a.jpg", b"junk", "image/jpeg")}, headers=h).status_code == 422
    assert c.post("/style", files={"file": ("a.jpg", fake_photo(), "image/jpeg")},
                  data={"mode": "weird"}, headers=h).status_code == 422


# ------------------------------------------------ close-up photos must never be "styled"
def test_shattered_cutout_is_treated_as_closeup(monkeypatch):
    """A close-up of fabric makes the cut-out explode into many small pieces."""
    def many_blobs(img, model):
        m = np.zeros((img.height, img.width), np.uint8)
        for i in range(8):
            x = 60 + i * 90
            m[200:260, x:x + 50] = 255
        return m
    monkeypatch.setattr(P, "predict_mask", many_blobs)
    out, r = P.style_photo(fake_photo(), "auto")
    assert r.mode_used == "closeup" and r.styled_ok is False and r.quality == "poor"
    assert decode(out).size == (P.CANVAS_W, P.CANVAS_H)          # still a clean 4:5 image, colours untouched


def test_colourful_fabric_all_around_is_closeup():
    """If everything around the cut-out is saturated fabric, it is a close-up, not a dress on a floor."""
    img = Image.new("RGB", (900, 1200), (200, 30, 60))                 # saturated red "fabric" everywhere
    ImageDraw.Draw(img).polygon([(330, 260), (570, 260), (700, 1000), (200, 1000)], fill=(30, 120, 60))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=92)
    out, r = P.style_photo(buf.getvalue(), "auto")
    assert r.mode_used == "closeup" and r.styled_ok is False and r.bg_saturation >= P.CLOSEUP_BGSAT


def test_normal_photo_is_styled_ok():
    _, r = P.style_photo(fake_photo(), "auto")
    assert r.styled_ok is True and r.mode_used in ("flat", "hanging")


# ---------------------------------------------- colour-aware hole filling
def test_dress_coloured_hole_is_filled_but_floor_coloured_gap_is_kept():
    h, w = 600, 500
    rgb = np.zeros((h, w, 3), np.uint8)
    rgb[:] = (200, 195, 185)                                    # floor
    rgb[100:550, 100:400] = (60, 140, 90)                       # green dress
    rgb[400:450, 120:380] = (120, 180, 140)                     # the same lighter green appears elsewhere on the dress
    rgb[200:260, 150:210] = (120, 180, 140)                     # a lighter green blotch the model missed
    rgb[300:360, 280:340] = (200, 195, 185)                     # a real gap showing the floor
    mask = np.zeros((h, w), np.uint8); mask[100:550, 100:400] = 255
    mask[200:260, 150:210] = 0; mask[300:360, 280:340] = 0      # the model missed both
    alpha, _ = P.clean_mask(mask, rgb)
    assert alpha[230, 180] > 0.9          # blotch filled
    assert alpha[330, 310] < 0.1          # floor gap left open
