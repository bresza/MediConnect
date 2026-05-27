/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@fullcalendar")) return "vendor-fullcalendar"
            if (id.includes("@blocknote")) return "vendor-blocknote"
            if (id.includes("@mantine")) return "vendor-mantine"
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/react-virtual")) {
              return "vendor-tanstack"
            }
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react"
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
})
