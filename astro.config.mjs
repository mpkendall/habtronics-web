// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

import tailwindcss from "@tailwindcss/vite";
import mdx from '@astrojs/mdx';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.habtronics.com',

  devToolbar: {
      enabled: false
    },

  integrations: [mdx()],

  adapter: cloudflare({ imageService: "compile" }),

  markdown: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeRaw],
  },

  vite: {
    plugins: [tailwindcss()],
  },
});