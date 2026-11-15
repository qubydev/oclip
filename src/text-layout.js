const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});

export function layoutText(ctx,clip) {
  ctx.font='650 '+clip.fontSize+'px "Segoe UI", sans-serif';
  const maxWidth=clip.textWidth;
  const lines=[];
  for(const paragraph of clip.text.split('\n')) {
    if(maxWidth==null) {
      lines.push(paragraph);
      continue;
    }
    let line='';
    let gap='';
    for(const token of paragraph.match(/\s+|\S+/gu)??[]) {
      if(/^\s/u.test(token)) {
        gap=token;
        continue;
      }
      const candidate=line+gap+token;
      if(ctx.measureText(candidate).width<=maxWidth) {
        line=candidate;
      } else {
        if(line) lines.push(line);
        line='';
        if(ctx.measureText(token).width<=maxWidth) {
          line=token;
        } else {
          for(const {segment} of graphemes.segment(token)) {
            if(line&&ctx.measureText(line+segment).width>maxWidth) {
              lines.push(line);
              line='';
            }
            line+=segment;
          }
        }
      }
      gap='';
    }
    lines.push(line);
  }
  const spacing=clip.fontSize*1.22;
  return {
    lines,spacing,
    width:maxWidth??lines.reduce((width,line)=>Math.max(width,ctx.measureText(line).width),1),
    height:clip.textHeight??clip.fontSize+(lines.length-1)*spacing,
  };
}
