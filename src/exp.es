#!/usr/bin/env ejs
/*
    exp.es - Expansive Static Site Generator
 */

module expansive {

require ejs.unix
require ejs.web
require ejs.version
require exp.template

const CONFIG: Path = Path('exp.json')
const VERSION = '0.1.0'
const LISTEN = '4000'

const USAGE = 'Usage: exp [options] [filters ...]
    --chdir dir       # Change to directory before running
    --keep            # Keep intermediate transform results
    --listen IP:PORT  # Endpoint to listen on
    --log path:level  # Trace to logfile
    --noclean         # Do not clean "public" before render
    --norender        # Do not do an initial render before watching
    --nowatch         # No watch, just run
    --quiet           # Quiet mode
    --verbose         # Verbose mode
    --version         # Output version information
  Commands:
    clean             # Clean "public" output directory
    init              # Create exp.json
    install plugins   # Install new plugings
    render            # Render entire site
    filters, ...      # Render only matching documents
    watch             # Watch for changes and render as required
    uninstall plugins # Uninstall plugings
    upgrade plugins   # Upgrade plugings
    <CR>              # Serve and watches for changes
'

class Exp {
    var args: Args
    var cache: Object
    var copy: Object
    var dirs: Object
    var exclude: Object
    var filters: Array
    var publicNames: Object
    var renderAll: Boolean
    var impliedUpdates: Object
    var lastGen: Date
    var log: Logger = App.log
    var mastersModified: Boolean
    var obuf: ByteArray?
    var options: Object
    var paks: Path
    var services: Object
    var stats: Object
    var topMeta: Object
    var transforms: Object
    var verbosity: Number = 0

    let argsTemplate = {
        options: {
            chdir:   { range: Path },
            debug:   { alias: 'd' },        /* Undocumented */
            keep:    { alias: 'k' },
            listen:  { range: String },
            log:     { alias: 'l', range: String },
            noclean: { },
            norender:{ },
            nowatch: { },
            quiet:   { alias: 'q' },
            verbose: { alias: 'v' },
            version: { },
        },
        unknown: unknown,
        usage: usage,
    }

    function Exp() { 
        cache = {}
        stats = {services: {}}
        publicNames = {}
        impliedUpdates = {}
        lastGen = new Date()
    }

    public function unknown(argv, i) {
        let arg = argv[i].slice(argv[i].startsWith("--") ? 2 : 1)
        if (arg == '?') {
            exp.usage()
        } else if (!isNaN(parseInt(arg))) {
            return i+1
        }
        throw "Undefined option '" + arg + "'"
    }

    function usage(): Void {
        App.log.write(USAGE)
        App.exit(1)
    }

    function parseArgs(): Void {
        App.log.name = 'exp'
        args = Args(argsTemplate, App.args)
        options = args.options
        if (options.version) {
            print(VERSION)
            App.exit(0)
        }
        if (options.chdir) {
            App.chdir(options.chdir)
        }
        if (options.verbose) {
            verbosity++
        }
    }

    function setup() {
        setupTopMeta()
        loadPlugins()
        setupEjsTransformer()
        if (options.debug) {
            dump('Transforms', transforms)
            dump('Services', services)
        }
        return topMeta
    }

    function setupTopMeta() {
        topMeta = {
            layout: 'default',
            control: {
                directories: {
                    documents: Path('documents'),
                    layouts:   Path('layouts'),
                    partials:  Path('partials'),
                    public:    Path('public'),
                },
                listen: options.listen || LISTEN
                plugins: [],
                watch: 1200,
                services: {},
                transforms: {},
            }
        }
        if (App.config.exp) {
            blendMeta(topMeta, App.config.exp)
        }
        if (!CONFIG.exists) {
            fatal('Cannot find ' + CONFIG)
        }
        loadConfig('.', topMeta)
        dirs = topMeta.control.directories

        //  MOB - this is required. loadConfig must be loading directories outside blendMeta
        for (let [key, value] in dirs) {
            dirs[key] = Path(value)
        }
    }

