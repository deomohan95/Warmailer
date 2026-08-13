import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseConfig } from "@/lib/backend-data";

type CreatedUser = {
  id: string;
};

type Workspace = {
  id: string;
};

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!name || !email || !company || password.length < 8) {
    return NextResponse.redirect(new URL("/signup?error=1", request.url));
  }

  const user = await supabaseAuthAdmin<CreatedUser>("/auth/v1/admin/users", {
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, company },
  });
  const [workspace] = await supabaseRest<Workspace[]>("workspaces", { name: company });
  if (!workspace) throw new Error("Signup failed");
  await supabaseRest("workspace_members", {
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
  });

  return NextResponse.redirect(new URL("/login?created=1", request.url));
}

async function supabaseAuthAdmin<T>(path: string, body: unknown): Promise<T> {
  const { url, key } = requireSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Signup failed");
  return (await response.json()) as T;
}

async function supabaseRest<T = unknown>(table: string, body: unknown): Promise<T> {
  const { url, key } = requireSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Signup failed");
  return (await response.json()) as T;
}
