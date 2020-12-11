const inlineTags = {
  code: 'CODE',
  del: 'STRIKETHROUGH',
  em: 'ITALIC',
  strong: 'BOLD',
  b: 'BOLD',
  ins: 'UNDERLINE',
  u: 'UNDERLINE',
  sub: 'SUBSCRIPT',
  sup: 'SUPERSCRIPT',
};

function convertRgbToHex(color: string) {
  let result;
  try {
    const colorArr = color && color.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
    if(colorArr && colorArr.length) {
      result = "#" + ((1 << 24) + (+colorArr[1] << 16) + (+colorArr[2] << 8) + +colorArr[3]).toString(16).toUpperCase().slice(1);
    }else {
      result = color;
    }
  }catch(e) {
    result = color;
  }
  return result;
}

export default function processInlineTag(
  tag: string,
  node: Object,
  currentStyle: Object
): Object {
  const styleToCheck = inlineTags[tag];
  let inlineStyle;
  if (styleToCheck) {
    inlineStyle = currentStyle.add(styleToCheck).toOrderedSet();
  } else if (node instanceof HTMLElement) {
    inlineStyle = currentStyle;
    const htmlElement = node;
    inlineStyle = inlineStyle.withMutations((style) => {
      const color = htmlElement.style.color;
      const backgroundColor = htmlElement.style.backgroundColor;
      const fontSize = htmlElement.style.fontSize;
      const fontFamily = htmlElement.style.fontFamily.replace(/^"|"$/g, '');
      const fontWeight = htmlElement.style.fontWeight;
      const textDecoration = htmlElement.style.textDecoration;
      const fontStyle = htmlElement.style.fontStyle;
      if (color) {
        // style.add(`color-${color.replace(/ /g, '')}`);
        style.add(`color-${convertRgbToHex(color.replace(/ /g, ''))}`);
      }
      if (backgroundColor) {
        // style.add(`bgcolor-${backgroundColor.replace(/ /g, '')}`);
        style.add(`bgcolor-${convertRgbToHex(backgroundColor.replace(/ /g, ''))}`);
      }
      if (fontSize) {
        style.add(`fontsize-${fontSize.replace(/px$/g, '')}`);
      }
      if (fontFamily) {
        style.add(`fontfamily-${fontFamily}`);
      }
      // if(fontWeight === 'bold'){
      if (fontWeight && (fontWeight.includes('bold') || Number(fontWeight) >= 600 )) {
        style.add(inlineTags.strong)
      }
      if(textDecoration === 'underline'){
          style.add(inlineTags.ins)
      }
      if(fontStyle === 'italic'){
          style.add(inlineTags.em)
      }
    }).toOrderedSet();
  }
  return inlineStyle;
}
