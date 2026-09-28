import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fail the build (not just the page) when Supabase settings are missing, so a
  // misconfigured host deploy errors out instead of publishing a broken app.
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const missing = REQUIRED_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}. See .env.example.`);
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react()
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
