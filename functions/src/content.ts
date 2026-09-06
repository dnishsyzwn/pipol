import path from 'node:path';
import { unzipSync } from 'fflate';
// The package root runs a debug self-test during Firebase source analysis and
// tries to read a missing test PDF. Import the implementation directly.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { config } from './config.js';
import { invalid } from './errors.js';
import { extractScannedPdf } from './pdf-ocr.js';

export const supportedExtensions = new Set(['pdf', 'pptx', 'odp', 'docx', 'odt', 'md', 'markdown', 'txt', 'rtf']);

export type ExtractedMaterial = {
  text: string;
  sections: Array<{ title?: string; content: string; page?: number; slide?: number }>;
  warnings: string[];
};

export function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

function stripXml(value: string): string {
  return value
    .replace(/<w:tab\s*\/?>/gi, '\t')
    .replace(/<a:br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(value: string): string {
  return value
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function zipText(buffer: Buffer, extension: string): ExtractedMaterial {
  const files = unzipSync(buffer);
  const names = Object.keys(files).filter((name) => name.endsWith('.xml'));
  const relevant = names.filter((name) => {
    if (extension === 'pptx' || extension === 'odp') return /slide|content|notesSlides/i.test(name);
    return /document|content|styles/i.test(name);
  });
  const sections = relevant
    .map((name, index) => {
      const content = stripXml(new TextDecoder().decode(files[name]));
      const slide = /slide(\d+)/i.exec(name)?.[1];
      return {
        title: path.basename(name),
        content,
        ...(slide ? { slide: Number(slide) } : { page: index + 1 }),
      };
    })
    .filter((section) => section.content.length > 0);
  return { text: sections.map((section) => section.content).join('\n\n'), sections, warnings: [] };
}

export async function extractMaterial(buffer: Buffer, fileName: string): Promise<ExtractedMaterial> {
  if (buffer.length > config.maxDocumentBytes) invalid('This file is larger than the 25 MB limit.');
  const extension = extensionOf(fileName);
  if (!supportedExtensions.has(extension)) {
    invalid(`.${extension || 'unknown'} files are not supported yet. Convert legacy .doc/.ppt files to .docx/.pptx.`);
  }

  let result: ExtractedMaterial;
  if (extension === 'pdf') {
    const parsed = await pdfParse(buffer);
    let extractedText = parsed.text.trim();
    let ocrUsed = false;
    const pageCount = Number((parsed as unknown as { numpages?: number }).numpages || 1);
    const likelyImageOnly = extractedText.length < Math.max(80, pageCount * 40);
    if (likelyImageOnly) {
      try {
        extractedText = (await extractScannedPdf(buffer)).trim();
        ocrUsed = extractedText.length > 0;
      } catch (error) {
        console.warn('Scanned PDF OCR fallback failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }
    result = {
      text: extractedText,
      sections: extractedText
        .split(/\f+/)
        .map((content, index) => ({ content: content.trim(), page: index + 1 }))
        .filter((section) => section.content.length > 0),
      warnings: ocrUsed ? ['Text was extracted from scanned PDF pages using Vertex AI document OCR. Review the extracted text before generating questions.'] : likelyImageOnly ? ['This PDF may be scanned or image-only; some content may be missing.'] : [],
    };
  } else if (extension === 'docx') {
    const parsed = await mammoth.extractRawText({ buffer });
    result = { text: parsed.value.trim(), sections: [{ content: parsed.value.trim() }], warnings: parsed.messages.map((message) => message.message) };
  } else if (['pptx', 'odp', 'odt'].includes(extension)) {
    result = zipText(buffer, extension);
  } else if (extension === 'rtf') {
    const text = plainText(buffer.toString('utf8'));
    result = { text, sections: [{ content: text }], warnings: [] };
  } else {
    const text = buffer.toString('utf8').trim();
    result = {
      text,
      sections: text
        .split(/^#{1,6}\s+/m)
        .map((content) => ({ content: content.trim() }))
        .filter((section) => section.content.length > 0),
      warnings: [],
    };
  }

  if (!result.text) invalid('No readable text was found in this file.');
  if (result.text.length > config.maxDocumentChars) {
    result = {
      ...result,
      text: result.text.slice(0, config.maxDocumentChars),
      warnings: [...result.warnings, `Only the first ${config.maxDocumentChars} characters were used.`],
    };
  }
  return result;
}

export function sanitizeSourceText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r/g, '')
    .slice(0, config.maxDocumentChars);
}
