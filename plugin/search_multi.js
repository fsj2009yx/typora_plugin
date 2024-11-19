class searchMultiKeywordPlugin extends BasePlugin {
    styleTemplate = () => true

    html = () => `
        <div id="plugin-search-multi" class="plugin-common-modal plugin-common-hidden">
            <div id="plugin-search-multi-input">
                <input type="text">
                <div class="plugin-search-multi-btn-group">
                    <span class="option-btn" action="searchGrammarModal" ty-hint="查看搜索语法">
                        <div class="fa fa-info-circle"></div>
                    </span>
                    <span class="option-btn ${(this.config.CASE_SENSITIVE) ? "select" : ""}" action="toggleCaseSensitive" ty-hint="区分大小写">
                        <svg class="icon"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#find-and-replace-icon-case"></use></svg>
                    </span>
                </div>
            </div>

            <div class="plugin-search-multi-result plugin-common-hidden">
                <div class="search-result-title" data-lg="Menu">匹配的文件</div>
                <div class="search-result-list"></div>
            </div>

            <div class="plugin-search-multi-info-item plugin-common-hidden">
                <div class="plugin-search-multi-info" data-lg="Front">Searching</div>
                <div class="typora-search-spinner">
                    <div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div>
                </div>
            </div>
        </div>
    `

    hotkey = () => [{ hotkey: this.config.HOTKEY, callback: this.call }]

    init = () => {
        this.searchHelper = new SearchHelper(this);
        this.allowedExtensions = new Set(this.config.ALLOW_EXT.map(ext => ext.toLowerCase()));
        this.entities = {
            modal: document.querySelector("#plugin-search-multi"),
            input: document.querySelector("#plugin-search-multi-input input"),
            buttonGroup: document.querySelector(".plugin-search-multi-btn-group"),
            result: document.querySelector(".plugin-search-multi-result"),
            resultTitle: document.querySelector(".plugin-search-multi-result .search-result-title"),
            resultList: document.querySelector(".plugin-search-multi-result .search-result-list"),
            info: document.querySelector(".plugin-search-multi-info-item"),
        }
        this.actionMap = {
            searchGrammarModal: () => this.searchHelper.showGrammar(),
            toggleCaseSensitive: btn => {
                btn.classList.toggle("select");
                this.config.CASE_SENSITIVE = !this.config.CASE_SENSITIVE;
            },
        }
    }

    process = () => {
        this.searchHelper.process();

        this.utils.eventHub.addEventListener(this.utils.eventHub.eventType.allPluginsHadInjected, () => {
            const highlighter = this.utils.getPlugin("multi_highlighter");
            highlighter && new LinkHelper(this, highlighter).process();
        })
        if (this.config.REFOUCE_WHEN_OPEN_FILE) {
            this.utils.eventHub.addEventListener(this.utils.eventHub.eventType.otherFileOpened, () => {
                !this.isModalHidden() && setTimeout(() => this.entities.input.select(), 300);
            })
        }
        if (this.config.ALLOW_DRAG) {
            this.utils.dragFixedModal(this.entities.input, this.entities.modal);
        }

        this.entities.resultList.addEventListener("click", ev => {
            const target = ev.target.closest(".plugin-search-multi-item");
            if (!target) return;
            const filepath = target.dataset.path;
            this.utils.openFile(filepath);
            this.config.AUTO_HIDE && this.utils.hide(this.entities.modal);
        });
        this.entities.buttonGroup.addEventListener("click", ev => {
            const btn = ev.target.closest(".option-btn");
            if (!btn) return;
            const action = btn.getAttribute("action");
            this.actionMap[action] && this.actionMap[action](btn);
        })
        this.entities.input.addEventListener("keydown", ev => {
            switch (ev.key) {
                case "Enter":
                    if (!this.utils.metaKeyPressed(ev)) {
                        this.searchMulti();
                        return;
                    }
                    const select = this.entities.resultList.querySelector(".plugin-search-multi-item.active");
                    if (!select) return;
                    this.utils.openFile(select.dataset.path);
                    this.entities.input.focus();
                    break
                case "Escape":
                case "Backspace":
                    if (ev.key === "Escape" || ev.key === "Backspace" && this.config.BACKSPACE_TO_HIDE && !this.entities.input.value) {
                        this.hide();
                    }
                    break
                case "ArrowUp":
                case "ArrowDown":
                    ev.stopPropagation();
                    ev.preventDefault();
                    this.utils.scrollActiveItem(this.entities.resultList, ".plugin-search-multi-item.active", ev.key === "ArrowDown");
            }
        });
    }

    searchMulti = async (rootPath = this.utils.getMountFolder(), input = this.entities.input.value) => {
        const ast = this.getAST(input)
        if (!ast) return

        this.utils.hide(this.entities.result)
        this.utils.show(this.entities.info)
        this.entities.resultList.innerHTML = ""
        await this.searchMultiByAST(rootPath, ast)
        this.utils.hide(this.entities.info)
    }

    getAST = input => {
        input = input.trim()
        if (!input) return

        try {
            const ast = this.searchHelper.parse(input)
            const explain = this.searchHelper.toExplain(ast)
            this.entities.input.setAttribute("title", explain)
            this.utils.notification.hide()
            return ast
        } catch (e) {
            this.entities.input.removeAttribute("title")
            this.utils.notification.show(e.toString().slice(7), "error", 7000)
            console.error(e)
        }
    }

    searchMultiByAST = async (rootPath, ast) => {
        const { fileFilter, dirFilter } = this._getFilter()
        const matcher = source => this.searchHelper.match(ast, source)
        const callback = this._showResultItem(rootPath, matcher)
        await this._traverseDir(rootPath, fileFilter, dirFilter, callback)
    }

    _getFilter = () => {
        const verifyExt = filename => {
            if (filename.startsWith(".")) return false
            const ext = this.utils.Package.Path.extname(filename).toLowerCase()
            const extension = ext.startsWith(".") ? ext.slice(1) : ext
            return this.allowedExtensions.has(extension)
        }
        const verifySize = stat => 0 > this.config.MAX_SIZE || stat.size < this.config.MAX_SIZE
        const fileFilter = (filepath, stat) => verifySize(stat) && verifyExt(filepath)
        const dirFilter = path => !this.config.IGNORE_FOLDERS.includes(path)
        return { fileFilter, dirFilter }
    }

    _showResultItem = (rootPath, matcher) => {
        const newResultItem = (rootPath, filePath, stats) => {
            const { dir, base } = this.utils.Package.Path.parse(filePath)
            const dirPath = this.config.RELATIVE_PATH ? dir.replace(rootPath, ".") : dir

            const item = document.createElement("div")
            item.className = "plugin-search-multi-item"
            item.setAttribute("data-path", filePath)
            if (this.config.SHOW_MTIME) {
                const time = stats.mtime.toLocaleString("chinese", { hour12: false })
                item.setAttribute("ty-hint", time)
            }

            const title = document.createElement("div")
            title.className = "plugin-search-multi-item-title"
            title.textContent = base

            const path = document.createElement("div")
            path.className = "plugin-search-multi-item-path"
            path.textContent = dirPath + this.utils.separator

            item.append(title, path)
            return item
        }

        let index = 0
        const showResult = this.utils.once(() => this.utils.show(this.entities.result))
        return source => {
            if (matcher(source)) {
                index++
                this.entities.resultList.appendChild(newResultItem(rootPath, source.filePath, source.stats))
                this.entities.resultTitle.textContent = `匹配的文件：${index}`
                showResult()
            }
        }
    }

    _traverseDir = async (dir, fileFilter, dirFilter, callback) => {
        const { Fs: { promises: { readdir, stat, readFile } }, Path } = this.utils.Package

        async function traverse(dir) {
            const files = await readdir(dir)
            await Promise.all(files.map(async file => {
                const filePath = Path.join(dir, file)
                const stats = await stat(filePath)
                if (stats.isFile() && (!fileFilter || fileFilter(filePath, stats))) {
                    const buffer = await readFile(filePath)
                    callback({ filePath, stats, buffer, file })
                } else if (stats.isDirectory() && (!dirFilter || dirFilter(file))) {
                    await traverse(filePath)
                }
            }))
        }

        await traverse(dir)
    }

    isModalHidden = () => this.utils.isHidden(this.entities.modal)

    hide = () => {
        this.utils.hide(this.entities.modal)
        this.utils.hide(this.entities.info)
    }

    show = () => {
        this.utils.show(this.entities.modal)
        setTimeout(() => this.entities.input.select())
    }

    call = () => {
        if (!this.isModalHidden()) {
            this.hide()
        } else {
            this.show()
        }
    }
}

