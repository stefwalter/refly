import {
    assert,
} from './util.js';

import {
    ArcGisMapServerImageryProvider,
    Camera,
    ImageryLayer,
    IonImageryProvider,
    Rectangle,
    Terrain,
    Viewer,
} from 'cesium';

/* This is where we copy the Cesium assets to in vite.config.js */
window.CESIUM_BASE_URL = '/cesiumStatic';

Camera.DEFAULT_VIEW_FACTOR = 0.5;
Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(68.0, 7.0, 89.0, 35.0);

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
        navigationHelpButton: false,
    };

    if (mock) {
        options.imageryProvider = false;
        options.terrain = null;
    } else {
        // TODO: Figure out why this works
        options.baseLayer = ImageryLayer.fromProviderAsync( ArcGisMapServerImageryProvider.fromUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', { }));
        // TODO: And this is for BING
        // options.baseLayer = ImageryLayer.fromProviderAsync(IonImageryProvider.fromAssetId(2)),
        options.terrain = Terrain.fromWorldTerrain();
        console.log(options.baseLayer, ArcGisMapServerImageryProvider || IonImageryProvider || null);
    }

    viewer = window.viewer = new Viewer(container, options);
}

export function destroyViewer() {
    assert(viewer);
    viewer.destroy();
    viewer = null;
}
