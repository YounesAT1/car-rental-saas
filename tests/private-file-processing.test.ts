// @vitest-environment node
import sharp from "sharp";
import { expect, test } from "vitest";
import { processPrivateDocument } from "../convex/lib/processPrivateDocument";
import { PRIVATE_SOURCE_LIMIT } from "../src/lib/operations";

function arrayBuffer(bytes: Buffer) {
  return Uint8Array.from(bytes).buffer;
}

function onePagePdf() {
  const stream = "0.12 0.32 0.72 rg\n0 0 200 100 re\nf\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

test("reconstructs raster evidence into a bounded metadata-free WebP", async () => {
  const source = await sharp({
    create: {
      width: 1800,
      height: 900,
      channels: 3,
      background: "#2451b7",
    },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: "private" } } })
    .toBuffer();
  const [page] = await processPrivateDocument(arrayBuffer(source));
  expect(page).toBeDefined();
  expect(page!.bytes.byteLength).toBeLessThanOrEqual(1024 * 1024);
  const metadata = await sharp(page!.bytes).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined();
  expect(metadata.icc).toBeUndefined();
});

test("renders a PDF page into a raster operational copy", async () => {
  const pages = await processPrivateDocument(arrayBuffer(onePagePdf()));
  expect(pages).toHaveLength(1);
  expect(pages[0]!.width).toBeGreaterThan(0);
  expect(pages[0]!.height).toBeGreaterThan(0);
  expect((await sharp(pages[0]!.bytes).metadata()).format).toBe("webp");
});

test("rejects active, malformed, empty and oversized sources", async () => {
  for (const source of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from("%PDF-invalid"),
    Buffer.alloc(0),
    Buffer.alloc(PRIVATE_SOURCE_LIMIT + 1),
  ])
    await expect(processPrivateDocument(arrayBuffer(source))).rejects.toThrow();
});
