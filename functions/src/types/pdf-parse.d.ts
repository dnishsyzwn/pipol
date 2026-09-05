declare module 'pdf-parse' {
  type PdfParseResult = {
    text: string;
  };

  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  type PdfParseResult = {
    text: string;
  };

  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}