/**
 * The matching process consists of the following steps: (Steps 1-3 are executed once; steps 4-5 are executed multiple times)
 *   1. parse:    Parses the input to generate an AST.
 *   2. validate: Validates the AST for correctness.
 *   3. cast:     Converts operand within the AST nodes into a usable format (e.g. converting '2024-01-01' in 'time>2024-01-01' to a Date object for easier matching). The result is `castResult`.
 *   4. query:    Queries the file data to obtain `queryResult`.
 *   5. match:    Matches `castResult` from step 3 with `queryResult` from step 4.
 */
class SearchHelper {
    constructor(plugin) {
        this.config = plugin.config;
        this.utils = plugin.utils;
        this.parser = plugin.utils.searchStringParser;
        this.qualifiers = new Map();
        this.operator = {
            ":": (a, b) => a.includes(b),
            "=": (a, b) => a === b,
            "!=": (a, b) => a !== b,
            ">=": (a, b) => a >= b,
            "<=": (a, b) => a <= b,
            ">": (a, b) => a > b,
            "<": (a, b) => a < b,
        }
        this.units = {
            b: 1,
            k: 1 << 10,
            m: 1 << 20,
            g: 1 << 30,
            kb: 1 << 10,
            mb: 1 << 20,
            gb: 1 << 30,
        }
        this.VALIDATE = {
            isStringOrRegexp: (scope, operator, operand, operandType) => {
                if (operandType === "REGEXP" && operator !== ":") {
                    throw new Error(`Invalid ${operandType}'s operator:「${operator}」`)
                }
                if (operator !== ":" && operator !== "=" && operator !== "!=") {
                    throw new Error(`Invalid ${scope.toUpperCase()}'s operator:「${operator}」`)
                }
            },
            isComparable: (scope, operator, operand, operandType) => {
                if (operandType === "REGEXP") {
                    throw new Error(`Invalid ${scope.toUpperCase()}'s operand type:「${operandType}」`)
                }
                if (operator === ":") {
                    throw new Error(`Invalid ${scope.toUpperCase()}'s operator:「:」`)
                }
            },
            isSize: (scope, operator, operand, operandType) => {
                this.VALIDATE.isComparable(scope, operator, operand, operandType)
                const units = [...Object.keys(this.units)].sort((a, b) => b.length - a.length).join("|")
                const ok = new RegExp(`^\\d+(\\.\\d+)?${units}$`, "i").test(operand)
                if (!ok) {
                    throw new Error(`Invalid ${scope.toUpperCase()}'s operand:「${operand}」`)
                }
            },
            isNumber: (scope, operator, operand, operandType) => {
                this.VALIDATE.isComparable(scope, operator, operand, operandType)
                if (isNaN(operand)) {
                    throw new Error(`Invalid ${scope.toUpperCase()}'s operand:「${operand}」`)
                }
            },
            isDate: (scope, operator, operand, operandType) => {
                this.VALIDATE.isNumber(scope, operator, new Date(operand), operandType)
            },
        }
        this.CAST = {
            toStringOrRegexp: (operand, operandType) => {
                return operandType === "REGEXP"
                    ? new RegExp(operand, this.config.CASE_SENSITIVE ? undefined : "i")
                    : operand.toString()
            },
            toNumber: operand => Number(operand),
            toBytes: operand => {
                const match = operand.match(/^(\d+(\.\d+)?)([a-z]+)$/i)
                if (!match) {
                    throw new Error(`Invalid SIZE's operand:「${operand}」`)
                }
                const unit = match[3].toLowerCase()
                if (!this.units.hasOwnProperty(unit)) {
                    throw new Error(`Unsupported SIZE's unit:「${unit}」`)
                }
                return parseFloat(match[1]) * this.units[unit]
            },
            toDate: operand => {
                operand = new Date(operand)
                operand.setHours(0, 0, 0, 0)
                return operand
            },
        }
        this.MATCH = {
            compare: (scope, operator, operand, queryResult) => {
                if (this.config.CASE_SENSITIVE && typeof queryResult === "string") {
                    queryResult = queryResult.toLowerCase()
                }
                return this.operator[operator](queryResult, operand)
            },
            regexp: (scope, operator, operand, queryResult) => {
                if (this.config.CASE_SENSITIVE) {
                    queryResult = queryResult.toLowerCase()
                }
                return operand.test(queryResult.toString())
            },
        }
    }

