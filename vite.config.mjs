import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  plugins:[react()],
  publicDir:false,
  build:{
    outDir:'dist',emptyOutDir:true,assetsDir:'react-assets',manifest:true,
    target:'es2022',cssCodeSplit:true,
    rollupOptions:{input:fileURLToPath(new URL('./frontend/main.jsx',import.meta.url))},
  },
});
