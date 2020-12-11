/* @flow */

import { CharacterMetadata, ContentBlock, genKey, Entity } from 'draft-js';
import { Map, List, OrderedMap, OrderedSet } from 'immutable';
import getSafeBodyFromHTML from './getSafeBodyFromHTML';
import {
  createTextChunk,
  getSoftNewlineChunk,
  getEmptyChunk,
  getBlockDividerChunk,
  getFirstBlockChunk,
  getAtomicBlockChunk,
  createAtomicEntityChunk,
  joinChunks,
} from './chunkBuilder';
import getBlockTypeForTag, { isBlockElement } from './getBlockTypeForTag';
import processInlineTag from './processInlineTag';
import getBlockData from './getBlockData';
import getEntityId from './getEntityId';

const SPACE = ' ';
const REGEX_NBSP = new RegExp('&nbsp;', 'g');

let firstBlock = true;

type CustomChunkGenerator = (nodeName: string, node: HTMLElement) => ?{type: string, mutability: string, data: {}};

type HtmlToDraftOptions = {
  imgToText: Boolean,
};


function isExistedBlockParents(node, distance, exceptNode) {
  if(!node || !node.parentElement) {
    return false;
  }
  distance = isNaN(distance) || !distance || distance < 1 ? 1 : +distance;
  const MAX_DISTANCE = 10;
  distance = distance > MAX_DISTANCE ? MAX_DISTANCE : distance;

  let res = false;
  let parent = node.parentElement;
  const exceptNodeSet = Array.isArray(exceptNode) ? new Set(exceptNode) : new Set([])
  while(parent) {
    if(distance < 1) {
      break;
    }

    const nodeName = parent.nodeName.toLowerCase();
    const isBlock = !!isBlockElement(nodeName);
    if(isBlock && !exceptNodeSet.has(nodeName)) {
      res = isBlock;
      break;
    }

    parent = parent.parentElement;
    distance --;
  }

  return res;
}

function isEmptyText(text) {
  try {
    return !text || !text.trim();
  } catch (error) { }
  return false
}

function isEmptyAndNewLineText(text) {
  let isEmptyAndNewLine = false;
  const newLinePattern = /\n/;
  try {
    isEmptyAndNewLine = isEmptyText(text) && newLinePattern.test(text);
  } catch (error) { }
  return isEmptyAndNewLine;
}


