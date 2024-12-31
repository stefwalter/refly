import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

const jsToBottomNoModule = () => {
    return {
        name: "no-attribute",
        transformIndexHtml(html) {
            let scriptTag = html.match(/<script[^>]*>(.*?)<\/script[^>]*>/)[0];
            html = html.replace(scriptTag, "");
            html = html.replace("<!-- # INSERT SCRIPT HERE -->", scriptTag)
            return html;
        }
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        eslint(),
        jsToBottomNoModule()
    ],
    build: {
        rollupOptions: {
            external: [ "public/config.js" ],
        }
    },
});