    process() {
        /**
         * {string}   scope:         qualifier name
         * {function} validate:      Checks user input; defaults to `this.VALIDATE.isStringOrRegexp`
         * {function} cast:          Converts user input for easier matching; defaults to `this.CAST.toStringOrRegexp`
         * {function} query:         Retrieves data from source
         * {function} match_keyword: Matches operand with queryResult when the user input is a keyword; defaults to `this.MATCH.compare`
         * {function} match_phrase:  Matches operand with queryResult when the user input is a phrase; behaves the same as `match_keyword` by default
         * {function} match_regexp:  Matches operand with queryResult when the user input is a regexp; defaults to `this.MATCH.regexp`
         */
        const qualifiers = [
            {
                scope: "default",
                query: ({ filePath, file, stats, buffer }) => `${buffer.toString()}\n${filePath}`,
            },
            {
                scope: "file",
                query: ({ filePath, file, stats, buffer }) => file,
            },
            {
                scope: "path",
                query: ({ filePath, file, stats, buffer }) => filePath,
            },
            {
                scope: "ext",
                query: ({ filePath, file, stats, buffer }) => this.utils.Package.Path.extname(file),
            },
            {
                scope: "content",
                query: ({ filePath, file, stats, buffer }) => buffer.toString(),
            },
            {
                scope: "frontmatter",
                query: ({ filePath, file, stats, buffer }) => {
                    const { yamlObject } = this.utils.splitFrontMatter(buffer.toString())
                    return JSON.stringify(yamlObject)
                },
            },
            {
                scope: "size",
                validate: this.VALIDATE.isSize,
                cast: this.CAST.toBytes,
                query: ({ filePath, file, stats, buffer }) => stats.size,
            },
            {
                scope: "len",
                validate: this.VALIDATE.isNumber,
                cast: this.CAST.toNumber,
                query: ({ filePath, file, stats, buffer }) => file.length,
            },
            {
                scope: "time",
                validate: this.VALIDATE.isDate,
                cast: this.CAST.toDate,
                query: ({ filePath, file, stats, buffer }) => this.CAST.toDate(stats.mtime),
            },
        ]
        qualifiers.forEach(q => {
            q.validate = q.validate || this.VALIDATE.isStringOrRegexp
            q.cast = q.cast || this.CAST.toStringOrRegexp
            q.KEYWORD = q.match_keyword || this.MATCH.compare
            q.PHRASE = q.match_phrase || q.KEYWORD
            q.REGEXP = q.match_regexp || this.MATCH.regexp
        })
        // register qualifiers
        qualifiers.forEach(q => this.qualifiers.set(q.scope, q))
        this.parser.setQualifier(qualifiers.map(q => q.scope), Array.from(Object.keys(this.operator)))
    }