function genFragment(
  node: Object,
  inlineStyle: OrderedSet,
  depth: number,
  lastList: string,
  inEntity: number,
  customChunkGenerator: ?CustomChunkGenerator,
  options: ?HtmlToDraftOptions,
): Object {
  const nodeName = node.nodeName.toLowerCase();

  const { imgToText } = options || {};

  if (customChunkGenerator) {
    const value = customChunkGenerator(nodeName, node);
    if (value) {
      const entityId = Entity.__create(
        value.type,
        value.mutability,
        value.data || {},
      );
      const isEntity = !!value.isEntity;
      const customText = value.text;
      if(isEntity) {
        return { chunk: createAtomicEntityChunk(entityId, customText) };
      }
      return { chunk: getAtomicBlockChunk(entityId) };
    }
  }

  // if (nodeName === '#text' && node.textContent !== '\n') {
  if (nodeName === '#text' && !isEmptyAndNewLineText(node.textContent)) {
    return createTextChunk(node, inlineStyle, inEntity);
  }

  const isEmptyAndNewLineTextNode = nodeName === '#text' && isEmptyAndNewLineText(node.textContent);
  if (nodeName === 'br' || isEmptyAndNewLineTextNode) {
    return { chunk: getSoftNewlineChunk() };
  }

  if (
    nodeName === 'img' &&
    node instanceof HTMLImageElement
  ) {
    if(imgToText) {
      return { chunk: createAtomicEntityChunk(null, node.title || node.alt) };
    }

    const entityConfig = {};
    entityConfig.src = node.getAttribute ? node.getAttribute('src') || node.src : node.src;
    entityConfig.alt = node.alt;
    entityConfig.height = node.style.height;
    entityConfig.width = node.style.width;
    if (node.style.float) {
      entityConfig.alignment = node.style.float;
    }
    const entityId = Entity.__create(
      'IMAGE',
      'MUTABLE',
      entityConfig,
    );
    return { chunk: getAtomicBlockChunk(entityId) };
  }

  if (
    nodeName === 'video' &&
    node instanceof HTMLVideoElement
  ) {
    const entityConfig = {};
    entityConfig.src = node.getAttribute ? node.getAttribute('src') || node.src : node.src;
    entityConfig.alt = node.alt;
    entityConfig.height = node.style.height;
    entityConfig.width = node.style.width;
    if (node.style.float) {
      entityConfig.alignment = node.style.float;
    }
    const entityId = Entity.__create(
      'VIDEO',
      'MUTABLE',
      entityConfig,
    );
    return { chunk: getAtomicBlockChunk(entityId) };
  }

  if (
    nodeName === 'iframe' &&
    node instanceof HTMLIFrameElement
  ) {
    const entityConfig = {};
    entityConfig.src = node.getAttribute ? node.getAttribute('src') || node.src : node.src;
    entityConfig.height = node.height;
    entityConfig.width = node.width;
    const entityId = Entity.__create(
      'EMBEDDED_LINK',
      'MUTABLE',
      entityConfig,
    );
    return { chunk: getAtomicBlockChunk(entityId) };
  }

  const blockType = getBlockTypeForTag(nodeName, lastList);

  let chunk;
  if (blockType) {
    if (nodeName === 'ul' || nodeName === 'ol') {
      lastList = nodeName;
      depth += 1;
    } else {
      if (
         blockType !== 'unordered-list-item' &&
         blockType !== 'ordered-list-item'
       ) {
         lastList = '';
         depth = -1;
       }

      const parentNodeName = node.parentElement && node.parentElement.nodeName.toLowerCase();
      const parentIsBlock = isExistedBlockParents(node, 1);
      if(parentIsBlock && !node.previousElementSibling && parentNodeName != 'ul') {
        chunk = getEmptyChunk();
      }
      else if (!firstBlock) {
         chunk = getBlockDividerChunk(
           blockType,
           depth,
           getBlockData(node)
         );
       } else {
         chunk = getFirstBlockChunk(
           blockType,
           getBlockData(node)
         );
         firstBlock = false;
       }
    }
  }
  if (!chunk) {
    if(nodeName !== '#text' && nodeName !== 'body' && nodeName !== 'ul' && firstBlock) {
      chunk = getFirstBlockChunk(
        blockType,
        getBlockData(node)
      );
      firstBlock = false;
    }
    else {
      chunk = getEmptyChunk();
    }
  }

  inlineStyle = processInlineTag(nodeName, node, inlineStyle);

  let child = node.firstChild;
  while (child) {
    const isEmptyText = !!(child.nodeName.toLowerCase() === '#text' && child.textContent && !child.textContent.trim());
    const isEmptyTextBetweenTags = isEmptyText && !!(child.previousElementSibling || child.nextElementSibling);
    if(isEmptyTextBetweenTags) {
      console.warn(`html2draft.genFragment() skip empty text -> `, node, child);
      child = child.nextSibling;
      continue;
    }
    
    const entityId = getEntityId(child);
    const { chunk: generatedChunk } = genFragment(child, inlineStyle, depth, lastList, (entityId || inEntity), customChunkGenerator, options);
    chunk = joinChunks(chunk, generatedChunk);
    const sibling = child.nextSibling;
    child = sibling;
  }
  return { chunk };
}

function getChunkForHTML(html: string, customChunkGenerator: ?CustomChunkGenerator, options: ?HtmlToDraftOptions): Object {
  const sanitizedHtml = html.trim().replace(REGEX_NBSP, SPACE);
  const safeBody = getSafeBodyFromHTML(sanitizedHtml);
  if (!safeBody) {
    return null;
  }
  firstBlock = true;
  const { chunk } = genFragment(safeBody, new OrderedSet(), -1, '', undefined, customChunkGenerator, options);
  return { chunk };
}

export default function htmlToDraft(html: string, customChunkGenerator: ?CustomChunkGenerator, options: ?HtmlToDraftOptions): Object {
  const chunkData = getChunkForHTML(html, customChunkGenerator, options);
  if (chunkData) {
    const { chunk } = chunkData;
    let entityMap = new OrderedMap({});
    chunk.entities && chunk.entities.forEach(entity => {
      if (entity) {
        entityMap = entityMap.set(entity, Entity.__get(entity));
      }
    });
    let start = 0;
    return {
      contentBlocks: chunk.text.split('\r')
        .map(
          (textBlock, ii) => {
            const end = start + textBlock.length;
            const inlines = chunk && chunk.inlines.slice(start, end);
            const entities = chunk && chunk.entities.slice(start, end);
            const characterList = new List(
              inlines.map((style, index) => {
                const data = { style, entity: null };
                if (entities[index]) {
                  data.entity = entities[index];
                }
                return CharacterMetadata.create(data);
              }),
            );
            start = end;
            return new ContentBlock({
              key: genKey(),
              type: (chunk && chunk.blocks[ii] && chunk.blocks[ii].type) || 'unstyled',
              depth: chunk && chunk.blocks[ii] && chunk.blocks[ii].depth,
              data: (chunk && chunk.blocks[ii] && chunk.blocks[ii].data) || new Map({}),
              text: textBlock,
              characterList,
            });
          },
        ),
      entityMap,
    };
  }
  return null;
}
