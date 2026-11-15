"""
Pipeline:  photo -> cut out the dress -> clean the edges -> place on a soft branded
background with a hanger and shadow -> 1200x1500 WebP.

The dress itself is NEVER redrawn or recoloured. Only the background and the
presentation change, so the customer sees the real product.
"""
from __future__ import annotations

import io
import math
import os
import time
from dataclasses import dataclass, field, asdict

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2

CANVAS_W, CANVAS_H = 1200, 1500
MAX_INPUT_SIDE = 1600

# Open licences only: isnet-general-use (Apache-2.0) and u2net_cloth_seg (MIT).
# Do NOT swap in RMBG-1.4 / RMBG-2.0: their licences forbid commercial use.
CUTOUT_MODEL = os.getenv("STYLIST_CUTOUT_MODEL", "isnet-general-use")
CLOTH_MODEL = os.getenv("STYLIST_CLOTH_MODEL", "u2net_cloth_seg")
WORN_THRESHOLD = float(os.getenv("STYLIST_WORN_THRESHOLD", "0.25"))
CLOSEUP_PARTS = int(os.getenv("STYLIST_CLOSEUP_PARTS", "5"))       # shattered cut-out = no clean dress outline
CLOSEUP_BGSAT = float(os.getenv("STYLIST_CLOSEUP_BGSAT", "0.40"))  # colourful fabric all around the cut-out = close-up
USE_CLOTH_CHECK = os.getenv("STYLIST_CLOTH_CHECK", "1") == "1"

BACKGROUNDS = {
    "pink":  {"top": (253, 243, 245), "bottom": (246, 220, 228)},
    "cream": {"top": (255, 248, 241), "bottom": (245, 230, 218)},
    "white": {"top": (255, 255, 255), "bottom": (244, 238, 240)},
}
INK = (43, 22, 32)

_sessions: dict = {}


def _session(name: str):
    """One shared ONNX session per model. The memory-arena settings matter a lot:
    without them two models grew past 3.5 GB; with them they stay near 0.9 GB."""
    from rembg import new_session
    import onnxruntime as ort
    if name not in _sessions:
        so = ort.SessionOptions()
        so.enable_cpu_mem_arena = False
        so.enable_mem_pattern = False
        so.intra_op_num_threads = int(os.getenv("STYLIST_THREADS", "2"))
        so.inter_op_num_threads = 1
        _sessions[name] = new_session(name, sess_opts=so)
    return _sessions[name]


@dataclass
class Result:
    mode_used: str = "auto"          # hanging | flat | worn | closeup
    styled_ok: bool = True           # False = do NOT use the styled picture; keep the original
    hanger_added: bool = False
    worn_score: float = 0.0
    coverage: float = 0.0
    parts: int = 0
    bg_saturation: float = 0.0
    quality: str = "good"            # good | fair | poor
    warnings: list = field(default_factory=list)
    seconds: float = 0.0
    background: str = "pink"

    def to_dict(self):
        return asdict(self)


# ----------------------------------------------------------------- loading
def load_image(data: bytes) -> Image.Image:
    try:
        import pillow_heif  # optional: iPhone HEIC photos
        pillow_heif.register_heif_opener()
    except Exception:
        pass
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)          # respect phone rotation
    img = img.convert("RGB")
    w, h = img.size
    s = MAX_INPUT_SIDE / max(w, h)
    if s < 1:
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return img


# ------------------------------------------------------------------ masks
def predict_mask(img: Image.Image, model: str) -> np.ndarray:
    from rembg import remove
    out = remove(img, session=_session(model), only_mask=True, post_process_mask=True)
    arr = np.array(out.convert("L"))
    w, h = img.size
    if arr.shape[0] == 3 * h and arr.shape[1] == w:   # cloth model returns 3 stacked masks
        arr = np.max(np.stack([arr[0:h], arr[h:2 * h], arr[2 * h:3 * h]]), axis=0)
    return arr


