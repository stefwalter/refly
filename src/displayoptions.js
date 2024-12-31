
import {
    destroyObject,
    knockout,
} from 'cesium';

import { assert } from "./util";

import "./displayoptions.css";

/*
 * Who to track?
 * The timezone
 * The set of intervals
 */

export class DisplayOptions {
    constructor() {
        this.seamless = false;
        knockout.track(this);
    }
};

/*
 * A single button widget that displays a panel
 * containing all the display options.
 */
export class DisplayOptionsButton {
    constructor(container, options) {
        const that = this;

        if (typeof container == "string")
            container = document.getElementById(container);
        assert(container instanceof Element);
        if (!options)
            options = { };
        assert(options instanceof Object);

        this._viewModel = options.viewModel || new DisplayOptions();

        const button = document.createElement("button");
        button.setAttribute("data-bind", "class: toggled");
        button.type = "button";
        button.className = "cesium-button cesium-toolbar-button toolbar-seamless-button";
        button.innerHTML = "&#x21FB;";
        container.insertBefore(button, container.firstChild);

        this._container = container;
        this._element = button;

        /* Toggle the state on clicking */
        this._click = function() { that._viewModel.seamless = !that._viewModel.seamless; };
        button.addEventListener("click", this._click, true);

        /* Set the classes on the button rigth */
        knockout.applyBindings({
            toggled: knockout.pureComputed(() => that._viewModel.seamless ? "toggled" : "not-toggled"),
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

export default DisplayOptions;