    function loadConfig(dir: Path, meta) {
        let path = dir.join(CONFIG)
        if (path.exists) {
            let config
            try {
                config = path.readJSON()
            } catch (e) {
                fatal('Syntax error in "' + path + '"' + '\n' + e)
            }
            blendMeta(meta, config)
            if (meta.mode && meta.modes && meta.modes[meta.mode]) {
                blend(meta, meta.modes[meta.mode])
            }
            /* LEGACY */
            let warned
            for each (field in ['exclude', 'copy', 'script', 'sitemap', 'directories']) {
                if (meta[field]) {
                    meta.control[field] = meta[field]
                    trace('Warn', 'Config "' + path + '" uses legacy property \"' + field + '"')
                }
            }
            if (config.control && config.control.script) {
                delete meta.control.script
                try {
                    vtrace('Eval', 'Script for ' + CONFIG)
                    eval(config.control.script)
                } catch (e) {
                    fatal('Script error in "' + path + '"\n' + e)
                }
            }
            if (meta.control.sitemap) {
                let ms = meta.control.sitemap
                if (ms.include && (ms.include is String)) {
                    ms.include = RegExp(ms.include.trim('/'))
                }
                if (ms.exclude && (ms.exclude is String)) {
                    ms.exclude = RegExp(ms.exclude.trim('/'))
                }
            }
        }
    }

    function createService(def) {
        let service = services[def.name] ||= {}
        if (service.name) {
            vtrace('Warn', 'Redefining service "' + def.name + '"" from ' + 
                services[def.name].plugin + ' to ' + def.plugin)
        }
        blend(service, def, {overwrite: false})
        if (service.script) {
            try {
                eval(service.script)
                service.render = global.transform
                delete global.transform
                delete service.script
            } catch (e) {
                fatal('Plugin script error in "' + def.path + '"\n' + e)
            }
        } else if (def.render) {
            service.render = def.render
        }
        stats.services[def.name] = { elapsed: 0, count: 0}

        if (def.to && !(def.to is Array)) {
            def.to = [def.to]
        }
        if (def.from && !(def.from is Array)) {
            def.from = [def.from]
        }
        for each (from in def.from) {
            for each (to in def.to) {
                let mapping = from + ' -> ' + to
                let transform = transforms[mapping] ||= []
                if (!transform.contains(def.name)) {
                    transform.push(def.name)
                }
                vtrace('Plugin', def.plugin + ' provides "' + def.name + '" for ' + mapping)
            }
        }
    }

    function loadPlugin(name, path) {
        let epath = path.join('exp.json')
        if (!epath.exists) {
            fatal('Plugin "' + path + '" is missing exp.json')
        }
        checkEngines(name, path)
        let config = epath.readJSON()
        let definitions = config.control.transforms
        if (!(definitions is Array)) {
            definitions = [definitions]
        }
        for each (def in definitions) {
            def.plugin = name
            def.path = path
            createService(def)
        }
    }

    function loadPlugins() {
        services = topMeta.control.services ||= {}
        transforms = topMeta.control.transforms ||= {}
        createService({ plugin: 'exp-internal', name: 'exp', from: 'exp', to: '*', render: transformExp } )
        let stat = stats.services.exp
        stat.parse = stat.eval = stat.run = 0

        let package = Path('package.json')
        if (package.exists) {
            package = package.readJSON()
            blend(package, { directories: { paks: 'paks' } }, false)
            dirs.paks = Path(package.directories.paks)
        }
        let pakcache = App.home.join('.paks')
        for each (name in topMeta.control.plugins) {
            let fullname = 'exp-' + name
            var path = Version.sort(pakcache.join(fullname).files('*'), -1)[0]
            if (path) {
                loadPlugin(fullname, path)
            } else {
                let path = dirs.paks.join(name)
                if (path.join('exp.json').exists) {
                    loadPlugin(name, dirs.paks.join(name))
                } else {
                    trace('Warn', 'Cannot find plugin "' + name + '"')
                }
            }
        }
    }

