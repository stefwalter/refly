import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';
import { viteStaticCopy } from "vite-plugin-static-copy";

/*
 * This is the base url for static files that CesiumJS needs to load.
 * Set to an empty string to place the files at the site's root path
 */
const cesiumBaseUrl = "cesiumStatic";
const cesiumSource = "node_modules/cesium/Build/Cesium";

/* To put the <script> tag at the bottom of page for loading performance */
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
        jsToBottomNoModule(),
        viteStaticCopy({
            targets: [
                /* Copy Cesium Assets, Widgets, and Workers to a static directory. */
                { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
                { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
                { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
                { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
            ],
        }),
    ],
    define: {
        /* Define relative base path in cesium for loading assets */
        CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
    },
    build: {
        rollupOptions: {
            external: [ "public/config.js" ],
        }
    },
});

