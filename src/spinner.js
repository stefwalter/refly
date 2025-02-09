import "./spinner.css";

const spinners = new Object();

export function spinner(identifier, waiting, timeout) {
    const element = document.getElementById("spinner");
    if (!element)
        return;
    function visibility() {
        element.style.display = Object.keys(spinners).length > 0 ? "block" : "none";
    }
    if (waiting && !(identifier in spinners)) {
        spinners[identifier] = window.setTimeout(function() {
            visibility();
            if (identifier in spinners)
                spinners[identifier] = null;
        }, timeout || 100);
    } else if (!waiting && identifier in spinners) {
        window.clearTimeout(spinners[identifier]);
        delete spinners[identifier];
        visibility();
    }
}