    function process(): Void {
        let task = args.rest.shift()
        if (task == 'init') {
            init()
            return
        }
        let rest = args.rest
        let meta = setup()
        vtrace('Task', task, rest)

        switch (task) {
        case 'clean':
            preclean(meta)
            break

        case 'install':
            if (rest.length == 0) {
                usage()
            }
            install(rest, meta)
            break

        case 'render':
            if (rest.length > 0) {
                filters = rest
            } else {
                renderAll = true
            }
            preclean()
            render()
            break

        case 'uninstall':
            if (rest.length == 0) {
                usage()
            }
            uninstall(rest, meta)
            break

        case 'upgrade':
            if (rest.length == 0) {
                usage()
            }
            upgrade(rest, meta)
            break

        case 'watch':
            if (rest.length > 0) {
                filters = rest
            }
            watch(meta)
            break

        default:
            if (task) {
                /* Process only specified files. If not, process all */
                filters = [task] + rest
                renderAll = false
                render()
            } else {
                serve(topMeta)
            }
            break
        }
    }

    function checkDepends(meta) {
        for (let [path, dependencies] in meta.control.dependencies) {
            path = dirs.documents.join(path)
            let deps = buildFileHash(dependencies, dirs.documents)
            for (let file: Path in deps) {
                if (file.modified.time >= lastGen.time) {
                    impliedUpdates[path] = true
                }
            }
        }
    }

    function watch(meta) {
        if (!options.norender) {
            options.quiet = true
            trace('Render', 'Initial render ...')
            renderAll = true
            render()
            renderAll = false
            options.quiet = false
        }
        trace('Watching', 'for changes every ' + meta.control.watch + ' msec ...')
        if (meta.control.watch < 1000) {
            /* File modified resolution is at best (portably) 1000 msec */
            meta.control.watch = 1000
        }
        while (true) {
            let mark = Date(((Date().time / 1000).toFixed(0) * 1000))
            checkDepends(meta)
            event('check', lastGen)
            mastersModified = checkMastersModified()
            render()
            App.sleep(meta.control.watch)
            vtrace('Check', 'for changes (' + Date().format('%I:%M:%S') + ')')
            lastGen = mark
        }
    }

    function serve(meta) {
        let address = options.listen || meta.control.listen || '127.0.0.1:4000'
        let server: HttpServer = new HttpServer({documents: dirs.public})
        let routes = meta.control.routes || Router.Top
        var router = Router(Router.WebSite)
        router.addCatchall()
        server.on("readable", function (event, request) {
            try {
                server.serve(request, router)
            } catch (e) {
                trace('Error', 'Cannot serve request')
                App.log.debug(3, e)
                App.exit(1)
            }
        })
        mastersModified = checkMastersModified()
        try {
            server.listen(address)
        } catch (e) {
            fatal('Cannot listen on', address)
        }
        if (options.nowatch) {
            trace('Listen', address)
            App.run()
        } else {
            trace('Listen', address)
            watch(meta)
        }
    }

    function render() {
        stats.started = new Date
        stats.files = 0
        if (mastersModified) {
            cache = {}
        }
        exclude = buildFileHash(topMeta.control.exclude, dirs.documents)
        copy = buildFileHash(topMeta.control.copy, dirs.documents)

        renderDir(dirs.documents, topMeta.clone(true))
        renderFiles(topMeta)
        postclean()
        sitemap()
        if (options.debug) {
            trace('Debug', '\n' + serialize(stats, {pretty: true, indent: 4, quotes: false}))
            let total = 0
            for each (service in stats.services) {
                total += service.elapsed
            }
            trace('Debug', 'Total plugin time %.2f' % ((total / 1000) + ' secs.'))
        }
        if (renderAll) {
            trace('Info', 'Rendered ' + stats.files + ' files to "' + dirs.public + '". ' +
                'Elapsed time %.2f' % ((stats.started.elapsed / 1000)) + ' secs.')
        } else if (filters && stats.files == 0) {
            trace('Warn', 'No matching files for filter: ' + filters)
        }
    }

