'use strict';

const path = require('node:path');

const MAX_DOCUMENT_CHARS = 100_000;

function decodeHtml(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const radix = entity[1].toLowerCase() === 'x' ? 16 : 10;
      return String.fromCodePoint(parseInt(entity.slice(radix === 16 ? 2 : 1), radix));
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(buffer) {
  return decodeHtml(buffer.toString('utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function rtfToText(buffer) {
  return buffer.toString('utf8')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\s?/g, (_, code) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

async function extractDocument(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('пустой файл');
  const extension = path.extname(fileName || '').toLowerCase();
  let text;
  let pages = null;

  if (extension === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      pages = result.total;
      text = (result.pages || []).map((page, index) => `[Страница ${index + 1}]\n${page.text.trim()}`).join('\n\n') || result.text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (['.txt', '.md', '.csv', '.json'].includes(extension)) {
    text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  } else if (extension === '.html' || extension === '.htm') {
    text = htmlToText(buffer);
  } else if (extension === '.rtf') {
    text = rtfToText(buffer);
  } else {
    throw new Error(`неподдерживаемый формат ${extension || 'без расширения'}`);
  }

  text = String(text || '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!text) throw new Error('в файле нет извлекаемого текста; скан без OCR не поддерживается');

  return {
    text: text.slice(0, MAX_DOCUMENT_CHARS),
    totalChars: text.length,
    truncated: text.length > MAX_DOCUMENT_CHARS,
    pages,
  };
}

module.exports = { extractDocument, MAX_DOCUMENT_CHARS };