    parse(input) {
        input = this.config.CASE_SENSITIVE ? input : input.toLowerCase()
        const ast = this.parser.parse(input)
        return this.validateAndCast(ast)
    }

    validateAndCast(ast) {
        this.parser.traverse(ast, node => {
            const { scope, operator, operand, type: operandType } = node
            const qualifier = this.qualifiers.get(scope)
            qualifier.validate(scope, operator, operand, operandType)
            node.castResult = qualifier.cast(operand, operandType)
        })
        return ast
    }

    match(ast, source) {
        // To minimize the creation and destruction of closures, reduce memory usage, and alleviate the burden on GC,
        // since `match` may be called thousands of times, the `_match` function is extracted.
        const callback = node => this._match(node, source)
        return this.parser.evaluate(ast, callback)
    }

    _match(node, source) {
        const { scope, operator, castResult, type } = node
        const qualifier = this.qualifiers.get(scope)
        const queryResult = qualifier.query(source)
        return qualifier[type](scope, operator, castResult, queryResult)
    }

    getContentTokens(ast) {
        const { KEYWORD, PHRASE, REGEXP, OR, AND, NOT } = this.parser.TYPE
        const collect = new Set(["content", "default", "frontmatter"])

        function _eval({ type, left, right, scope, operand }) {
            switch (type) {
                case KEYWORD:
                    return collect.has(scope) ? [operand] : []
                case PHRASE:
                    return collect.has(scope) ? [`"${operand}"`] : []
                case REGEXP:
                    return []
                case OR:
                case AND:
                    return [..._eval(left), ..._eval(right)]
                case NOT:
                    const wont = _eval(right)
                    return (left ? _eval(left) : []).filter(e => !wont.includes(e))
                default:
                    throw new Error(`Unknown AST node「${type}」`)
            }
        }

        return _eval(ast)
    }

