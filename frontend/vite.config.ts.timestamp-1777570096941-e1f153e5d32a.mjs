// vite.config.ts
import tailwindcss from "file:///D:/Ai_Ceph_Project/Ai%20Cephalometric%20Analysis/frontend/node_modules/@tailwindcss/vite/dist/index.mjs";
import react from "file:///D:/Ai_Ceph_Project/Ai%20Cephalometric%20Analysis/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "node:path";
import { defineConfig } from "file:///D:/Ai_Ceph_Project/Ai%20Cephalometric%20Analysis/frontend/node_modules/vite/dist/node/index.js";
var __vite_injected_original_dirname = "D:\\Ai_Ceph_Project\\Ai Cephalometric Analysis\\frontend";
var vite_config_default = defineConfig({
  root: path.resolve(__vite_injected_original_dirname, "client"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "client/src"),
      "@shared": path.resolve(__vite_injected_original_dirname, "shared")
    }
  },
  server: {
    port: 3e3,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_API_BASE_URL ?? "http://localhost:5180",
        changeOrigin: true
      },
      "/uploads": {
        target: process.env.VITE_BACKEND_API_BASE_URL ?? "http://localhost:5180",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.resolve(__vite_injected_original_dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxBaV9DZXBoX1Byb2plY3RcXFxcQWkgQ2VwaGFsb21ldHJpYyBBbmFseXNpc1xcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcQWlfQ2VwaF9Qcm9qZWN0XFxcXEFpIENlcGhhbG9tZXRyaWMgQW5hbHlzaXNcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0FpX0NlcGhfUHJvamVjdC9BaSUyMENlcGhhbG9tZXRyaWMlMjBBbmFseXNpcy9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB0YWlsd2luZGNzcyBmcm9tIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHJvb3Q6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiY2xpZW50XCIpLFxuICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiY2xpZW50L3NyY1wiKSxcbiAgICAgIFwiQHNoYXJlZFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcInNoYXJlZFwiKSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiAzMDAwLFxuICAgIHByb3h5OiB7XG4gICAgICBcIi9hcGlcIjoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQkFDS0VORF9BUElfQkFTRV9VUkwgPz8gXCJodHRwOi8vbG9jYWxob3N0OjUxODBcIixcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIFwiL3VwbG9hZHNcIjoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQkFDS0VORF9BUElfQkFTRV9VUkwgPz8gXCJodHRwOi8vbG9jYWxob3N0OjUxODBcIixcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJkaXN0XCIpLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlYsT0FBTyxpQkFBaUI7QUFDclgsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLG9CQUFvQjtBQUg3QixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNLEtBQUssUUFBUSxrQ0FBVyxRQUFRO0FBQUEsRUFDdEMsU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFBQSxFQUNoQyxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxZQUFZO0FBQUEsTUFDekMsV0FBVyxLQUFLLFFBQVEsa0NBQVcsUUFBUTtBQUFBLElBQzdDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUSxRQUFRLElBQUksNkJBQTZCO0FBQUEsUUFDakQsY0FBYztBQUFBLE1BQ2hCO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDVixRQUFRLFFBQVEsSUFBSSw2QkFBNkI7QUFBQSxRQUNqRCxjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUSxLQUFLLFFBQVEsa0NBQVcsTUFBTTtBQUFBLElBQ3RDLGFBQWE7QUFBQSxJQUNiLFdBQVc7QUFBQSxFQUNiO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
