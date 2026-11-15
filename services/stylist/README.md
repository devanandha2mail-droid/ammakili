# Nest photo stylist

Turns an ordinary photo of a dress into a styled product picture: the dress is cut out,
placed on the soft pink background with a wooden hanger and a gentle shadow, 1200x1500 WebP.

**The dress is never redrawn or recoloured.** Only the background and presentation change.
Because the shop has no returns, the customer must see the real product. Always keep the
original photo as the second gallery image.

## What it does

| Photo type | What happens |
|---|---|
| Hanging (hanger already in the photo) | Keeps the photo's own hanger. No second hanger. |
| Laid flat on a bed or table | Adds the wooden hanger so it looks hung. |
| Worn or held by a person | Keeps the person, cleans the background, **skips the hanger**, warns the admin. |
| **Close-up of fabric, or a dress that cannot be separated from the floor** | **Cannot be styled.** Returns a plain 4:5 crop, `mode_used: closeup`, `styled_ok: false`, and a message for the admin. Keep it as a detail photo. |

`mode=auto` guesses the type. The admin can override it, and can force the hanger on or off.
**`styled_ok: false` means: do not put the styled picture in the gallery.** Keep the original (or the plain crop) instead.
Quality warnings come back with every result (dress cut off at the photo edge, no dress found,
cut-out in several pieces).

## Run it

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                                    # fast tests, no models needed
STYLIST_RUN_MODEL_TESTS=1 python -m pytest -q tests          # also runs the real models on the sample photos (about 2 minutes, 13 real photos)
python -m stylist.cli samples/flat.jpg out.webp --mode auto  # try one photo (first run downloads ~350 MB of models)
STYLIST_KEY=change-me uvicorn stylist.app:app --port 8001    # run the service
```

```bash
curl -X POST localhost:8001/style -H "X-Stylist-Key: change-me" \
  -F file=@photo.jpg -F mode=auto -F hanger=auto -F background=pink -o styled.webp -D -
```

Response body: the WebP. Header `X-Stylist-Meta`: JSON with `mode_used`, `hanger_added`, `worn_score`,
`coverage`, `parts`, `quality` (good, fair, poor), `warnings`, `seconds`, `background`.

Options: `mode` auto | hanging | flat | worn. `hanger` auto | yes | no. `background` pink | cream | white.
Errors: 401 wrong key, 413 file too big, 422 not an image or bad option.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `STYLIST_KEY` | empty | Shared secret. **Set it.** Sent as `X-Stylist-Key`. |
| `STYLIST_THREADS` | 2 | CPU threads per photo. More cores means faster. |
| `STYLIST_MAX_MB` | 15 | Largest upload accepted. |
| `STYLIST_WORN_THRESHOLD` | 0.25 | Above this score a photo counts as "worn". **Tune with real photos.** |
| `STYLIST_CLOSEUP_BGSAT` | 0.40 | Average colour saturation around the cut-out. Fabric all around (a close-up) scores 0.4 or more. A floor scores 0.05 to 0.2. |
| `STYLIST_CLOSEUP_PARTS` | 5 | A cut-out broken into this many pieces or more means there is no clean dress outline. |
| `STYLIST_CLOTH_CHECK` | 1 | 0 turns off the worn and hanger detection (saves about 200 MB RAM; auto then assumes flat). |

## Measured on a 1-core test server

- Memory: about 0.9 GB with both models loaded and stable over repeated photos. **Important:** the memory-arena
  settings in `_session()` are what keep it there. Without them two models grew past 3.5 GB.
- Time: about 13 to 20 seconds per photo on one slow core. Expect roughly half that or better on 2 to 4 cores.
- Plan for a server with **at least 2 GB RAM** (2 vCPU or more is better). A 512 MB host will crash.
- Photos are processed one at a time, in a queue.

## Models and licences

- `isnet-general-use` (cut-out): Apache-2.0.
- `u2net_cloth_seg` (worn and hanger detection): MIT.
- **Do not swap in RMBG-1.4 or RMBG-2.0.** Their licences do not allow commercial use.
- Please re-check the current licences on the model pages before launch.

## Privacy

Everything runs on your own server. No photo is sent to any third-party service.
Run it so that only the web app can reach it (do not publish port 8001).

## Known limits (be honest with the client)

- Results depend on the photo. Plain background, whole dress in frame, good daylight = best.
- Busy backgrounds, a dress the same colour as the wall, or a dress cut off at the edge give fair or poor results.
  The service says so in `warnings`, and the admin can choose "use original only".
- Worn photos keep the person and have no hanger. For the full hanger look, photograph the dress hanging or flat.
- **Tested on the client's real photos.** 5 close-ups of folded dresses: all refused. 5 flat-lay photos of whole dresses on a
  pale floor: 4 styled correctly (red, cream with red flowers, green leaf print, navy print). 1 refused: a cream dress on a
  white floor, where the dress and floor are almost the same colour, so there is no outline to find.
  The refused photo is kept as the original. The photo guide tells the client to use a sheet that contrasts with the dress.
- Early versions cut out print motifs instead of the dress, wrongly rejected tightly framed dresses, guessed "already on a
  hanger" for a dress with ruffled sleeves, and left white holes in a green dress. All are fixed and covered by tests.
- Whole-dress detection thresholds were tested on synthetic photos only. Tune `STYLIST_WORN_THRESHOLD` with 20 or more real photos.
- Fine lace, fringes and sheer fabric can lose detail at the edges.