    // Converts to a mermaid graph. However, the generated graph is too large and there is no place to put it, so it is not used for now.
    toMermaid(ast) {
        let idx = 0
        const { KEYWORD, PHRASE, REGEXP, OR, AND, NOT } = this.parser.TYPE

        function getName(node) {
            if (node._shortName) return node._shortName
            node._shortName = "T" + ++idx
            const prefix = node.negated ? "-" : ""
            const operand = node.type === REGEXP ? `/${node.operand}/` : node.operand
            return `${node._shortName}("${prefix}${node.scope}${node.operator} ${operand}")`
        }

        function link(left, right) {
            return left.tail.flatMap(t => right.head.map(h => `${getName(t)} --> ${getName(h)}`))
        }

        function _eval(node, negated) {
            let left, right
            const _node = { ...node }
            switch (node.type) {
                case AND:
                    left = _eval(node.left, negated)
                    right = _eval(node.right, negated)
                    _node.head = left.head
                    _node.tail = right.tail
                    _node.result = [...left.result, ...link(left, right), ...right.result]
                    return _node
                case OR:
                    left = _eval(node.left, negated)
                    right = _eval(node.right, negated)
                    _node.head = [...left.head, ...right.head]
                    _node.tail = [...left.tail, ...right.tail]
                    _node.result = [...left.result, ...right.result]
                    return _node
                case NOT:
                    left = node.left ? _eval(node.left, negated) : { result: [], head: [], tail: [] }
                    right = _eval(node.right, !negated)
                    _node.head = node.left ? left.head : right.head
                    _node.tail = right.tail
                    _node.result = [...left.result, ...link(left, right), ...right.result]
                    return _node
                case KEYWORD:
                case PHRASE:
                case REGEXP:
                    _node.negated = negated
                    _node.head = [node]
                    _node.tail = [node]
                    _node.result = []
                    return _node
                default:
                    throw new Error(`Unknown node type: ${node.type}`)
            }
        }

        const { head, tail, result } = _eval(ast)
        const start = head.map(h => `S --> ${getName(h)}`)
        const end = tail.map(t => `${getName(t)} --> E`)
        return ["graph LR", "S(Start)", "E(End)", ...result, ...start, ...end].join("\n")
    }

