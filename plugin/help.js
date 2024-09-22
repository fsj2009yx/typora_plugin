class helpPlugin extends BasePlugin {
    beforeProcess = async () => {
        const filepath = this.utils.joinPath("./plugin/bin/version.json");
        try {
            const versionMsg = await this.utils.Package.FsExtra.readJson(filepath);
            this.version = versionMsg.tag_name;
        } catch (err) {
        }
    }

    init = () => {
        const arg_hint = "此功能仅对开发者开放";
        this.callArgs = [
            { arg_name: "卸载插件", arg_value: "uninstall_plugin" },
            { arg_name: "修改配置", arg_value: "open_setting_folder" },
            { arg_name: "备份配置", arg_value: "backup_setting_file" },
            { arg_name: "修改样式", arg_value: "set_user_styles", arg_hint },
            { arg_name: "用户反馈", arg_value: "new_issue" },
            { arg_name: "我要写插件", arg_value: "new_custom_plugin", arg_hint },
            { arg_name: "Typora 自动化", arg_value: "json_rpc", arg_hint },
            { arg_name: "Github 图床", arg_value: "github_picture_bed" },
            { arg_name: "请开发者喝咖啡", arg_value: "donate" },
            { arg_name: "关于", arg_value: "about", arg_hint: "Designed with ♥ by obgnail" },
        ]
    }

    process = () => {
        this.utils.eventHub.addEventListener(this.utils.eventHub.eventType.allPluginsHadInjected, () => {
            this.updater = this.utils.getCustomPlugin("pluginUpdater");
            if (!this.updater) return;
            const arg_name = "升级插件" + (this.version ? `（当前版本：${this.version}）` : "");
            this.callArgs.unshift({ arg_name: arg_name, arg_value: "update_plugin" });
        })
    }

    getInfo = async () => {
        const { current: theme } = await JSBridge.invoke("setting.getThemes");
        const list = plugins => Object.values(plugins).map(e => e.fixedName);
        const plugins = [
            ...list(this.utils.getAllPlugins()),
            ...list(this.utils.getAllCustomPlugins()),
        ];
        return {
            typoraVersion: this.utils.typoraVersion,
            nodeVersion: this.utils.nodeVersion,
            electronVersion: this.utils.electronVersion,
            chromeVersion: this.utils.chromeVersion,
            pluginVersion: this.version || null,
            isWin: Boolean(File.isWin),
            isLinux: Boolean(File.isLinux),
            isMac: Boolean(File.isMac),
            isFocusMode: File.isFocusMode,
            isTypeWriterMode: File.isTypeWriterMode,
            inSourceMode: File.editor.sourceView.inSourceMode,
            isSidebarShown: File.editor.library.isSidebarShown(),
            theme: theme,
            enablePlugin: plugins.join("|"),
        }
    }

    newIssue = async () => {
        const info = await this.getInfo();
        const components = [{ label: "环境信息", type: "textarea", rows: 12, content: JSON.stringify(info, null, "\t") }];
        const { response } = await this.utils.dialog.modalAsync({ title: "用户反馈", width: "500px", components });
        if (response === 1) {
            const url = "https://github.com/obgnail/typora_plugin/issues/new?body=" + encodeURIComponent(JSON.stringify(info));
            this.utils.openUrl(url);
        }
    }

    about = () => {
        const p = [
            `<i>Ashen One, hearest thou my voice still?</i>`,
            "感谢您使用 Typora Plugin，本项目完全开源、免费，请自由地享受。如果发现了碧油鸡或有任何反馈，可以在 <a class='plu-github'>Github</a>、<a class='plu-appinn'>Appinn</a>、<a class='plu-email'>Email</a > 找到我。",
            `如果本项目帮助到您，欢迎 <a class="plu-github">Star</a>，欢迎推荐给你志同道合的朋友使用。`
        ]
        const label = p.map(e => `<p style="font-size: 1.2em">${e}</p>`).join("");
        const onclick = ev => {
            const a = ev.target.closest("a");
            if (!a) return;

            if (a.className === "plu-github") {
                this.utils.openUrl("https://github.com/obgnail/typora_plugin");
            } else if (a.className === "plu-appinn") {
                this.utils.openUrl("https://meta.appinn.net/t/topic/44934");
            } else if (a.className === "plu-email") {
                this.utils.sendEmail("he1251698542@gmail.com", "插件反馈");
            }
        }
        this.utils.dialog.modal({ title: "关于", width: "550px", components: [{ label, type: "span", onclick }] });
    }

    uninstall = async () => {
        const _uninstall = async () => {
            const { Fs, FsExtra } = this.utils.Package;
            const remove = '<script src="./plugin/index.js" defer="defer"></script>';
            const windowHTML = this.utils.joinPath("./window.html");
            const pluginFolder = this.utils.joinPath("./plugin");
            try {
                const content = await Fs.promises.readFile(windowHTML, "utf-8");
                const newContent = content.replace(remove, "");
                await Fs.promises.writeFile(windowHTML, newContent);
                await FsExtra.remove(pluginFolder);
            } catch (e) {
                alert(e.toString());
                return;
            }
            const msg = { type: "info", title: "卸载成功", buttons: ["确定"], message: "插件系统已经卸载，请重启 Typora" };
            await this.utils.showMessageBox(msg);
        }

        const reconfirm = "卸载插件系统";
        const label = `请输入「${reconfirm}」启动自毁程序`;
        const components = [{ label: label, type: "input", placeholder: reconfirm }];
        const { response, submit: [sub] } = await this.utils.dialog.modalAsync({ title: "卸载插件系统", components });
        if (response === 0) return;
        if (sub !== reconfirm) {
            alert("请输入正确的内容");
            return;
        }
        await _uninstall();
    }

    donate = () => {
        const size = 140;
        const margin = 60;
        const backgroundColor = "#F3F2EE";

        const id = this.utils.randomString();
        const wechat = "1fd416ab37f-10469ad7641-1743ea6e25d-1752cd0db5d-1745636e65d-1048e79a641-1fd5555557f-4afbea00-5d90d43d89-1d84bc65502-15d6320850b-1393fb1d8e0-1c49ee7e1e9-191474eed40-1be02668487-63b7d72a63-7d3d48d14f-32cb78f3e3-74f7db4903-944e5b1b1-1fff8e700cb-1e0f6ddf909-13e321614cb-12bff684ad0-1044872c8e7-14968b230ee-17f0e35d5c7-d162229db2-18d685fd8eb-3345e73442-15c2297b583-d2f9675a70-134618b73f8-6c415d1b-1fcf595c75b-105db2a9d10-175164a05fc-174d8579e15-175e81d4e1d-1046843dc22-1fc4d2e5b53"
        const ali = "1fdbe28ec17f-104a6fb0da41-17473386125d-175578895b5d-1747f7f2cf5d-10454d1c5041-1fd55555557f-313125700-5d331f6da89-195ee8d0aab-47257da13b3-193b1bf337b9-184f3702ba7b-2bd3064802d-137ea00e8185-1fb50bc9b8d0-b63cf66f4d9-92d4573b0af-10507780f21f-138016677612-ffa9df819fa-1f1a49197113-1d5fb3515957-b1d2b172b18-3f197fe51fa-1a92a24a0805-18d667eddaf5-b31b47f5460-4c94f6ed8a1-1f18d52c81c9-5d600726855-1e869ff3144b-dcdf7207d69-189c2e252ae1-152946bf165-f08b8a37962-1351b7ff31f8-7191f511b-1fc8735ba157-1052fd12d310-1759edf675f1-174fbd658b99-17545eed9b99-104ee27a93ba-1fcc49aa96bb"
        const qrcodeList = [{ color: "#1AAD19", hex: wechat }, { color: "#027AFF", hex: ali }];
        const canvasWidth = (size + margin) * qrcodeList.length - margin;

        const _adaptDPR = (canvas, ctx) => {
            const dpr = window.devicePixelRatio;
            const { width, height } = canvas;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            ctx.scale(dpr, dpr);
        }

        const onload = () => {
            const canvas = document.getElementById(id);
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            _adaptDPR(canvas, ctx);
            ctx.lineWidth = 0;
            ctx.strokeStyle = "transparent";
            for (const { hex, color } of qrcodeList) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = color;
                const squareList = hex.split("-");
                const squareCount = squareList.length;
                const squareSize = size / squareCount;
                const sideLength = squareSize + 0.3;  // 除法和canvas的像素放大问题导致精度丢失，小加0.3使之更好看
                const bin = squareList.map(e => parseInt(e, 16).toString(2).padStart(squareCount, "0")).join("");
                const table = bin.match(new RegExp(`(.{1,${squareCount}})`, "g"));
                for (let colIdx = 0; colIdx < table.length; colIdx++) {
                    for (let rowIdx = 0; rowIdx < table[0].length; rowIdx++) {
                        if (table[colIdx][rowIdx] === "1") {
                            ctx.fillRect(rowIdx * squareSize, colIdx * squareSize, sideLength, sideLength);
                        }
                    }
                }
                ctx.translate(size + margin, 0);
            }
        }

        const message = `<i style="font-size: 1.2em">Ashen One, Mayst thou thy peace discov'r.</i>`;
        const canvas = `<canvas id="${id}" width="${canvasWidth}" height="${size}" style="margin: auto; display: block;"></canvas>`
        const components = [{ label: message, type: "span" }, { label: canvas, type: "span" }];
        this.utils.dialog.modal({ title: "请开发者喝咖啡", width: "500px", components, onload });
    }

    call = type => {
        const map = {
            open_setting_folder: () => this.utils.openSettingFolder(),
            backup_setting_file: () => this.utils.backupSettingFile(),
            set_user_styles: () => this.utils.showInFinder(this.utils.joinPath("./plugin/global/user_styles/请读我.md")),
            new_custom_plugin: () => this.utils.showInFinder(this.utils.joinPath("./plugin/custom/请读我.md")),
            json_rpc: () => this.utils.showInFinder(this.utils.joinPath("./plugin/json_rpc/请读我.md")),
            github_picture_bed: () => this.utils.openUrl("https://github.com/obgnail/typora_image_uploader"),
            update_plugin: () => this.updater && this.updater.callback(),
            uninstall_plugin: () => this.uninstall(),
            new_issue: () => this.newIssue(),
            donate: () => this.donate(),
            about: () => this.about(),
        }
        const func = map[type];
        func && func();
    }
}

module.exports = {
    plugin: helpPlugin,
};