def clean_mask(raw: np.ndarray, rgb=None):
    """Keep the main object, drop specks, fill holes, soften the edge.
    rgb (optional, the photo as an array) lets us fill bigger holes safely: a hole is filled when its
    colour is one of the dress's own colours (a light patch of print that the model took for floor), and
    left open when it matches the floor (the gap between a belt and the dress)."""
    m = raw >= 128
    labels, n = ndi.label(m)
    if n == 0:
        return np.zeros(raw.shape, np.float32), 0
    sizes = ndi.sum(m, labels, index=np.arange(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.04 * sizes.max()]
    m = np.isin(labels, keep)
    holes, hn = ndi.label(~m)
    if hn:
        hs = ndi.sum(~m, holes, index=np.arange(1, hn + 1))
        border = set(np.unique(np.concatenate([holes[0], holes[-1], holes[:, 0], holes[:, -1]])))
        small = 0.004 * m.size
        big = 0.08 * m.sum()                       # enclosed holes up to 8% of the dress area are candidates
        bg_col, dress_cols = None, None
        if rgb is not None and m.sum() > 500:
            arr = np.asarray(rgb, np.float32)
            far = ~ndi.binary_dilation(m, iterations=10)
            if far.any():
                bg_col = np.median(arr[far], axis=0)
                pts = arr[m][:: max(1, int(m.sum() // 6000))]
                dress_cols, _ = kmeans2(pts, 6, minit="++", seed=0)   # the dress's main colours
        for i, size in enumerate(hs, start=1):
            if i in border:
                continue
            region = holes == i
            if size < small:
                m[region] = True
            elif size < big and bg_col is not None:
                c = arr[region].mean(axis=0)
                to_dress = np.linalg.norm(dress_cols - c, axis=1).min()
                to_floor = np.linalg.norm(c - bg_col)
                if to_dress < 0.7 * to_floor:      # clearly dress-coloured: fill. Floor-coloured gaps stay open.
                    m[region] = True
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.9)
    alpha = np.clip((alpha - 0.2) / 0.8, 0, 1)
    return alpha, len(keep)


def defringe(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Pull edge colours from inside the dress so old background colour does not show."""
    core = ndi.binary_erosion(alpha > 0.98, iterations=2)
    w = ndi.gaussian_filter(core.astype(np.float32), 3)
    out = rgb.copy()
    edge = (alpha < 0.98) & (w > 0.02)
    for c in range(3):
        est = ndi.gaussian_filter(rgb[..., c] * core, 3) / np.maximum(w, 1e-3)
        out[..., c][edge] = est[edge]
    return out


# ------------------------------------------------------------- detection
def analyze(img: Image.Image, subject_alpha: np.ndarray):
    """Returns (worn_score, hanger_above, cloth_at_edges).
    worn_score: 0 = only clothing in the picture, 1 = mostly person. Tune WORN_THRESHOLD with real photos.
    hanger_above: something that is not clothing sticks out above the dress (a hanger or hook).
    cloth_at_edges: share of the photo's outer border that is fabric. A whole dress on a plain
      background scores about 0. A close-up of fabric that fills the frame scores 0.2 to 0.6."""
    if not USE_CLOTH_CHECK:
        return 0.0, False, 0.0
    cloth = predict_mask(img, CLOTH_MODEL) >= 128
    subject = subject_alpha > 0.5
    h, w = cloth.shape
    b = max(2, int(min(h, w) * 0.06))
    strip = np.zeros_like(cloth)
    strip[:b] = strip[-b:] = True
    strip[:, :b] = strip[:, -b:] = True
    cloth_at_edges = float((cloth & strip).sum() / strip.sum())
    sub_area = subject.sum()
    if sub_area == 0:
        return 0.0, False, cloth_at_edges
    score = float(max(0.0, 1.0 - (cloth & subject).sum() / sub_area))
    rows_c = np.where(cloth.any(axis=1))[0]
    rows_s = np.where(subject.any(axis=1))[0]
    hanger_above = False
    if len(rows_c) and len(rows_s):
        height = max(1, rows_s.max() - rows_s.min())
        if (rows_c.min() - rows_s.min()) > 0.08 * height:
            # something sticks out above the clothing. A hanger hook is thin, near the middle and small.
            # Sleeve ruffles and shoulders that the clothing model missed are wide or off to the sides.
            above = subject.copy()
            above[rows_c.min():] = False
            cols = np.where(cloth.any(axis=0))[0]
            gcx, gw = (cols.min() + cols.max()) / 2.0, max(1, cols.max() - cols.min() + 1)
            xs = np.where(above.any(axis=0))[0]
            if len(xs):
                cx = xs.mean()
                max_row_w = above.sum(axis=1).max()
                hanger_above = (abs(cx - gcx) < 0.2 * gw and max_row_w <= 0.30 * gw
                                and above.sum() < 0.03 * sub_area)
    return score, hanger_above, cloth_at_edges


def background_saturation(img: Image.Image, alpha: np.ndarray) -> float:
    """Average colour saturation of everything OUTSIDE the cut-out. A whole dress on a floor or a sheet
    gives about 0.05 to 0.20. A close-up, where fabric fills the frame, gives 0.4 or more."""
    m = alpha > 0.5
    bg = ~ndi.binary_dilation(m, iterations=12)
    if not bg.any():
        return 1.0
    rgb = np.asarray(img, np.float32) / 255.0
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-3), 0.0)
    return float(sat[bg].mean())


def _touches_border(alpha: np.ndarray) -> int:
    m = alpha > 0.5
    return int(m[0].any()) + int(m[-1].any()) + int(m[:, 0].any()) + int(m[:, -1].any())


# ------------------------------------------------------------ drawing
def _bez(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1])
            for t in (i / n for i in range(n + 1))]


def draw_hanger(layer: Image.Image, apex: tuple, s: float):
    """Wooden hanger. apex = point where the arms meet; s = scale (1 = 300px between arm ends)."""
    ss = 3
    big = Image.new("RGBA", (layer.width * ss, layer.height * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)

    def P(x, y):
        return ((apex[0] + x * s) * ss, (apex[1] + y * s) * ss)

    hook = [(0, 2), (0, -34)] + _bez((0, -34), (0, -56), (20, -64))[1:] \
        + _bez((20, -64), (44, -76), (34, -100))[1:] + _bez((34, -100), (24, -120), (0, -110))[1:]
    arms = [(-150, 56), (0, 0), (150, 56)]

    def stroke(points, width, color):
        pts = [P(*p) for p in points]
        d.line(pts, fill=color, width=max(1, round(width * s * ss)), joint="curve")
        r = width * s * ss / 2
        for x, y in (pts[0], pts[-1]):
            d.ellipse((x - r, y - r, x + r, y + r), fill=color)

    stroke(hook, 9, (176, 134, 88, 255))
    stroke(arms, 12, (176, 134, 88, 255))
    stroke([(x, y - 2.5) for x, y in hook], 3, (217, 185, 138, 255))
    stroke([(x, y - 3) for x, y in arms], 4, (217, 185, 138, 255))
    layer.alpha_composite(big.resize(layer.size, Image.LANCZOS))


def make_background(name: str) -> Image.Image:
    c = BACKGROUNDS.get(name, BACKGROUNDS["pink"])
    t = np.linspace(0, 1, CANVAS_H, dtype=np.float32)[:, None, None]
    top, bot = np.array(c["top"], np.float32), np.array(c["bottom"], np.float32)
    grad = top + (bot - top) * t
    arr = np.broadcast_to(grad, (CANVAS_H, CANVAS_W, 3)).astype(np.uint8)
    bg = Image.fromarray(arr).convert("RGBA")
    glow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    r = int(CANVAS_W * 0.425)
    cx, cy = CANVAS_W // 2, int(CANVAS_H * 0.54)
    ImageDraw.Draw(glow).ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 97))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(2)))
    return bg


def _shadow(layer_size, alpha_img: Image.Image, pos):
    sh = Image.new("RGBA", layer_size, (0, 0, 0, 0))
    a = alpha_img.point(lambda v: int(v * 0.20))
    blob = Image.new("RGBA", alpha_img.size, INK + (0,))
    blob.putalpha(a)
    sh.alpha_composite(blob, (pos[0] + 6, pos[1] + 18))
    return sh.filter(ImageFilter.GaussianBlur(22))


# ----------------------------------------------------------------- main
def style_photo(data: bytes, mode: str = "auto", hanger: bool | None = None,
                background: str = "pink") -> tuple[bytes, Result]:
    t0 = time.time()
    res = Result(background=background if background in BACKGROUNDS else "pink")
    img = load_image(data)
    raw = predict_mask(img, CUTOUT_MODEL)
    alpha, parts = clean_mask(raw, np.asarray(img))
    res.parts = parts
    res.coverage = float((alpha > 0.5).mean())

    if res.coverage < 0.05 or res.coverage > 0.97 or parts == 0:
        res.quality, res.styled_ok = "poor", False
        res.warnings.append("We could not find the dress in this photo. Try a plainer background.")
    if _touches_border(alpha) >= 3:
        res.warnings.append("The dress looks cut off at the edge of the photo. Take the photo from further back.")
        res.quality = "fair" if res.quality == "good" else res.quality
    if parts > 3:
        res.warnings.append("The cut-out has several separate pieces. Use a plainer background.")
        res.quality = "fair" if res.quality == "good" else res.quality

    # No clean dress outline: a close-up of fabric, or a dress too similar to the floor or sheet.
    # We refuse to style these, because the result would be wrong. Keep the original instead.
    bg_sat = background_saturation(img, alpha)
    res.bg_saturation = round(bg_sat, 3)
    is_closeup = mode == "closeup" or parts >= CLOSEUP_PARTS or bg_sat >= CLOSEUP_BGSAT
    if is_closeup:
        res.mode_used, res.quality, res.styled_ok, res.hanger_added = "closeup", "poor", False, False
        res.warnings = ["We could not cleanly separate the dress from the background, so it was not styled. "
                        "This happens with close-ups of the fabric, and when the dress is almost the same colour "
                        "as the floor or sheet. Keep this as a detail photo. For the styled picture, lay the dress "
                        "flat on a plain sheet that contrasts with its colour (a light dress on a darker sheet, "
                        "a dark dress on a light one), from above, with space around it."]
        out = ImageOps.fit(img, (CANVAS_W, CANVAS_H), Image.LANCZOS, centering=(0.5, 0.5))   # plain 4:5 crop, colours untouched
        buf = io.BytesIO(); out.save(buf, "WEBP", quality=88, method=4)
        res.seconds = round(time.time() - t0, 2)
        return buf.getvalue(), res

    hanger_above = False
    if mode == "auto":
        score, hanger_above, _ = analyze(img, alpha)
        res.worn_score = round(score, 3)

    # decide what kind of photo it is
    if mode == "auto":
        if res.worn_score >= WORN_THRESHOLD:
            res.mode_used = "worn"
        else:
            res.mode_used = "hanging" if hanger_above else "flat"
    else:
        res.mode_used = mode if mode in ("hanging", "flat", "worn") else "flat"
        res.worn_score = 0.0
    add_hanger = (res.mode_used == "flat") if hanger is None else bool(hanger)
    if res.mode_used == "worn":
        add_hanger = False
        res.warnings.append("This photo shows a person, so the hanger style was skipped. "
                            "A dress on a hanger or laid flat gives the best result.")
    res.hanger_added = add_hanger

    # cut-out
    rgb = defringe(np.array(img, np.float32), alpha)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    cut = Image.fromarray(rgba, "RGBA")
    box = cut.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if not box:
        res.quality, res.styled_ok = "poor", False
        out = make_background(res.background).convert("RGB")
        buf = io.BytesIO(); out.save(buf, "WEBP", quality=86)
        res.seconds = round(time.time() - t0, 2)
        return buf.getvalue(), res
    cut = cut.crop(box)
    gw, gh = cut.size

    # layout
    top_margin = 0.22 if add_hanger else 0.08
    box_w, box_h = CANVAS_W * 0.80, CANVAS_H * (0.93 - top_margin)
    sc = min(box_w / gw, box_h / gh)
    nw, nh = max(1, round(gw * sc)), max(1, round(gh * sc))
    cut = cut.resize((nw, nh), Image.LANCZOS)
    x = (CANVAS_W - nw) // 2
    y = round(CANVAS_H * top_margin) if add_hanger else round((CANVAS_H - nh) / 2)
    if not add_hanger:
        y = max(round(CANVAS_H * 0.06), min(y, CANVAS_H - nh - round(CANVAS_H * 0.07)))

    canvas = make_background(res.background)
    a = cut.getchannel("A")
    # soft floor shadow under the dress
    floor = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    fy = y + nh + 6
    ImageDraw.Draw(floor).ellipse((CANVAS_W // 2 - nw * 0.38, fy - 14, CANVAS_W // 2 + nw * 0.38, fy + 22),
                                  fill=INK + (60,))
    canvas.alpha_composite(floor.filter(ImageFilter.GaussianBlur(16)))

    if add_hanger:
        # find shoulders: width of the dress about 14% down from its top edge
        am = np.array(a) > 128
        row = am[min(nh - 1, int(nh * 0.14))]
        xs = np.where(row)[0]
        sh_w = (xs.max() - xs.min()) if len(xs) else nw * 0.6
        top_rows = np.where(am[: max(2, int(nh * 0.12))].any(axis=0))[0]
        cx = x + (top_rows.mean() if len(top_rows) else nw / 2)
        arms_y = y + nh * 0.035
        s = min(sh_w * 0.72 / 300.0, (arms_y - CANVAS_H * 0.03) / 174.0)
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        draw_hanger(layer, (cx, arms_y - 56 * s), s)
        canvas.alpha_composite(layer)

    canvas.alpha_composite(_shadow(canvas.size, a, (x, y)))
    canvas.alpha_composite(cut, (x, y))

    out = canvas.convert("RGB")
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=86, method=4)
    res.seconds = round(time.time() - t0, 2)
    return buf.getvalue(), res
