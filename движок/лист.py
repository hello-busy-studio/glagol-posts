#!/usr/bin/env python3
"""Контактный лист: python3 движок/лист.py посты/<папка> [вертикальные|горизонтальные] [выход.jpg]
Собирает все слайды папки в одну картинку — удобно смотреть карусель целиком."""
import sys, glob, os
from PIL import Image, ImageDraw
post = sys.argv[1]; sub = sys.argv[2] if len(sys.argv) > 2 else 'вертикальные'
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(post, f'лист-{sub}.jpg')
files = sorted(glob.glob(os.path.join(post, sub, '[0-9]*.*')))
if not files: sys.exit('нет слайдов')
v = sub.startswith('в'); tw = 360 if v else 520
w0, h0 = Image.open(files[0]).size; th = int(tw * h0 / w0)
cols = 6 if v else 4; rows = (len(files) + cols - 1) // cols; g = 16
sheet = Image.new('RGB', (cols*(tw+g)+g, rows*(th+g+26)+g), (215, 215, 215)); d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    x = g + (i % cols)*(tw+g); y = g + (i // cols)*(th+g+26)
    sheet.paste(im, (x, y)); d.text((x, y+th+6), os.path.basename(f), fill=(60, 60, 60))
sheet.save(out, quality=88); print(out)
