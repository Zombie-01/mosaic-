import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const uploadsDir = join(process.cwd(), "public", "uploads");
    const files = await readdir(uploadsDir);

    const images = files
      .filter((name) => name.endsWith("-highres.jpg"))
      .map((highresName) => {
        const base = highresName.replace(/-highres\.jpg$/, "");
        return {
          thumbnail: `/uploads/${base}-thumb.jpg`,
          preview: `/uploads/${base}-preview.jpg`,
          highres: `/uploads/${base}-highres.jpg`,
        };
      });

    return NextResponse.json(images);
  } catch (error) {
    console.error("Could not read uploads directory:", error);
    return NextResponse.json([], { status: 200 });
  }
}
