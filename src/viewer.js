import {
    assert,
} from './util.js';

import {
    ArcGisMapServerImageryProvider,
    ImageryLayer,
    Terrain,
    Viewer,
} from 'cesium';

/* This is where we copy the Cesium assets to in vite.config.js */
window.CESIUM_BASE_URL = '/cesiumStatic';

export let viewer = null;

/**
 * Create the Cesium.Viewer and assign it to the viewer export.
 *
 * @container: The container element ID or DOM element
 * @mock: If true, does not load scenery
 */
export function createViewer(container, mock) {
    assert(!viewer);

    const options = {
        selectionIndicator: false,
        geocoder: false,
        scene3DOnly: true,
        projectionPicker: false,
        baseLayerPicker: false,
    };

    if (mock) {
        options.imageryProvider = false;
        options.terrain = null;
    } else {
        // TODO: Figure out why this works
        options.baseLayer = ImageryLayer.fromProviderAsync( ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { }));
        options.terrain = Terrain.fromWorldTerrain();
    }

    viewer = window.viewer = new Viewer(container, options);
}

export function destroyViewer() {
    assert(viewer);
    viewer.destroy();
    viewer = null;
}
