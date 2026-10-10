"""Render the illustrative images attached to DEMO cases.

These are synthetic scenes drawn from noise and simple shapes. They are not photographs and
show no real place, project or person. Each image carries a burned-in label saying so.

    python3 server/scripts/demo-images/render.py        # needs Pillow and numpy

The output is deterministic for a given Pillow and numpy version.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1600, 1200
OUT = (1200, 900)
HERE = Path(__file__).parent
LABEL = 'DEMO IMAGE: illustrative render, not a photograph of any real site'
FONTS = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def fbm(rng, base=4, octaves=6, persistence=0.55, stretch=(1.0, 1.0), size=(W, H)):
    """Fractal value noise in [0, 1]."""
    w, h = size
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        nx = max(2, int(base * 2 ** o * stretch[0]))
        ny = max(2, int(base * 2 ** o * stretch[1] * h / w))
        grid = (rng.random((ny, nx)) * 255).astype(np.uint8)
        out += amp * np.asarray(Image.fromarray(grid).resize((w, h), Image.BICUBIC), np.float32) / 255
        total += amp
        amp *= persistence
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def rgb(*c):
    return np.array(c, np.float32)


def over(img, colour, alpha):
    a = np.clip(alpha, 0, 1)[..., None]
    return img * (1 - a) + (colour if np.ndim(colour) == 3 else np.asarray(colour, np.float32)[None, None, :]) * a


def mask(draw_fn, blur=0.0):
    m = Image.new('L', (W, H), 0)
    draw_fn(ImageDraw.Draw(m))
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m, np.float32) / 255


def blur(arr, radius):
    return np.asarray(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255


def render(seed, *, haze, sky_top, net, sheet, mirror, plume_x, plume_strength, sun_x, grade, tower_w=0.40):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = xx / W, yy / H
    horizon = 0.63
    haze = rgb(*haze)

    # Sky: brighter and warmer toward the horizon, a wide glow where the sun sits behind the haze.
    t = np.clip(v / horizon, 0, 1)[..., None] ** 1.4
    img = rgb(*sky_top)[None, None, :] * (1 - t) + (haze * 1.08)[None, None, :] * t
    glow = np.exp(-(((u - sun_x) / 0.42) ** 2 + ((v - 0.22) / 0.34) ** 2))
    img = over(img, rgb(1.0, 0.96, 0.86), glow * 0.55)
    img *= (0.94 + 0.10 * fbm(rng, 3, 5))[..., None]

    # Far skyline, almost lost in the haze.
    far = np.zeros((H, W), np.float32)
    x = -40
    while x < W:
        bw = int(rng.uniform(70, 190))
        bh = rng.uniform(0.10, 0.36) * H
        far[int(horizon * H - bh):int(horizon * H), max(0, x):x + bw] = rng.uniform(0.35, 0.8)
        x += bw + int(rng.uniform(-10, 40))
    far = blur(far, 2.2)
    img = over(img, haze * 0.80, far * 0.42)
    windows = ((np.sin(xx * 0.55) > 0.2) & (np.sin(yy * 0.42) > 0.1)).astype(np.float32)
    img = over(img, haze * 0.62, far * windows * 0.10)

    # A tower crane behind the structure.
    cx = int((0.60 if tower_w < 0.45 else 0.66) * W)
    crane = mask(lambda d: (
        [d.line([(cx - 13, int(0.64 * H)), (cx - 13, int(0.045 * H))], 255, 4), d.line([(cx + 13, int(0.64 * H)), (cx + 13, int(0.045 * H))], 255, 4)],
        [d.line([(cx - 13, y), (cx + 13, y + 34)], 255, 2) for y in range(int(0.05 * H), int(0.64 * H), 34)],
        [d.line([(cx + 13, y), (cx - 13, y + 34)], 255, 2) for y in range(int(0.05 * H), int(0.64 * H), 34)],
        d.line([(cx - int(0.46 * W), int(0.075 * H)), (cx + int(0.14 * W), int(0.075 * H))], 255, 6),
        d.line([(cx - int(0.46 * W), int(0.094 * H)), (cx + int(0.14 * W), int(0.094 * H))], 255, 3),
        [d.line([(x0, int(0.075 * H)), (x0 + 22, int(0.094 * H))], 255, 2) for x0 in range(cx - int(0.46 * W), cx + int(0.14 * W), 22)],
        d.line([(cx, int(0.02 * H)), (cx - int(0.30 * W), int(0.075 * H))], 255, 2),
        d.line([(cx, int(0.02 * H)), (cx + int(0.13 * W), int(0.075 * H))], 255, 2),
        d.rectangle([cx + int(0.09 * W), int(0.094 * H), cx + int(0.135 * W), int(0.125 * H)], 255),
        d.line([(cx - int(0.25 * W), int(0.094 * H)), (cx - int(0.25 * W), int(0.30 * H))], 255, 2),
    ), blur=0.9)
    img = over(img, rgb(0.63, 0.55, 0.33), crane * 0.62)

    # The structure: a concrete frame, front face lit, side face in shade.
    x0, x1 = int(0.13 * W), int((0.13 + tower_w) * W)
    top, base = int(0.10 * H), int(0.69 * H)
    side = int(0.085 * W)
    floors = 11
    fh = (base - top) / floors
    bays = 7
    bw = (x1 - x0) / bays
    concrete = rgb(0.58, 0.56, 0.52)
    grime = fbm(rng, 6, 6, stretch=(1.0, 0.25))
    front = mask(lambda d: d.rectangle([x0, top, x1, base], 255))
    img = over(img, concrete[None, None, :] * (0.80 + 0.30 * grime[..., None]), front)
    side_poly = [(x1, top), (x1 + side, top + int(0.035 * H)), (x1 + side, base - int(0.012 * H)), (x1, base)]
    side_m = mask(lambda d: d.polygon(side_poly, 255))
    img = over(img, concrete[None, None, :] * (0.50 + 0.18 * grime[..., None]), side_m)

    openings = np.zeros((H, W), np.float32)
    brick = np.zeros((H, W), np.float32)
    for f in range(floors):
        fy0, fy1 = int(top + f * fh + fh * 0.20), int(top + (f + 1) * fh - 2)
        for b in range(bays):
            bx0, bx1 = int(x0 + b * bw + bw * 0.10), int(x0 + (b + 1) * bw - bw * 0.10)
            roll = rng.random()
            if roll < 0.24 and f > 2:
                brick[fy0:fy1, bx0:bx1] = rng.uniform(0.7, 1.0)
            elif roll < 0.30:
                brick[fy0 + int((fy1 - fy0) * 0.45):fy1, bx0:bx1] = rng.uniform(0.7, 1.0)
                openings[fy0:fy0 + int((fy1 - fy0) * 0.45), bx0:bx1] = 1
            else:
                openings[fy0:fy1, bx0:bx1] = rng.uniform(0.78, 1.0)
        # Side face: openings foreshortened.
        for b in range(2):
            sx0 = x1 + int(side * (0.10 + b * 0.47))
            sx1 = x1 + int(side * (0.43 + b * 0.47))
            drop = int(0.035 * H * (sx0 - x1) / side * (1 - f / floors))
            openings[fy0 + drop:fy1 + drop, sx0:sx1] = 0.9
    depth = np.clip(1.15 - (v - top / H) * 0.5, 0.6, 1.2)
    img = over(img, rgb(0.17, 0.16, 0.16), blur(openings, 1.0) * 0.86 * depth)
    brick_tex = 0.85 + 0.3 * fbm(rng, 40, 3)
    img = over(img, rgb(0.52, 0.30, 0.22)[None, None, :] * brick_tex[..., None], blur(brick, 1.0) * 0.9)
    # Slab edges catch the light; rain streaks run down from them.
    slabs = mask(lambda d: [d.rectangle([x0 - 6, int(top + f * fh), x1 + 2, int(top + f * fh + fh * 0.13)], 255) for f in range(floors + 1)])
    img = over(img, rgb(0.71, 0.69, 0.64), slabs * 0.85)
    streaks = fbm(rng, 90, 3, stretch=(1.0, 0.03)) ** 3
    img = over(img, rgb(0.22, 0.21, 0.20), streaks * (front + side_m) * 0.45)
    # Rebar and a parapet of props on the unfinished top floor.
    props = mask(lambda d: [d.line([(x, top), (x + rng.integers(-5, 6), top - rng.integers(24, 70))], 255, 2) for x in range(x0 + 10, x1, 13)], blur=0.6)
    img = over(img, rgb(0.30, 0.25, 0.22), props * 0.8)

    # Safety netting over part of the frame, sagging in folds and torn along its lower edge.
    nx0, nx1 = x0 + int((x1 - x0) * rng.uniform(0.30, 0.42)), x1 + int(side * 0.6)
    ny0, ny1 = top - 8, top + int((base - top) * rng.uniform(0.52, 0.66))
    edge = fbm(rng, 14, 4, stretch=(1.0, 0.05))
    folds = fbm(rng, 60, 4, stretch=(1.0, 0.04))
    net_m = ((xx > nx0 + (edge - 0.5) * 60) & (xx < nx1) & (yy > ny0) & (yy < ny1 + (edge - 0.5) * 260)).astype(np.float32)
    holes = (fbm(rng, 9, 5) > 0.70).astype(np.float32)
    net_m = blur(net_m * (1 - holes * 0.8), 1.6)
    net_c = rgb(*net)[None, None, :] * (0.55 + 0.75 * folds[..., None]) * (1.05 - 0.35 * np.clip((xx - x1) / side, 0, 1)[..., None])
    img = over(img, net_c, net_m * 0.80)

    # Scaffolding on the lower floors.
    sy0 = top + int((base - top) * 0.50)
    scaffold = mask(lambda d: (
        [d.line([(x + rng.integers(-3, 4), sy0 + rng.integers(-18, 10)), (x + rng.integers(-3, 4), base)], 255, 3) for x in range(x0 - 14, x1 + 10, 42)],
        [d.line([(x0 - 22, y + rng.integers(-3, 4)), (x1 + 16, y + rng.integers(-3, 4))], 255, 3) for y in range(sy0 + 12, base, int(fh * 0.5))],
        [d.line([(x, y), (x + 84, y + int(fh))], 255, 2) for x in range(x0 - 14, x1 - 60, 168) for y in range(sy0 + 12, base - int(fh), int(fh))],
    ), blur=0.7)
    img = over(img, rgb(0.50, 0.40, 0.25), scaffold * 0.78)

    # A finished, lived-in building at the frame edge, nearer the camera.
    rx0 = int(0.80 * W)
    r_top = int(0.19 * H)
    wall = fbm(rng, 5, 5, stretch=(1.0, 0.3))
    right = mask(lambda d: d.rectangle([rx0, r_top, W, int(0.70 * H)], 255))
    img = over(img, rgb(0.74, 0.66, 0.54)[None, None, :] * (0.76 + 0.28 * wall[..., None]), right)
    for f in range(9):
        y0 = r_top + 34 + f * 62
        for x in range(rx0 + 26, W - 30, 96):
            lit = rng.random() < 0.15
            img[y0:y0 + 36, x:x + 46] = rgb(0.62, 0.52, 0.34) if lit else rgb(0.19, 0.21, 0.23) * rng.uniform(0.8, 1.2)
            img[y0 + 38:y0 + 43, x - 8:x + 54] = rgb(0.50, 0.45, 0.38)
            if rng.random() < 0.3:
                tone = rng.uniform(0.34, 0.5)
                img[y0 + 10:y0 + 34, x + 4:x + 26] = rgb(tone * 1.12, tone, tone * 0.86)
    img = over(img, rgb(0.20, 0.19, 0.18), fbm(rng, 70, 3, stretch=(1.0, 0.03)) ** 3 * right * 0.5)

    # Distance haze over everything built so far, thicker toward the ground.
    img = over(img, haze, 0.20 + 0.30 * np.clip((v - 0.15) / (horizon - 0.15), 0, 1) ** 1.6)

    # Ground: a road running away from the camera, dirt shoulder on the site side.
    gy = int(0.69 * H)
    pv = np.clip((v - 0.69) / 0.31, 0, 1)
    ground = pv > 0
    row_scale = 0.25 + pv * 1.6
    ground_noise = fbm(rng, 10, 6, stretch=(1.0, 4.0))
    asphalt = rgb(0.40, 0.38, 0.36)[None, None, :] * (0.72 + 0.4 * ground_noise[..., None])
    dirt = rgb(0.62, 0.52, 0.38)[None, None, :] * (0.72 + 0.45 * fbm(rng, 16, 6, stretch=(1.0, 3.0))[..., None])
    road_edge = 0.52 - (pv * 0.30) + (fbm(rng, 8, 4, stretch=(0.2, 4.0)) - 0.5) * 0.10
    is_road = (u > road_edge).astype(np.float32)
    surface = asphalt * blur(is_road, 5)[..., None] + dirt * (1 - blur(is_road, 5)[..., None])
    dusting = fbm(rng, 5, 6, stretch=(1.0, 2.0))
    surface = over(surface, rgb(0.70, 0.60, 0.44), np.clip(dusting * 1.5 - 0.45, 0, 1) * 0.75)
    tracks = (np.sin((u - 0.5) / (row_scale * 0.9) * 60 + ground_noise * 3) > 0.86) * (pv > 0.12) * is_road
    surface = over(surface, rgb(0.28, 0.26, 0.24), blur(tracks.astype(np.float32), 2.5) * 0.28)
    img = np.where(ground[..., None], surface, img)

    # Tin-sheet barricade along the frontage.
    by0, by1 = int(0.585 * H), int(0.725 * H)
    bx1 = int((0.13 + tower_w + 0.05) * W)
    sheet_m = mask(lambda d: d.polygon([(0, by0 - 14), (bx1, by0 + 12), (bx1, by1 - 16), (0, by1 + 12)], 255))
    corrugation = 0.80 + 0.22 * np.sin(xx * 0.50)
    panel = 0.86 + 0.24 * np.repeat(rng.random(W // 96 + 2), 96)[:W][None, :]
    rust = np.clip(fbm(rng, 12, 5, stretch=(1.0, 0.3)) * 2.0 - 1.0, 0, 1) * np.clip((v - by0 / H) / 0.13, 0, 1)
    sheet_c = rgb(*sheet)[None, None, :] * (corrugation * panel)[..., None]
    sheet_c = over(sheet_c, rgb(0.52, 0.40, 0.28), rust * 0.85)
    img = over(img, sheet_c, sheet_m)
    gate = mask(lambda d: d.rectangle([int(bx1 * 0.62), by0 + 8, int(bx1 * 0.80), by1 - 6], 255), blur=1.2)
    img = over(img, rgb(0.26, 0.23, 0.20), gate * 0.92)
    img = over(img, rgb(0.14, 0.13, 0.12), mask(lambda d: d.polygon([(0, by1 + 12), (bx1, by1 - 16), (bx1 + 60, by1 + 6), (0, by1 + 46)], 255), blur=9) * 0.42)

    # Uncovered debris: mounds of rubble and soil by the gate.
    def mound(cx, cy, rw, rh, colour):
        nonlocal img
        ridge = fbm(rng, 18, 5, stretch=(1.0, 0.2))
        profile = np.clip(1 - ((u - cx) / rw) ** 2, 0, 1) ** 0.8 * rh * (0.75 + 0.5 * ridge)
        m = blur(((v > cy - profile) & (v < cy + 0.012) & (profile > 0)).astype(np.float32), 1.6)
        speckle = 0.62 + 0.75 * fbm(rng, 120, 3)
        shade = 0.78 + 0.5 * np.clip((cx - u) / rw * (-1 if sun_x < 0.5 else 1), -0.5, 0.5)
        img = over(img, rgb(*colour)[None, None, :] * (speckle * shade)[..., None], m)
    mound(plume_x - 0.02, 0.785, 0.17, 0.115, (0.50, 0.42, 0.33))
    mound(plume_x + 0.11, 0.80, 0.11, 0.070, (0.46, 0.41, 0.37))
    mound(plume_x - 0.14, 0.775, 0.08, 0.050, (0.56, 0.47, 0.35))

    # Utility pole and sagging lines across the street.
    pole_x = int(0.735 * W)
    pole = mask(lambda d: (d.line([(pole_x, int(0.16 * H)), (pole_x + 5, int(0.83 * H))], 255, 11), d.line([(pole_x - 62, int(0.20 * H)), (pole_x + 62, int(0.195 * H))], 255, 7)), blur=0.9)
    img = over(img, rgb(0.24, 0.22, 0.20), pole * 0.9)
    wires = mask(lambda d: [d.line([(x, int(H * (0.20 + k * 0.012 + 0.07 * ((x / W - 0.3) ** 2) + (0.03 if x > pole_x else 0) * ((x - pole_x) / W)))) for x in range(-10, W + 20, 20)], 255, 2) for k in range(3)], blur=0.6)
    img = over(img, rgb(0.20, 0.19, 0.18), wires * 0.6)

    # Dust: a plume lifting off the debris and drifting down the street, plus a low layer.
    billow = fbm(rng, 5, 7, 0.58)
    fine = fbm(rng, 22, 5)
    drift = 0.22 if sun_x < 0.5 else -0.22
    lift = np.clip((0.86 - v) / 0.55, 0, 1)
    centre = plume_x + drift * lift ** 1.2
    width = 0.10 + 0.34 * lift
    envelope = np.exp(-((u - centre) / width) ** 2) * np.clip((v - 0.20) / 0.25, 0, 1) * np.clip((0.93 - v) / 0.10, 0, 1)
    plume = np.clip((billow * 0.75 + fine * 0.25) * 1.9 - 0.52, 0, 1) * envelope
    low = np.exp(-((v - 0.76) / 0.085) ** 2) * (0.35 + 0.65 * fbm(rng, 4, 6, stretch=(1.0, 3.0)))
    dust = np.clip(plume * plume_strength + low * 0.50 * plume_strength, 0, 0.93)
    dust = blur(dust, 7)
    lit = 0.90 + 0.25 * blur(billow, 12)
    img = over(img, rgb(0.84, 0.74, 0.56)[None, None, :] * lit[..., None], dust)

    # Camera: soft lens, bloom from the bright sky, a colour grade, vignette and sensor noise.
    img = np.clip(img, 0, 1)
    soft = blur(img, 1.5)
    bloom = blur(np.clip(img - 0.72, 0, 1), 28)
    img = np.clip(soft + bloom * 0.9, 0, 1)
    img = img ** rgb(*grade)[None, None, :]
    img = (img - 0.5) * 1.08 + 0.5
    vignette = 1 - 0.32 * (((u - 0.5) / 0.75) ** 2 + ((v - 0.5) / 0.75) ** 2)
    img *= vignette[..., None]
    luma = rng.normal(0, 0.020, (H, W, 1)).astype(np.float32)
    chroma = rng.normal(0, 0.010, (H, W, 3)).astype(np.float32)
    img = np.clip(img + luma + chroma, 0, 1)
    if mirror:
        img = img[:, ::-1]

    out = Image.fromarray((img * 255).astype(np.uint8)).resize(OUT, Image.LANCZOS)
    # The label is part of the pixels, so it travels with the file wherever it is opened.
    band = Image.new('RGBA', OUT, (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    font = next((ImageFont.truetype(p, 25) for p in FONTS if Path(p).exists()), ImageFont.load_default())
    d.rectangle([0, OUT[1] - 54, OUT[0], OUT[1]], (18, 26, 24, 205))
    d.text((22, OUT[1] - 41), LABEL, (255, 255, 255, 255), font=font)
    return Image.alpha_composite(out.convert('RGBA'), band).convert('RGB')


SCENES = {
    'demo-dust-1.jpg': dict(seed=11, haze=(0.86, 0.80, 0.68), sky_top=(0.66, 0.70, 0.74), net=(0.16, 0.44, 0.28), sheet=(0.20, 0.38, 0.56),
                            mirror=False, plume_x=0.40, plume_strength=1.0, sun_x=0.78, grade=(0.96, 1.0, 1.06)),
    'demo-dust-2.jpg': dict(seed=27, haze=(0.90, 0.78, 0.60), sky_top=(0.74, 0.68, 0.62), net=(0.14, 0.34, 0.52), sheet=(0.22, 0.44, 0.34),
                            mirror=True, plume_x=0.30, plume_strength=1.25, sun_x=0.25, grade=(0.92, 1.0, 1.12), tower_w=0.46),
    'demo-dust-3.jpg': dict(seed=43, haze=(0.82, 0.80, 0.74), sky_top=(0.62, 0.66, 0.70), net=(0.18, 0.42, 0.24), sheet=(0.55, 0.57, 0.58),
                            mirror=False, plume_x=0.47, plume_strength=0.8, sun_x=0.60, grade=(1.0, 1.0, 1.02), tower_w=0.36),
}

if __name__ == '__main__':
    for name, scene in SCENES.items():
        render(**scene).save(HERE / name, 'JPEG', quality=80, optimize=True, progressive=True)
        print(name, (HERE / name).stat().st_size)
