import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export type Feedback = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string | null;
  priority: string | null;
  status: string;
  created_at: string;
};