    /*
        Not watched
     */
    function renderFiles(meta) {
        if (!filters) {
            if (Path('files').exists && !meta.control.files) {
                meta.control.files = [ Path('files') ]
            }
            for each (let pattern: Path in meta.control.files) {
                cp(pattern, dirs.public, {tree: true, nothrow: true})
            }
        }
    }

    function copyFile(file, meta) {
        let trimmed = rebase(file, dirs.documents)
        if (file.isDir) {
            if (renderAll || checkModified(file, meta)) {
                let home = App.dir
                let dest = dirs.public.absolute
                App.chdir(file)
                trace('Copy', file)
                cp('**', dest.join(trimmed), {tree: true, nothrow: true})
                App.chdir(home)
            } else {
                for each (path in file.files('**')) {
                    if (checkModified(path, meta)) {
                        trace('Copy', path)
                        cp(path, dirs.public.join(path))
                    }
                }
            }
        } else {
            if (renderAll || checkModified(file, meta)) {
                trace('Copy', file)
                cp(file, dirs.public.join(trimmed))
            }
        }
    }

    function buildFileHash(list, dir: Path) {
        let hash = {}
        if (list) {
            if (!(list is Array)) {
                list = [list]
            }
            for each (pattern in list) {
                let path = dir.join(pattern)
                if (path.isDir) {
                    pattern = pattern.toString() + '/**'
                    hash[path] = true
                }
                for each (path in dir.files(pattern)) {
                    hash[path] = true
                }
            }
        }
        return hash
    }

    function matchFile(file, dir, patterns) {
        if (!(patterns is Array)) {
            patterns = [patterns]
        }
        for each (pattern in patterns) {
            let path = dir.join(pattern)
            if (path.isDir) {
                pattern = pattern.toString() + '/**'
            }
            for each (path in dir.files(pattern)) {
                if (file == path) {
                    return true
                }
            }
        }
        return false
    }

    function renderDir(dir: Path, meta) {
        let priorDirs = dirs
        loadConfig(dir, meta)
        dirs = meta.control.directories

        for each (file in dir.files()) {
            if (exclude[file]) {
                continue
            }
            if (filters) {
                let match
                for each (filter in filters) {
                    if (filter.startsWith(file)) {
                        match = true
                        break
                    }
                    if (file.startsWith(filter)) {
                        match = true
                        break
                    }
                }
                if (!match) {
                    continue
                }
            }
            if (copy[file]) {
                copyFile(file, meta)
            } else if (file.isDir) {
                renderDir(file, meta.clone(true))
            } else {
                if (renderAll || filters || mastersModified || checkModified(file, meta)) {
                    transformFile(file, meta)
                }
            }
        }
        dirs = priorDirs
    }

    function checkModified(file, meta) {
        if (impliedUpdates[file]) {
            delete impliedUpdates[file]
            return true
        }
        if (file.isDir) {
            if (file.modified.time >= lastGen.time) {
                return true
            }
            return false
        }
        if (file.modified.time < lastGen.time) {
            return false
        }
        vtrace('Modified', file)
        event('onchange', file, meta)
        return true
    }

    function checkMastersModified(dir): Boolean {
        for each (file in dirs.partials.files('*')) {
            if (file.modified.time >= lastGen.time) {
                event('onchange', file, topMeta)
                return true
            }
        }
        for each (file in dirs.layouts.files('*')) {
            if (file.modified.time >= lastGen.time) {
                event('onchange', file, topMeta)
                return true
            }
        }
        return false
    }

