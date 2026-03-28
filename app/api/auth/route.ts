import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";

const AuthRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AuthRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 }
    );
  }

  try {
    const username = process.env.DEMO_USERNAME;
    const password = process.env.DEMO_PASSWORD;

    if (!username || !password) {
      return Response.json(
        { success: false, error: "Demo credentials are not configured." },
        { status: 500 }
      );
    }

    if (
      parsed.data.username !== username ||
      parsed.data.password !== password
    ) {
      return Response.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("qw_session", "authenticated", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86_400,
    });

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/auth]", error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
