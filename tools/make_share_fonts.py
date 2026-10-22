from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json,base64
font_dir=Path(__file__).resolve().parents[1]/'node_modules/@fontsource/inter/files'
result={}
for key,size,bold in [('small',20,False),('body',25,False),('name',34,True),('title',42,True),('brand',58,True)]:
    font=ImageFont.truetype(str(font_dir/f'inter-latin-{600 if bold else 400}-normal.woff2'),size)
    chars={}
    for ch in ''.join(chr(x) for x in range(32,127))+'éÉ♀♂—·…':
        width=max(1,int(font.getlength(ch)+1));height=size+14
        im=Image.new('L',(width,height)); ImageDraw.Draw(im).text((0,0),ch,font=font,fill=255)
        chars[ch]=[width,height,base64.b64encode(im.tobytes()).decode()]
    result[key]=chars
Path(__file__).resolve().parents[1]/'web/share-fonts.json'.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