    function getMapping(file, wild = false) {
        let ext = file.extension
        let next = file.trimExt().extension
        if (next) {
            mapping = ext + ' -> ' + next
            if (!transforms[mapping]) {
                mapping = ext + ' -> *'
            }
        } else {
            mapping = ext + ' -> ' + ext
        }
        return mapping
    }

    function getExtensions(file)
        [file.extension, file.trimExt().extension]

    function getDest(file, mapping) {
        let dest
        if (file.startsWith(dirs.documents)) {
            trimmed = rebase(file, dirs.documents)
            dest = dirs.public.join(trimmed)
        } else {
            dest = file
        }
        if (transforms[mapping]) {
            let extensions = mapping.split(' -> ')
            if (extensions[0] != extensions[1]) {
                dest = dest.trimExt()
            }
        }
        return dest
    }

    /*
        Used to trim "documents" ...
     */
    function rebase(file, to) {
        let count = to.components.length
        return file.trimComponents(count)
    }

    function getFinalDest(file, meta) {
        let dest = dirs.public.join(meta.document || rebase(file, dirs.documents))
        let mapping = getMapping(file)
        while (transforms[mapping]) {
            dest = getDest(file, mapping)
            if (dest == file) {
                break
            }
            mapping = getMapping(dest)
            file = dest
        } 
        return dest
    }

    function initMeta(file, meta) {
        global.meta = meta
        meta.document = rebase(file, dirs.documents)
        meta.file = file
        meta.public = publicNames[file] = (publicNames[file] || getFinalDest(file, meta))
        meta.basename = meta.public.basename
        meta.url = Uri(rebase(meta.public, dirs.public))
        let dir = meta.document.dirname
        let count = (dir == '.') ? 0 : dir.components.length
        meta.top = '../'.times(count)
        meta.date = new Date
        global.top = meta.top
    }

    function transformFile(file, meta) {
        let [fileMeta, contents] = splitMetaContents(file, file.readString())
        blendMeta(meta, fileMeta || {})
        initMeta(file, meta)
        contents = transformContents(contents, meta)
        if (fileMeta) {
            contents = blendLayout(contents, meta.clone(true))
        }
        contents = pipeline(contents, '* -> *', meta.public, meta)
        let dest = meta.public
        dest.dirname.makeDir()
        dest.write(contents)
        trace('Created', dest)
        stats.files++
    }

    function transformContents(contents, meta): String {
        let file = meta.file
        let public = meta.public
        let mapping, nextMapping = getMapping(file)
        let transform
        do {
            mapping = nextMapping
            transform = transforms[mapping]
            if (transform) {
                contents = pipeline(contents, mapping, file, meta)
            }
            file = getDest(file, mapping)
            nextMapping = getMapping(file)
        } while (nextMapping != mapping)
        return contents
    }

    function pipeline(contents, mapping, file, meta): String {
        meta.extensions = getAllExtensions(file)
        meta.extension = meta.extensions.slice(-1)[0]
        let transform = transforms[mapping]
        vtrace('Transform', meta.file + ' (' + mapping + ')')
        for each (serviceName in transform) {
            meta.service = service = services[serviceName]
            if (!service) {
                fatal('Cannot find service "' + serviceName + '" for transform "' + mapping)
            }
            if (service.enable !== false) {
                if (service.render) {
                    [meta.from, meta.to] = mapping.split(' -> ')
                    vtrace('Service', service.name + ' from "' + service.plugin + '"')
                    let started = new Date
                    contents = service.render.call(this, contents, meta, service)
                    publicNames[file] = meta.public
                    stats.services[service.name].count++
                    stats.services[service.name].elapsed += started.elapsed
                }
            } else {
                vtrace('Skip', service.name + ' for ' + meta.file + ' (disabled)')
            }
        } 
        if (options.keep && !file.startsWith(dirs.documents)) {
            file.write(contents)
        }
        return contents
    }

