import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import PizZip from 'pizzip';
import { millimetersToEmu, normalizeReportImage, type ReportImageBox } from './reportImage.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WORD_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PICTURE_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

function createElement(documentDom: any, namespace: string, qualifiedName: string): any {
  return documentDom.createElementNS(namespace, qualifiedName);
}

function setAttribute(element: any, namespace: string, qualifiedName: string, value: string): void {
  element.setAttributeNS(namespace, qualifiedName, value);
}

function sanitizeMediaName(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'evidence';
}

function nextNumericId(elements: any, attributeName: string): number {
  let maxId = 0;
  for (let index = 0; index < elements.length; index += 1) {
    const value = Number(elements.item(index)?.getAttribute(attributeName));
    if (Number.isInteger(value) && value > maxId) maxId = value;
  }
  return maxId + 1;
}

function ensurePngContentType(zip: PizZip): void {
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!contentTypesFile) return;

  const contentTypesDom = new DOMParser().parseFromString(contentTypesFile.asText(), 'application/xml');
  const defaults = contentTypesDom.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Default');
  for (let index = 0; index < defaults.length; index += 1) {
    if ((defaults.item(index)?.getAttribute('Extension') || '').toLowerCase() === 'png') return;
  }

  const types = contentTypesDom.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Types').item(0);
  if (!types) return;
  const pngDefault = createElement(contentTypesDom, CONTENT_TYPES_NS, 'Default');
  pngDefault.setAttribute('Extension', 'png');
  pngDefault.setAttribute('ContentType', 'image/png');
  types.appendChild(pngDefault);
  zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(contentTypesDom));
}

export class ImageRelationshipManager {
  private nextId: number;

  constructor(
    private readonly relsDom: any,
    private readonly zip: PizZip,
  ) {
    const relationships = relsDom.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship');
    let maxId = 0;
    for (let index = 0; index < relationships.length; index += 1) {
      const id = relationships.item(index)?.getAttribute('Id') || '';
      const match = id.match(/^rId(\d+)$/);
      if (match) maxId = Math.max(maxId, Number(match[1]));
    }
    this.nextId = maxId + 1;
    ensurePngContentType(zip);
  }

  addPng(buffer: Buffer, requestedName: string): { relationshipId: string; mediaPath: string } {
    const relationshipId = `rId${this.nextId}`;
    const mediaFileName = `${sanitizeMediaName(requestedName)}_${this.nextId}.png`;
    const mediaPath = `word/media/${mediaFileName}`;
    this.nextId += 1;

    this.zip.file(mediaPath, buffer, { compression: 'STORE' });

    const relationships = this.relsDom.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationships').item(0)
      || this.relsDom.getElementsByTagName('Relationships').item(0);
    if (!relationships) throw new Error('Invalid DOCX: Relationships root not found.');

    const relationship = createElement(this.relsDom, PACKAGE_REL_NS, 'Relationship');
    relationship.setAttribute('Id', relationshipId);
    relationship.setAttribute('Type', IMAGE_REL_TYPE);
    relationship.setAttribute('Target', `media/${mediaFileName}`);
    relationships.appendChild(relationship);

    return { relationshipId, mediaPath };
  }
}

export class ImageDrawingFactory {
  private nextDrawingId: number;

  constructor(private readonly documentDom: any) {
    const existingDocProperties = documentDom.getElementsByTagNameNS(WORD_DRAWING_NS, 'docPr');
    this.nextDrawingId = nextNumericId(existingDocProperties, 'id');
  }

