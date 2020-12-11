import { Map } from 'immutable';

export default function getBlockData(
  node: Object
): Object {
  const { style } = node || {};
  const { textAlign, marginLeft } = style || {};
  if (textAlign) {
    return new Map({
      'text-align': node.style.textAlign,
    })
  } else if (marginLeft) {
    return new Map({
      'margin-left': marginLeft,
    })
  }
  return undefined;
}
