"""Slow tests that run the REAL models. Off by default.
Run with:  STYLIST_RUN_MODEL_TESTS=1 python -m pytest -q tests/test_real_photos.py"""
import glob, os
import pytest
from stylist.pipeline import style_photo

pytestmark = pytest.mark.skipif(os.getenv("STYLIST_RUN_MODEL_TESTS") != "1", reason="slow: needs the AI models")
HERE = os.path.dirname(os.path.dirname(__file__))


@pytest.mark.parametrize("path", sorted(glob.glob(os.path.join(HERE, "samples", "real-closeups", "*.jpeg"))))
def test_client_closeups_are_never_styled(path):
    """The client's real photos are close-ups of folded dresses. They must be kept as detail photos."""
    _, res = style_photo(open(path, "rb").read(), "auto")
    assert res.mode_used == "closeup" and res.styled_ok is False and res.warnings


@pytest.mark.parametrize("name,hanger", [("flat.jpg", True), ("hanging.jpg", False), ("worn.jpg", False)])
def test_whole_dress_photos_still_styled(name, hanger):
    _, res = style_photo(open(os.path.join(HERE, "samples", name), "rb").read(), "auto")
    assert res.styled_ok is True and res.hanger_added is hanger


FLAT = sorted(glob.glob(os.path.join(HERE, "samples", "real-flatlays", "*.jpeg")))


@pytest.mark.parametrize("path", [p for p in FLAT if "FAILS" not in p])
def test_client_flatlays_are_styled_with_a_hanger(path):
    """Real flat-lay photos from the client's phone: whole dress on a pale floor."""
    out, res = style_photo(open(path, "rb").read(), "auto")
    assert res.styled_ok is True and res.mode_used == "flat" and res.hanger_added is True and res.quality == "good"


def test_cream_dress_on_white_floor_is_refused_not_ruined():
    """Known limit: a cream dress on a white floor cannot be separated. It must be refused, never half-styled."""
    path = [p for p in FLAT if "FAILS" in p][0]
    _, res = style_photo(open(path, "rb").read(), "auto")
    assert res.styled_ok is False and res.warnings