  createInline(options: {
    relationshipId: string;
    name: string;
    widthMm: number;
    heightMm: number;
  }): any {
    const drawingId = this.nextDrawingId;
    this.nextDrawingId += 1;
    const widthEmu = millimetersToEmu(options.widthMm);
    const heightEmu = millimetersToEmu(options.heightMm);

    const drawing = createElement(this.documentDom, WORD_NS, 'w:drawing');
    const inline = createElement(this.documentDom, WORD_DRAWING_NS, 'wp:inline');
    inline.setAttribute('distT', '0');
    inline.setAttribute('distB', '0');
    inline.setAttribute('distL', '0');
    inline.setAttribute('distR', '0');
    drawing.appendChild(inline);

    const extent = createElement(this.documentDom, WORD_DRAWING_NS, 'wp:extent');
    extent.setAttribute('cx', String(widthEmu));
    extent.setAttribute('cy', String(heightEmu));
    inline.appendChild(extent);

    const effectExtent = createElement(this.documentDom, WORD_DRAWING_NS, 'wp:effectExtent');
    effectExtent.setAttribute('l', '0');
    effectExtent.setAttribute('t', '0');
    effectExtent.setAttribute('r', '0');
    effectExtent.setAttribute('b', '0');
    inline.appendChild(effectExtent);

    const docProperties = createElement(this.documentDom, WORD_DRAWING_NS, 'wp:docPr');
    docProperties.setAttribute('id', String(drawingId));
    docProperties.setAttribute('name', options.name);
    docProperties.setAttribute('descr', options.name);
    inline.appendChild(docProperties);

    const frameProperties = createElement(this.documentDom, WORD_DRAWING_NS, 'wp:cNvGraphicFramePr');
    const frameLocks = createElement(this.documentDom, DRAWING_NS, 'a:graphicFrameLocks');
    frameLocks.setAttribute('noChangeAspect', '1');
    frameProperties.appendChild(frameLocks);
    inline.appendChild(frameProperties);

    const graphic = createElement(this.documentDom, DRAWING_NS, 'a:graphic');
    const graphicData = createElement(this.documentDom, DRAWING_NS, 'a:graphicData');
    graphicData.setAttribute('uri', PICTURE_NS);
    graphic.appendChild(graphicData);
    inline.appendChild(graphic);

    const picture = createElement(this.documentDom, PICTURE_NS, 'pic:pic');
    graphicData.appendChild(picture);

    const nonVisualPictureProperties = createElement(this.documentDom, PICTURE_NS, 'pic:nvPicPr');
    const nonVisualDrawingProperties = createElement(this.documentDom, PICTURE_NS, 'pic:cNvPr');
    nonVisualDrawingProperties.setAttribute('id', String(drawingId));
    nonVisualDrawingProperties.setAttribute('name', options.name);
    nonVisualPictureProperties.appendChild(nonVisualDrawingProperties);
    const nonVisualPictureDrawingProperties = createElement(this.documentDom, PICTURE_NS, 'pic:cNvPicPr');
    const pictureLocks = createElement(this.documentDom, DRAWING_NS, 'a:picLocks');
    pictureLocks.setAttribute('noChangeAspect', '1');
    nonVisualPictureDrawingProperties.appendChild(pictureLocks);
    nonVisualPictureProperties.appendChild(nonVisualPictureDrawingProperties);
    picture.appendChild(nonVisualPictureProperties);

    const blipFill = createElement(this.documentDom, PICTURE_NS, 'pic:blipFill');
    const blip = createElement(this.documentDom, DRAWING_NS, 'a:blip');
    setAttribute(blip, OFFICE_REL_NS, 'r:embed', options.relationshipId);
    blipFill.appendChild(blip);
    const stretch = createElement(this.documentDom, DRAWING_NS, 'a:stretch');
    stretch.appendChild(createElement(this.documentDom, DRAWING_NS, 'a:fillRect'));
    blipFill.appendChild(stretch);
    picture.appendChild(blipFill);

    const shapeProperties = createElement(this.documentDom, PICTURE_NS, 'pic:spPr');
    const transform = createElement(this.documentDom, DRAWING_NS, 'a:xfrm');
    const offset = createElement(this.documentDom, DRAWING_NS, 'a:off');
    offset.setAttribute('x', '0');
    offset.setAttribute('y', '0');
    transform.appendChild(offset);
    const transformExtent = createElement(this.documentDom, DRAWING_NS, 'a:ext');
    transformExtent.setAttribute('cx', String(widthEmu));
    transformExtent.setAttribute('cy', String(heightEmu));
    transform.appendChild(transformExtent);
    shapeProperties.appendChild(transform);
    const geometry = createElement(this.documentDom, DRAWING_NS, 'a:prstGeom');
    geometry.setAttribute('prst', 'rect');
    geometry.appendChild(createElement(this.documentDom, DRAWING_NS, 'a:avLst'));
    shapeProperties.appendChild(geometry);
    picture.appendChild(shapeProperties);

    return drawing;
  }
}

export class OoxmlImageWriter {
  private readonly relationships: ImageRelationshipManager;
  private readonly drawings: ImageDrawingFactory;

  constructor(documentDom: any, relsDom: any, zip: PizZip) {
    this.relationships = new ImageRelationshipManager(relsDom, zip);
    this.drawings = new ImageDrawingFactory(documentDom);
  }

  async createDrawing(options: {
    source: Buffer;
    mediaName: string;
    altText: string;
    box: ReportImageBox;
  }): Promise<{ drawing: any; mediaPath: string }> {
    const normalized = await normalizeReportImage(options.source, options.box);
    const registered = this.relationships.addPng(normalized.buffer, options.mediaName);
    const drawing = this.drawings.createInline({
      relationshipId: registered.relationshipId,
      name: options.altText,
      widthMm: options.box.widthMm,
      heightMm: options.box.heightMm,
    });
    return { drawing, mediaPath: registered.mediaPath };
  }
}