    function getAllExtensions(file) {
        let extensions = []
        while (transforms[file.extension]) {
            ext = file.extension
            extensions.push(ext)
            file = file.trimExt()
        }
        extensions.push(file.extension)
        return extensions.reverse()
    }

    function transformExp(contents, meta, service) {
        let priorBuf = this.obuf
        this.obuf = new ByteArray
        let priorMeta = global.meta
        let parser = new ExpParser
        let code
        let stat = stats.services.exp
        try {
            let mark = new Date
            code = parser.parse(contents)
            stat.parse += mark.elapsed
            mark = new Date
            eval(code)
            stat.eval += mark.elapsed

            mark = new Date
            global._export_.call(this)
            stat.run += mark.elapsed
        } catch (e) {
            trace('Error', 'Error when processing ' + meta.file)
            print("CODE @@@@@\n" + code + '\n@@@')
            fatal(e)
        }
        let results = obuf.toString()
        this.obuf = priorBuf
        global.meta = priorMeta
        return results
    }

    function runFile(cmd, contents, meta) {
        let file = meta.file
        let path = file.dirname.join('.expansive.tmp').joinExt(file.extension, true)
        let results
        try {
            vtrace('Save', file + ' -> ' + path)
            path.write(contents)
            cmd += ' ' + path
            vtrace('Run', cmd)
            results = Cmd.run(cmd)
        }
        finally {
            path.remove()
        }
        return results
    }

    function run(cmd, contents) {
        vtrace('Run', cmd)
        return Cmd.run(cmd, {}, contents)
    }

    function searchPak(pak) {
        let pakcache = App.home.join('.paks')
        let path = Version.sort(pakcache.join(pak).files('*'), -1)[0]
        return path ? path : App.dir
    }

    function findFile(dir: Path, pattern: String, meta) {
        for each (f in dir.files(pattern + '*')) {
            if (f.extension == 'html') {
                return f
            }
            for (let mapping in transforms) {
                let extensions = mapping.split(' -> ')
                if (f.extension == extensions[0]) {
                    return f
                }
            }
        }
        return null
    }

    function getCached(path, meta) {
        if (cache[path]) {
            return cache[path]
        }
        let data = path.readString()
        let [fileMeta, contents] = splitMetaContents(path, data)
        blendMeta(meta, fileMeta || {})
        return cache[path] = [meta, contents]
    }

    function blendLayout(contents, meta) {
        while (meta.layout) {
            let layout = findFile(dirs.layouts, meta.layout, meta)
            if (!layout) {
                fatal('Cannot find layout "' + meta.layout + '"')
            }
            meta.layout = ''
            let layoutContents
            [meta, layoutContents] = getCached(layout, meta)
            meta.file = layout
            meta.isLayout = true
            contents = contents.replace(/\$/mg, '$$$$')
            contents = layoutContents.replace(/ *<@ *content *@> */, contents)
            vtrace('Blend', layout + ' + ' + meta.document)
            contents = transformContents(contents, meta)
        }
        return contents
    }

    /*
        This is the partial() global function
     */
    public function blendPartial(name: Path, options = {}) {
        let partial = findFile(dirs.partials, name, global.meta)
        if (!partial) {
            fatal('Cannot find partial "' + name + '"' + ' for ' + meta.document)
        }
        let priorMeta = global.meta
        let meta = global.meta.clone(true)
        blend(meta, options)
        meta.partial = name
        meta.isPartial = true
        meta.file = partial
        try {
            let contents
            [meta, contents] = getCached(partial, meta)
            contents = transformContents(contents, meta)
            write(contents)
        }
        catch (e) {
            trace('Error', 'Cannot process partial "' + name + '"')
            fatal(e)
        } finally {
            global.meta = priorMeta
        }
    }

    function setupEjsTransformer() {
        global.partial = blendPartial
        global.write = write
        global.writeSafe = writeSafe
        global.partial.bind(this)
        global.write.bind(this)
        global.writeSafe.bind(this)
    }

