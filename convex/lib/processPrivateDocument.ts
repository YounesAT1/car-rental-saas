"use node";

import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import {
  PRIVATE_OUTPUT_LIMIT,
  PRIVATE_PAGE_LIMIT,
  PRIVATE_SOURCE_LIMIT,
} from "../../src/lib/operations";

const MAX_IMAGE_PIXELS = 24_000_000;
const MAX_PDF_PAGE_PIXELS = 4_000_000;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_EDGE = 2400;

export type ProcessedPrivatePage = {
  bytes: Buffer;
  width: number;
  height: number;
};

function isRaster(input: Buffer) {
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

function isPdf(input: Buffer) {
  return input.toString("ascii", 0, 5) === "%PDF-";
}

async function boundedWebp(input: Buffer) {
  const decoder = sharp(input, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: "warning",
  });
  const metadata = await decoder.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format) ||
    (metadata.pages ?? 1) !== 1 ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  )
    throw new Error("PRIVATE_FILE_INVALID");
  const width = Math.min(metadata.width, MAX_EDGE);
  const height = Math.min(metadata.height, MAX_EDGE);
  let output = await decoder
    .clone()
    .autoOrient()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  if (output.byteLength > MAX_PAGE_BYTES)
    output = await sharp(output)
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 68 })
      .toBuffer();
  if (output.byteLength > MAX_PAGE_BYTES) throw new Error("PRIVATE_FILE_LIMIT");
  const result = await sharp(output).metadata();
  return {
    bytes: output,
    width: result.width ?? width,
    height: result.height ?? height,
  };
}

async function renderPdf(input: Buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(input),
    disableAutoFetch: true,
    disableFontFace: true,
    disableStream: true,
    enableXfa: false,
    maxImageSize: MAX_PDF_PAGE_PIXELS,
    stopAtErrors: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > PRIVATE_PAGE_LIMIT)
      throw new Error("PRIVATE_FILE_LIMIT");
    const pages: ProcessedPrivatePage[] = [];
    let total = 0;
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      try {
        const natural = page.getViewport({ scale: 1.5 });
        const scale = Math.min(
          1,
          Math.sqrt(MAX_PDF_PAGE_PIXELS / (natural.width * natural.height)),
        );
        const viewport = page.getViewport({ scale: 1.5 * scale });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        if (width * height > MAX_PDF_PAGE_PIXELS)
          throw new Error("PRIVATE_FILE_LIMIT");
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, width, height);
        await page.render({
          canvas: null,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const processed = await boundedWebp(canvas.toBuffer("image/png"));
        total += processed.bytes.byteLength;
        if (total > PRIVATE_OUTPUT_LIMIT) throw new Error("PRIVATE_FILE_LIMIT");
        pages.push(processed);
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }
    await document.cleanup();
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function processPrivateDocument(bytes: ArrayBuffer) {
  if (bytes.byteLength === 0 || bytes.byteLength > PRIVATE_SOURCE_LIMIT)
    throw new Error("PRIVATE_FILE_LIMIT");
  const input = Buffer.from(bytes);
  const pages = isRaster(input)
    ? [await boundedWebp(input)]
    : isPdf(input)
      ? await renderPdf(input)
      : null;
  if (!pages) throw new Error("PRIVATE_FILE_INVALID");
  const total = pages.reduce((sum, page) => sum + page.bytes.byteLength, 0);
  if (
    pages.length < 1 ||
    pages.length > PRIVATE_PAGE_LIMIT ||
    total > PRIVATE_OUTPUT_LIMIT
  )
    throw new Error("PRIVATE_FILE_LIMIT");
  return pages;
}