    toExplain(ast) {
        const { KEYWORD, PHRASE, REGEXP, OR, AND, NOT } = this.parser.TYPE
        const scopeMap = { default: "内容或路径", file: "文件名", path: "路径", ext: "扩展名", content: "内容", frontmatter: "FrontMatter", size: "体积", len: "文件名长度", time: "修改时间" }
        const operatorMap = { ":": "包含", "!=": "不等于", ">=": "大于等于", "<=": "小于等于", ">": "大于", "<": "小于", "=": "等于" }

        function getName(node) {
            const scope = scopeMap[node.scope]
            const negated = node.negated ? "不" : ""
            const operator = node.type === REGEXP ? "匹配正则" : operatorMap[node.operator]
            const operand = node.type === REGEXP ? `/${node.operand}/` : node.operand
            return `「${scope}${negated}${operator}${operand}」`
        }

        function link(left, right) {
            return left.result.flatMap(lPath => right.result.map(rPath => [...lPath, ...rPath]))
        }

        function _eval(node, negated) {
            let left, right
            const _node = { ...node }
            switch (node.type) {
                case AND:
                    left = _eval(node.left, negated)
                    right = _eval(node.right, negated)
                    _node.result = link(left, right)
                    return _node
                case OR:
                    left = _eval(node.left, negated)
                    right = _eval(node.right, negated)
                    _node.result = [...left.result, ...right.result]
                    return _node
                case NOT:
                    left = node.left ? _eval(node.left, negated) : { result: [[]], head: [], tail: [] }
                    right = _eval(node.right, !negated)
                    _node.result = link(left, right)
                    return _node
                case KEYWORD:
                case PHRASE:
                case REGEXP:
                    _node.negated = negated
                    _node.result = [[node]]
                    return _node
                default:
                    throw new Error(`Unknown node type: ${node.type}`)
            }
        }

        const { result } = _eval(ast)
        const content = result
            .map(path => path.map(e => getName(e)).join("且"))
            .map((path, idx) => `${idx + 1}. ${path}`)
            .join("\n")
        return "搜索满足如下任意一个要求的文件：\n" + content
    }

    showGrammar() {
        const scope = Array.from(this.qualifiers.keys());
        const operator = Array.from(Object.keys(this.operator));
        const table1 = `
<table>
    <tr><th>关键字</th><th>说明</th></tr>
    <tr><td>whitespace</td><td>表示与。文档应该同时包含全部关键词</td></tr>
    <tr><td>|</td><td>表示或。文档应该包含关键词之一，等价于 OR</td></tr>
    <tr><td>-</td><td>表示非。文档不能包含关键词</td></tr>
    <tr><td>""</td><td>表示词组。双引号里的空格不再视为与，而是词组的一部分</td></tr>
    <tr><td>qualifier</td><td>限定查找范围：${scope.join(" | ")}<br/>默认值 default = path + content（将文件内容和文件路径作为查找范围）</td></tr>
    <tr><td>/RegExp/</td><td>JavaScript 风格的正则表达式</td></tr>
    <tr><td>()</td><td>小括号。用于调整运算顺序</td></tr>
</table>`

        const table2 = `
<table>
    <tr><th>示例</th><th>搜索文档</th></tr>
    <tr><td>sour pear</td><td>包含 sour 和 pear。等价于 default:sour default:pear</td></tr>
    <tr><td>sour OR pear</td><td>包含 sour 或 pear。等价于 default:(sour | pear)</td></tr>
    <tr><td>"sour pear"</td><td>包含 sour pear 这一词组。等价于 default:"sour pear"</td></tr>
    <tr><td>sour pear -apple</td><td>包含 sour 和 pear，且不含 apple</td></tr>
    <tr><td>path:/[a-z]{3}/ content:abc</td><td>路径匹配 [a-z]{3}，且内容包含 abc</td></tr>
    <tr><td>file:(info | warn | err) -ext:log</td><td>文件名包含 info 或 warn 或 err，且扩展名不含 log</td></tr>
    <tr><td>frontmatter:日记 size>=100k time>2024-03-12</td><td>YAML Front Matter 包含日记，且文件大小大于等于 100k，且文件更新时间大于 2024-03-12</td></tr>
</table>`

        const content = `
<query> ::= <expr>
<expr> ::= <term> ( <or> <term> )*
<term> ::= <factor> ( <not_and> <factor> )*
<factor> ::= <qualifier>? <match>
<qualifier> ::= <scope> <operator>
<match> ::= <keyword> | '"'<keyword>'"' | '/'<regexp>'/' | '('<expr>')'
<not_and> ::= '-' | ' '
<or> ::= 'OR' | '|'
<keyword> ::= [^"]+
<regexp> ::= [^/]+
<operator> ::=  ${operator.map(s => `'${s}'`).join(" | ")}
<scope> ::= ${scope.map(s => `'${s}'`).join(" | ")}`

        const title = "这段文字是语法的形式化表述，你可以把它塞给AI，AI会为你解释";
        const components = [{ label: table1, type: "p" }, { label: table2, type: "p" }, { label: "", type: "textarea", rows: 13, content, title }];
        this.utils.dialog.modal({ title: "高级搜索", width: "600px", components });
    }
}

