class resizeTablePlugin extends BasePlugin {
    styleTemplate = () => this.config.REMOVE_MIX_WIDTH

    process = () => {
        this.utils.runtime.autoSaveConfig(this);
        this.toggleRecorder(false);
        this.onResize();
    }

    dynamicCallArgsGenerator = anchorNode => [{
        arg_name: "记住表格放缩状态",
        arg_value: "record_resize_state",
        arg_state: this.config.RECORD_RESIZE
    }]

    call = type => type === "record_resize_state" && this.toggleRecorder();

    onResize = () => {
        this.utils.entities.eWrite.addEventListener("mousedown", ev => {
            if (!this.utils.metaKeyPressed(ev)) return;
            ev.stopPropagation();
            ev.preventDefault();

            const ele = ev.target.closest("th, td");
            if (!ele) return;
            const tag = ele.tagName;
            const closestElement = tag === "TD" ? "tbody" : "thead";
            const { target, direction } = this.findTarget(ele, ev);
            if (!target || !direction) return;

            const { width: startWidth, height: startHeight } = target.getBoundingClientRect();
            const { clientX: startX, clientY: startY } = ev;
            target.style.width = startWidth + "px";
            target.style.height = startHeight + "px";

            if (direction === "right") {
                target.style.cursor = "w-resize";
                const num = this.whichChildOfParent(target);
                const eleList = target.closest(closestElement).querySelectorAll(`tr ${tag}:nth-child(${num})`);
                this.cleanStyle(eleList, target, "width");
            } else if (direction === "bottom") {
                target.style.cursor = "s-resize";
                const tds = target.parentElement.children;
                this.cleanStyle(tds, target, "height");
            }

            const onMouseMove = ev => {
                if (!this.utils.metaKeyPressed(ev)) return;
                requestAnimationFrame(() => {
                    if (direction === "right") {
                        target.style.width = startWidth + ev.clientX - startX + "px";
                    } else if (direction === "bottom") {
                        target.style.height = startHeight + ev.clientY - startY + "px";
                    }
                });
            }
            const onMouseUp = ev => {
                target.style.cursor = "default";
                target.onmouseup = null;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }

            document.addEventListener("mouseup", onMouseUp);
            document.addEventListener("mousemove", onMouseMove);
        })
    }

    toggleRecorder = (needChange = true) => {
        if (needChange) {
            this.config.RECORD_RESIZE = !this.config.RECORD_RESIZE;
        }
        const name = "recordResizeTable";
        const selector = "#write th, #write td";
        const stateGetter = ele => ele.style.cssText
        const stateRestorer = (ele, state) => ele.style = state
        if (this.config.RECORD_RESIZE) {
            this.utils.stateRecorder.register(name, selector, stateGetter, stateRestorer);
        } else {
            this.utils.stateRecorder.unregister(name);
        }
    }

    getDirection = (target, ev) => {
        if (!target) return ""
        const { right, bottom } = target.getBoundingClientRect();
        const { clientX, clientY } = ev;
        const { THRESHOLD } = this.config;
        if (right - THRESHOLD < clientX && clientX < right + THRESHOLD) {
            return "right"
        } else if (bottom - THRESHOLD < clientY && clientY < bottom + THRESHOLD) {
            return "bottom"
        } else {
            return ""
        }
    }

    whichChildOfParent = child => {
        let i = 1;
        for (const sibling of child.parentElement.children) {
            if (sibling && sibling === child) {
                return i
            }
            i++
        }
    }

    findTarget = (ele, ev) => {
        const { whichChildOfParent } = this;

        function* find(ele) {
            // 自己
            yield ele
            // 左边
            yield ele.previousElementSibling
            // 上边
            const num = whichChildOfParent(ele);
            const uncle = ele.parentElement.previousElementSibling;
            yield uncle
                // td
                ? uncle.querySelector(`td:nth-child(${num})`)
                // tr
                : ele.closest("table").querySelector("thead tr").querySelector(`th:nth-child(${num})`)
        }

        for (const target of find(ele)) {
            const direction = this.getDirection(target, ev);
            if (target && direction) {
                return { target, direction }
            }
        }
        return { target: null, direction: "" }
    }

    cleanStyle = (eleList, exclude, cleanStyle) => {
        for (const td of eleList) {
            if (td && td.style && td !== exclude) {
                td.style[cleanStyle] = "";
            }
        }
    }
}

module.exports = {
    plugin: resizeTablePlugin
};