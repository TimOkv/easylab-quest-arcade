#!/usr/bin/env python3
"""Подготовка фонов квеста: 4 картинки → src/assets/rooms/{bedroom,kitchen,library,attic}.webp.

Разовый скрипт (в сборку не входит). Требует только Pillow:  python3 scripts/prep-rooms.py
Для каждой комнаты:
  1. вписывает исходник в сцену 1600×900 по правилу contain на тёмный фон исходника
     (если поля получились бы тоньше 16 px — растягивает на всю сцену, искажение < 1 %);
  2. применяет заплатки из PATCHES — координаты в пикселях готовой сцены 1600×900:
       ('fill',  box)          — залить цветом фона исходника (кнопки на чёрном поле);
       ('clone', box, dx, dy)  — закрыть область копией соседнего участка (котик на полу);
       ('heal',  box)          — залить гладкой смесью окружающих цветов (кнопки поверх стен/потолка).
     Края заплатки растушёваны, чтобы не было швов.
Идемпотентен: всегда читает исходники, результат перезаписывается. Превью с разметкой
заплаток:  python3 scripts/prep-rooms.py --preview <папка>
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'assets', 'rooms')
SRC_DIR = os.path.join(OUT_DIR, 'src')
W, H = 1600, 900
QUALITY = 82
FEATHER = 3  # px растушёвки края заплатки

# Исходник ищется сначала в src/assets/rooms/src/, затем в корне (до переноса).
SOURCES = {
    'bedroom': ['src/assets/room.jpg'],
    'kitchen': ['src/assets/rooms/src/IMG_0989.JPG', 'IMG_0989.JPG'],
    'library': ['src/assets/rooms/src/IMG_0993.JPG', 'IMG_0993.JPG'],
    'attic': ['src/assets/rooms/src/IMG_0991.JPG', 'IMG_0991.JPG'],
}

PATCHES = {
    'bedroom': [
        ('fill', (90, 8, 184, 98)),  # меню
        ('fill', (1296, 4, 1516, 78)),  # QR + рюкзак над стеной
        ('clone', (1296, 76, 1360, 112), -200, 0),  # низ QR поверх контура стены
        ('mirror', (1360, 76, 1516, 114)),  # правый угол стены — отражение левого
        ('clone', (698, 380, 792, 510), -100, 0),  # котик на полу
    ],
    'kitchen': [
        ('fill', (92, 8, 184, 84)),
        ('fill', (92, 84, 146, 94)),
        ('fill', (146, 84, 172, 92)),
        ('fill', (1302, 4, 1520, 70)),
        ('clone', (1302, 70, 1360, 112), -190, 0),
        ('mirror', (1360, 66, 1520, 112)),
        ('clone', (700, 378, 786, 502), -150, 0),  # котик перед шкафчиками: дверца 565–640 → 715–790
    ],
    'library': [
        ('heal', (6, 2, 116, 104)),
        # под QR/рюкзаком — бирюзовая стена и тёмный скос потолка, граница по диагонали
        ('split', (1356, 2, 1600, 122), (1440, 105, 1585, 235), (1300, 40), (1597, 60), (18, (1300, 8))),
        ('clone', (734, 452, 786, 600), 100, 0),  # котик у кресла-качалки: левая половина
        ('clone', (782, 452, 836, 600), 50, 0),  # правая половина (хвост)
    ],
    'attic': [
        # доски скоса идут по диагонали к краю картинки — клон со сдвигом их не продолжает,
        # поэтому гладкая заливка (угол потолка в тени, сверху его перекрывает HUD)
        ('heal', (86, 4, 190, 102)),
        ('heal', (1298, 2, 1522, 114)),
        ('clone', (700, 378, 748, 506), 94, 0),  # котик: левая половина (хвост)
        ('clone', (744, 378, 792, 506), 52, 0),  # котик: правая половина
    ],
}


def find_source(key: str) -> str:
    for rel in SOURCES[key]:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            return p
    raise SystemExit(f'нет исходника для {key}: {SOURCES[key]}')


def contain(im: Image.Image) -> tuple[Image.Image, tuple[int, int, int]]:
    w, h = im.size
    bg = im.getpixel((w - 3, h - 3))
    s = min(W / w, H / h)
    nw, nh = round(w * s), round(h * s)
    if W - nw < 16 and H - nh < 16:
        nw, nh = W, H
    out = Image.new('RGB', (W, H), bg)
    out.paste(im.resize((nw, nh), Image.LANCZOS), ((W - nw) // 2, (H - nh) // 2))
    return out, bg


def feather_mask(box: tuple[int, int, int, int], feather: int = FEATHER) -> Image.Image:
    """Маска всей сцены: 255 во всём box, мягкий спад на FEATHER px наружу."""
    m = Image.new('L', (W, H), 0)
    x1, y1, x2, y2 = box
    ImageDraw.Draw(m).rectangle((x1 - feather, y1 - feather, x2 + feather - 1, y2 + feather - 1), fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather / 2))


def heal_layer(img: Image.Image, box: tuple[int, int, int, int], iterations: int = 160) -> Image.Image:
    """Диффузия: дыра многократно размывается, а пиксели вокруг неё каждый раз возвращаются
    на место — внутрь box плавно «натекают» окружающие цвета."""
    x1, y1, x2, y2 = box
    pad = 24
    cx1, cy1, cx2, cy2 = max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad)
    orig = img.crop((cx1, cy1, cx2, cy2))
    hole = Image.new('L', orig.size, 0)
    ImageDraw.Draw(hole).rectangle((x1 - cx1, y1 - cy1, x2 - cx1 - 1, y2 - cy1 - 1), fill=255)
    work = orig.copy()
    ImageDraw.Draw(work).rectangle((x1 - cx1, y1 - cy1, x2 - cx1 - 1, y2 - cy1 - 1), fill=orig.getpixel((0, 0)))
    for i in range(iterations):
        work = work.filter(ImageFilter.GaussianBlur(6 if i < iterations // 2 else 2))
        work = Image.composite(work, orig, hole)
    layer = img.copy()
    layer.paste(work, (cx1, cy1))
    return layer


def apply_patch(img: Image.Image, bg: tuple[int, int, int], patch: tuple) -> Image.Image:
    kind, box = patch[0], patch[1]
    if kind == 'fill':
        layer = Image.new('RGB', (W, H), bg)
    elif kind in ('clone', 'clone_soft'):
        dx, dy = patch[2], patch[3]
        layer = img.copy()
        x1, y1, x2, y2 = box
        src = img.crop((x1 + dx - FEATHER * 2, y1 + dy - FEATHER * 2, x2 + dx + FEATHER * 2, y2 + dy + FEATHER * 2))
        layer.paste(src, (x1 - FEATHER * 2, y1 - FEATHER * 2))
    elif kind == 'heal':
        layer = heal_layer(img, box)
    elif kind == 'mirror':
        # Зеркальная копия симметричного угла комнаты: x → W - x (комната симметрична относительно центра сцены).
        x1, y1, x2, y2 = box
        m = FEATHER * 2
        src = img.crop((W - x2 - m, y1 - m, W - x1 + m, y2 + m)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        layer = img.copy()
        layer.paste(src, (x1 - m, y1 - m))
    elif kind == 'split':
        # Две плоские заливки по разные стороны прямой (x0,y0)–(x1,y1): стена и скос потолка.
        (lx0, ly0, lx1, ly1), pa, pb = patch[2], patch[3], patch[4]
        ca, cb = img.getpixel(pa), img.getpixel(pb)
        layer = Image.new('RGB', (W, H), ca)
        top = patch[5] if len(patch) > 5 else None  # (высота тёмной полосы-балки сверху, точка цвета)
        far = 4000
        k = (ly1 - ly0) / (lx1 - lx0)
        poly = [(lx0 - far, ly0 - k * far), (lx0 + far, ly0 + k * far), (lx0 + far, -far), (lx0 - far, -far)]
        d = ImageDraw.Draw(layer)
        if top:
            d.rectangle((0, 0, W, top[0]), fill=img.getpixel(top[1]))
        d.polygon(poly, fill=cb)
        d.line([(lx0 - far, ly0 - k * far), (lx0 + far, ly0 + k * far)], fill=tuple(c // 2 for c in ca), width=3)
    else:
        raise ValueError(kind)
    return Image.composite(layer, img, feather_mask(box, 12 if kind == 'clone_soft' else FEATHER))


def prepare(key: str) -> Image.Image:
    im = Image.open(find_source(key)).convert('RGB')
    out, bg = contain(im)
    for patch in PATCHES[key]:
        out = apply_patch(out, bg, patch)
    return out


def main() -> None:
    preview_dir = None
    if '--preview' in sys.argv:
        preview_dir = sys.argv[sys.argv.index('--preview') + 1]
        os.makedirs(preview_dir, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    for key in SOURCES:
        img = prepare(key)
        path = os.path.join(OUT_DIR, f'{key}.webp')
        img.save(path, 'WEBP', quality=QUALITY, method=6)
        print(f'{key}: {path} ({os.path.getsize(path) // 1024} КБ)')
        if preview_dir:
            img.save(os.path.join(preview_dir, f'{key}.png'))
            marked = img.copy()
            d = ImageDraw.Draw(marked)
            for p in PATCHES[key]:
                d.rectangle(p[1], outline=(255, 0, 255))
            marked.save(os.path.join(preview_dir, f'{key}_patches.png'))


if __name__ == '__main__':
    main()