    /*
        Global functions for Expansive templates
     */
    public function writeSafe(...args) {
        obuf.write(html(...args))
    }

    public function write(...args) {
        obuf.write(...args)
    }

    function splitMetaContents(file, contents): Array {
        let meta
        try {
            if (contents[0] == '-') {
                let parts = contents.split('---')
                if (parts) {
                    let mdata = parts[1].trim()
                    contents = parts.slice(2).join('---')
                    meta = {}
                    for each (item in mdata.split('\n')) {
                        let parts = item.trim().match(/([^:]*):(.*)/)
                        if (parts && parts.length >= 2) {
                            let key = parts[1]
                            let value = parts[2].trim().trim('"').trim("'")
                            meta[key] = value
                        }
                    }
                }
            } else {
                if (contents[0] == '{') {
                    let parts = contents.split('\n}')
                    if (parts) {
                        try {
                            meta = deserialize(parts[0] + '}')
                        } catch (e) {
                            trace('Error', 'Badly formatted meta data in ' + file)
                            App.log.debug(3, e)
                        }
                        contents = parts.slice(1).join('\n}')
                    }
                }
            }
        } catch (e) {
            trace('Error', 'Cannot parse meta data in ' + file)
            App.log.debug(3, e)
            App.exit(1)
        }
        return [meta, contents]
    }

    function blendMeta(meta, add) {
        blend(meta, add)
        for (let [key, value] in dirs) {
            dirs[key] = Path(value)
        }
    }

    function event(name, arg = null, meta = null) {
        if (global[name]) {
            global.meta = topMeta
            (global[name]).call(this, arg, meta)
        }
    }

    function preclean() {
        if (!filters && !options.noclean) {
            dirs.public.removeAll()
        }
    }

    function postclean() {
        dirs.public.join('partials').remove()
    }

    function init() {
        let path = CONFIG
        if (path.exists) {
            trace('Warn', CONFIG + ' already exists')
            return
        }
        trace('Create', CONFIG)
        path.write(App.exeDir.join('exp.sample').readString())
        for each (p in [ 'documents', 'layouts', 'partials', 'files', 'public' ]) {
            Path(p).makeDir()
        }
    }