class LinkHelper {
    constructor(searcher, highlighter) {
        this.searcher = searcher;
        this.highlighter = highlighter;
        this.utils = searcher.utils;

        this.originValue = this.highlighter.config.RESEARCH_WHILE_OPEN_FILE;
        this.styleList = ["position", "padding", "backgroundColor", "boxShadow", "border"];

        this.highlighterModal = document.querySelector("#plugin-multi-highlighter");
        this.highlighterInput = document.querySelector("#plugin-multi-highlighter-input");
        this.button = this.genButton();
    }

    process = () => {
        const isLinking = () => this.searcher.config.LINK_OTHER_PLUGIN && !this.searcher.isModalHidden();

        // 当处于联动状态，在search_multi搜索前先设置highlighter的inputValue和caseSensitive
        this.utils.decorate(() => this.highlighter, "highlight", () => isLinking() && this.syncOption());
        // 当处于联动状态，search_multi触发搜索的时候，先触发highlighter搜索
        this.utils.decorate(() => this.searcher, "searchMulti", () => isLinking() && this.highlighter.highlight());
        // 当处于联动状态，highlighter要展示modal之前，先恢复状态
        this.utils.decorate(() => this.highlighter, "toggleModal", () => this.searcher.config.LINK_OTHER_PLUGIN && this.toggle(true));
        // 当处于联动状态，在search_multi关闭前关闭highlighter
        this.utils.decorate(() => this.searcher, "hide", () => isLinking() && this.toggle(true));
        // 当处于联动状态，在search_multi开启前开启highlighter
        this.utils.decorate(() => this.searcher, "show", () => !this.searcher.config.LINK_OTHER_PLUGIN && this.toggle());

        this.searcher.actionMap.toggleLinkPlugin = () => this.toggle(true);
    }

    genButton = () => {
        const wantLink = this.searcher.config.LINK_OTHER_PLUGIN;
        const span = document.createElement("span");
        span.className = `option-btn ${wantLink ? "select" : ""}`;
        span.setAttribute("action", "toggleLinkPlugin");
        span.setAttribute("ty-hint", "插件联动");
        const div = document.createElement("div");
        div.className = "fa fa-link";
        span.appendChild(div);
        this.searcher.entities.buttonGroup.appendChild(span);
        wantLink && this.moveElement();
        return span
    }

    toggle = (forceHide = false) => {
        this.button.classList.toggle("select");
        this.searcher.config.LINK_OTHER_PLUGIN = !this.searcher.config.LINK_OTHER_PLUGIN;
        if (this.searcher.config.LINK_OTHER_PLUGIN) {
            this.moveElement();
            this.highlighter.highlight();
        } else {
            this.restoreElement(forceHide);
        }
        this.syncOption();
    }

    syncOption = () => {
        const ast = this.searcher.getAST(this.searcher.entities.input.value);
        if (!ast) return;

        const keyArr = this.searcher.searchHelper.getContentTokens(ast);
        document.querySelector("#plugin-multi-highlighter-input input").value = keyArr.join(" ");
        if (this.searcher.config.CASE_SENSITIVE !== this.highlighter.config.CASE_SENSITIVE) {
            document.querySelector(".plugin-multi-highlighter-option-btn").click();
        }
    }

    moveElement = () => {
        this.utils.removeElement(this.highlighterModal);
        const input = document.querySelector("#plugin-search-multi-input");
        input.parentNode.insertBefore(this.highlighterModal, input.nextSibling);

        this.utils.show(this.highlighterModal);
        this.utils.hide(this.highlighterInput);
        this.styleList.forEach(style => this.highlighterModal.style[style] = "initial");
        this.highlighter.config.RESEARCH_WHILE_OPEN_FILE = true;
    }

    restoreElement = forceHide => {
        this.utils.removeElement(this.highlighterModal);
        this.utils.insertElement(this.highlighterModal);

        this.utils.toggleVisible(this.highlighterModal, forceHide);
        this.utils.show(this.highlighterInput);
        this.styleList.forEach(style => this.highlighterModal.style[style] = "");
        this.highlighter.config.RESEARCH_WHILE_OPEN_FILE = this.originValue;
    }
}

module.exports = {
    plugin: searchMultiKeywordPlugin
};
