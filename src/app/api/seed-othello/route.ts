import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function seedOthello(secret: string | null) {
  if (secret !== "othello2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { count } = await supabase
    .from("script_lines")
    .select("*", { count: "exact", head: true })
    .eq("script_id", "5fdad1c9-7680-4fa8-910e-7beea1fd425d");

  if (count && count > 0) {
    return NextResponse.json({ message: `Already seeded: ${count} lines`, skipped: true });
  }

  let data;
  try {
    const filePath = join(process.cwd(), "src/app/api/seed-othello/data.json");
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Could not read data file" }, { status: 500 });
  }

  const chunkSize = 100;
  let totalInserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const { data: result, error } = await supabase.rpc("insert_script_lines_json", { data: chunk });
    if (error) {
      errors.push(`Chunk ${i / chunkSize}: ${error.message}`);
    } else {
      totalInserted += result || chunk.length;
    }
  }

  return NextResponse.json({
    message: `Inserted ${totalInserted} lines`,
    total: data.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (!secret) {
    return NextResponse.json({ info: "Add ?secret=othello2026 to seed" });
  }
  return seedOthello(secret);
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  return seedOthello(searchParams.get("secret"));
}