    function savePlugins(list) {
    print("LIST", list)
        let pstr = serialize(list).replace(/,/g, ', ').replace(/"/g, '\'').replace(/\[/, '[ ').replace(/\]/, ' ]')
        let path = Path('exp.json')
        let data = path.readString().replace(/ *plugins:.*,$/m, '        plugins: ' + pstr + ',')
        path.write(data)
    }

    function install(plugins, meta) {
        let pakcache = App.home.join('.paks')
        let updated
        for each (pak in plugins) {
            pak = pak.trimStart('exp-')
            let name = 'exp-' + pak
            if (meta.control.plugins.contains(pak) && pakcache.join(name).exists) {
                trace('Info', pak + ' is already installed')
            } else {
                if (pakcache.join(name).exists) {
                    trace('Installed', 'Plugin ' + pak)
                } else {
                    try {
                        let pakcmd = Cmd.locate('pak')
                        if (!pakcmd) {
                            fatal('Cannot find pak. Install from https://embedthis.com/pak')
                        }
                        trace('Run', 'pak cache ' + name)
                        Cmd.run([pakcmd, 'cache', name])
                        trace('Installed', name + ' to ' + App.home.join('.paks'))
                    } catch(e) {
                        fatal('Cannot install', name + '\n' + e.message)
                    }
                }
                updated = true
            }
        }
        if (updated) {
            let path = Path('exp.json')
            let plist = path.readJSON().control.plugins || []
            savePlugins((plist + plugins).unique())
        }
    }

    function uninstall(plugins, meta) {
        plugins = plugins.map(function(e) e.trimStart('exp-'))
        let path = Path('exp.json')
        let plist = path.readJSON().control.plugins || []
        savePlugins((plist - plugins).unique())
    }

    function upgrade(plugins, meta) {
        for each (pak in plugins) {
            pak = pak.trimStart('exp-')
            let name = 'exp-' + pak
            try {
                let pakcmd = Cmd.locate('pak')
                if (!pakcmd) {
                    fatal('Cannot find pak. Install from https://embedthis.com/pak')
                }
                trace('Run', 'pak update ' + name)
                Cmd.run([pakcmd, 'update', name])
                trace('Updated', name)
            } catch(e) {
                fatal('Cannot update', name + '\n' + e.message)
            }
        }
    }

    function sitemap() {
        let sm = topMeta.control.sitemap
        if (!sm || !(renderAll || mastersModified)) {
            return
        }
        let path = dirs.public.join('Sitemap.xml')
        path.dirname.makeDir()
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        let include = buildFileHash(sm.include, dirs.public)
        let exclude = buildFileHash(sm.exclude, dirs.public)
        let count = 0
        for each (file in dirs.public.files('**')) {
            if (!include[file]) {
                continue
            }
            if (exclude[file]) {
                continue
            }
            let trimmed = rebase(file, dirs.public)
            let filename = trimmed.toString().trimEnd('.gz') 
            fp.write('    <url>\n' +
                '        <loc>' + topMeta.url + '/' + trimmed + '</loc>\n' +
                '        <lastmod>' + file.modified.format('%F') + '</lastmod>\n' +
                '        <changefreq>weekly</changefreq>\n' +
                '        <priority>0.5</priority>\n' +
                '    </url>\n')
            count++
        }
        fp.write('</urlset>\n')
        fp.close()
        if (!options.quiet) {
            trace('Create', path + ', ' + count + ' entries')
        }
    }

    function fatal(...args): Void {
        log.error(...args)
        App.exit(1)
    }

    function trace(tag: String, ...args): Void {
        if (!options.quiet) {
            log.activity(tag, ...args)
        }
    }

    function vtrace(tag: String, ...args): Void {
        if (verbosity > 0) {
            log.activity(tag, ...args)
        }
    }

    function touch(path: Path) {
        path.dirname.makeDir()
        if (path.exists) {
        } else {
            path.write('')
        }
    }

    public function getFileMeta(file: Path) {
        let [meta, contents] = splitMetaContents(file, file.readString())
        meta = blend(topMeta.clone(true), meta || {})
        return meta
    }

    public function collection(query: Object, operation = 'and', pattern = "**") {
        let list = []
        for each (file in dirs.documents.files(pattern)) {
            if (file.isDir) continue
            let meta = getFileMeta(file)
            let match = true
            for (let [key, value] in query) {
                if (meta[key] != value) {
                    match = false
                }
            }
            if (match) {
                list.push(file)
            }
        }
        return list
    }


    function checkEngines(name, path) {
        path = path.join('package.json')
        if (path.exists) {
            let obj = path.readJSON()
            for (engine in obj.engines) {
                if (!Cmd.locate(engine)) {
                    trace('Warn', 'Cannot locate required "' + engine + '" for plugin "' + name + '"')
                }
            }
        }
    }
}

/*
    Main program
 */
var exp: Exp = new Exp

//  MOB - is this needed in scripts or is "this" set to expansive?
global.expansive = exp

try {
    exp.parseArgs()
    exp.process()
} catch (e) {
    App.log.error('Internal application error')
    App.log.error(e)
    App.exit(1)
}
} /* module exp */

/*
    @copy   default

    Copyright (c) Embedthis Software LLC, 2003-2014. All Rights Reserved.

    This software is distributed under commercial and open source licenses.
    You may use the Embedthis Open Source license or you may acquire a
    commercial license from Embedthis Software. You agree to be fully bound
    by the terms of either license. Consult the LICENSE.md distributed with
    this software for full details and other copyrights.

    Local variables:
    tab-width: 4
    c-basic-offset: 4
    End:
    vim: sw=4 ts=4 expandtab

    @end
 */
