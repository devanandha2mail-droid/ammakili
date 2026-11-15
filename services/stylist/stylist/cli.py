"""Try it from the terminal:  python -m stylist.cli photo.jpg out.webp --mode auto --bg pink"""
import argparse, json
from .pipeline import style_photo

p = argparse.ArgumentParser()
p.add_argument("src"); p.add_argument("dst")
p.add_argument("--mode", default="auto", choices=["auto", "hanging", "flat", "worn"])
p.add_argument("--bg", default="pink", choices=["pink", "cream", "white"])
g = p.add_mutually_exclusive_group()
g.add_argument("--hanger", dest="hanger", action="store_true", default=None)
g.add_argument("--no-hanger", dest="hanger", action="store_false")
a = p.parse_args()
data, res = style_photo(open(a.src, "rb").read(), a.mode, a.hanger, a.bg)
open(a.dst, "wb").write(data)
print(json.dumps(res.to_dict(), indent=2))
