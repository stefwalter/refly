
import {
    destroyObject,
    knockout,
    IonImageryProvider
} from 'cesium';

import { assert } from "./util";

import "./displayoptions.css";

export const PROVIDER_IDS = {
    "bing": 2,
    "sentinel": 3954,
};

/*
 * Who to track?
 * The timezone
 * The set of intervals
 */

export class DisplayOptions {
    constructor() {

        let bing = null;
        const sentinel = IonImageryProvider.fromAssetId(PROVIDER_IDS["sentinel"]);

        const self = this;
        this.collapse = true;
        this.highResolution = false;
        this.imageProvider = sentinel;

        knockout.track(this);
        knockout.getObservable(this, 'highResolution').subscribe(function(val) {
            let provider = null;
            if (val) {
                if (!bing)
                    bing = IonImageryProvider.fromAssetId(PROVIDER_IDS["bing"]);
                provider = bing;
            } else {
                provider = sentinel;
            }

            self.imageProvider = provider;
        });
    }
};

export class DisplayToggleButton {
    constructor(container, options) {
        const that = this;

        if (typeof container == "string")
            container = document.getElementById(container);
        assert(container instanceof Element);
        assert(options instanceof Object);
        assert(typeof options.field == "string");

        const field = options.field;
        this._viewModel = options.viewModel || new DisplayOptions();

        const button = document.createElement("button");
        button.setAttribute("data-bind", "class: toggled");
        button.type = "button";
        button.className = "cesium-button cesium-toolbar-button";
        button.innerHTML = options.innerHTML;
        container.insertBefore(button, container.firstChild);

        this._container = container;
        this._element = button;

        /* Toggle the state on clicking */
        this._click = function() { that._viewModel[field] = !that._viewModel[field]; };
        button.addEventListener("click", this._click, true);

        /* Set the classes on the button right */
        knockout.applyBindings({
            toggled: knockout.pureComputed(() => that._viewModel[field] ? "toggled" : "not-toggled"),
        }, this._element);
    }

    get container() {
        return this._container;
    }

    get viewModel() {
        return this._viewModel;
    }

    get element() {
        return this._element;
    }

    isDestroyed() {
        return false;
    }

    destroy() {
        knockout.cleanNode(this._element);
        this._element.removeEventListener("click", this._click, true);
        this._container.removeChild(this._element);
        return destroyObject(this);
    }
}

const FA_ANGLES_RIGHT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M470.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 256 265.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160zm-352 160l160-160c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L210.7 256 73.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0z"/></svg>';


/*
 * A single button widget that displays a panel
 * containing all the display options.
 */
export class SkipGapsButton extends DisplayToggleButton {
    constructor(container, options) {
        super(container, Object.assign({
            innerHTML: FA_ANGLES_RIGHT,
            field: "collapse",
        }, options));
    }
}

const FA_EYE_LOW_VISION = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zM223 149.5c48.6-44.3 123-50.8 179.3-11.7c60.8 42.4 78.9 123.2 44.2 186.9L408 294.5c8.4-19.3 10.6-41.4 4.8-63.3c-11.1-41.5-47.8-69.4-88.6-71.1c-5.8-.2-9.2 6.1-7.4 11.7c2.1 6.4 3.3 13.2 3.3 20.3c0 10.2-2.4 19.8-6.6 28.3L223 149.5zm223.1 298L83.1 161.5c-11 14.4-20.5 28.7-28.4 42.2l339 265.7c18.7-5.5 36.2-13 52.6-21.8zM34.5 268.3c14.9 35.7 46.2 87.7 93 131.1C174.5 443.2 239.2 480 320 480c3.1 0 6.1-.1 9.2-.2L33.1 247.8c-1.8 6.8-1.3 14 1.4 20.5z"/></svg>';

export class HighResolutionButton extends DisplayToggleButton {
    constructor(container, options) {
        super(container, Object.assign({
            innerHTML: FA_EYE_LOW_VISION,
            field: "highResolution",
        }, options));
    }
};

export default DisplayOptions;
