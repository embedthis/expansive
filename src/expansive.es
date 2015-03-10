#!/usr/bin/env ejs
/*
    expansive.es - Expansive Static Site Generator
 */

module expansive {

require ejs.unix
require ejs.web
require ejs.version
require expansive.template

const CONFIG: Path = Path('expansive')
const HOME = Path(App.getenv('HOME') || App.getenv('USERPROFILE') || '.')
const VERSION = '0.1.0'
const LISTEN = '127.0.0.1:4000'
const EXTENSIONS = ['js', 'css']
const PACKAGE = Path('package.json')

const USAGE = 'Expansive Web Site Generator
  Usage: exp [options] [filters ...]
    --benchmark          # Show per-plugin stats
    --chdir dir          # Change to directory before running
    --keep               # Keep intermediate transform results
    --listen IP:PORT     # Endpoint to listen on
    --log path:level     # Trace to logfile
    --noclean            # Do not clean "documents" before render
    --norender           # Do not do an initial render before watching
    --nowatch            # Do not watch for changes, just serve
    --quiet              # Quiet mode
    --trace path:level   # Trace http requests
    --verbose            # Verbose mode
    --version            # Output version information
  Commands :
    clean                # Clean "documents" output directory
    edit key[=value]     # Get and set expansive.json values
    filters, ...         # Render only matching files
    init                 # Create expansive.json
    mode [debug|release] # Select property mode set
    render               # Render entire site
    watch                # Watch for changes and render as required
    <CR>                 # Serve and watches for changes
'

public class Expansive {
    var args: Args
    var cache: Object
    var config: Object
    var collections: Object = {}
    var control: Object
    var copy: Object
    var currentConfig: Object
    var directories: Object
    var dirTokens: Object
    var filters: Array
    var destCache: Object
    var renderAll: Boolean
    var impliedUpdates: Object
    var initialized: Boolean
    var lastRestart = new Date
    var lastGen: Date
    var log: Logger = App.log
    var mastersModified: Boolean
    var metaCache: Object
    var modified: Boolean
    var obuf: ByteArray?
    var options: Object
    var package: Object
    var paks: Object = {}
    var pid: Number?
    var plugins: Object = {}
    var services: Object = {}
    var sitemaps: Array = []
    var stats: Object
    var topMeta: Object
    var transforms: Object = {}
    var postProcessors: Array = []
    var verbosity: Number = 0

    let argsTemplate = {
        options: {
            benchmark: { alias: 'b' },        /* Undocumented */
            chdir:     { range: Path },       /* Implemented in expansive.c */
            debug:     { alias: 'd' },        /* Undocumented */
            keep:      { alias: 'k' },
            listen:    { range: String },
            log:       { alias: 'l', range: String },
            noclean:   { },
            norender:  { },
            nowatch:   { },
            quiet:     { alias: 'q' },
            trace:     { alias: 't', range: String },
            verbose:   { alias: 'v' },
            version:   { },
        },
        unknown: unknown,
        usage: usage,
    }

    var PakTemplate = {
        name: 'Package Name',
        title: 'Display Package Title - several words. E.g. Company Product',
        description: 'Full Package Description - one line',
        version: '1.0.0',
        pak: {
            mode: 'debug',
            import: true,
        }
    }

    function Expansive() {
        cache = {}
        /*
            Updated with expansive {} properties from expansive.es files
         */
        control = {
            collections: {},
            copy: ['images'],
            dependencies: {},
            directories: {
                contents:   Path('contents'),
                dist:       Path('dist'),
                files:      Path('files'),
                layouts:    Path('layouts'),
                lib:        Path('lib'),
                paks:       Path('paks'),
                partials:   Path('partials'),
                /*
                    Top is absolute so that render properties can use ${TOP} to bypass the join with directories.lib
                 */
                top:        Path().absolute,
            },
            documents: [ 'lib/**', 'contents/**' ],
            listen: LISTEN,
            watch: 1200,
            services: {},
            transforms: {}
        }
        directories = control.directories
        impliedUpdates = {}
        destCache = {}
        stats = {services: {}}
        topMeta = {
            layout: 'default',
            control: control,
        }
        if (App.config.expansive) {
            /* From ejsrc */
            blendMeta(topMeta, App.config.expansive)
        }
        global.meta = topMeta
        lastGen = new Date()
    }

    public function unknown(argv, i) {
        let arg = argv[i].slice(argv[i].startsWith("--") ? 2 : 1)
        if (arg == '?') {
            expansive.usage()
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
        App.log.name = 'expansive'
        args = Args(argsTemplate, App.args)
        options = args.options
        if (options.version) {
            print(VERSION)
            App.exit(0)
        }
        if (options.verbose) {
            verbosity++
        }
    }

    function setup(task) {
        if (!findConfig('.')) {
            if (task == 'init' || task == 'install') {
                init()
            } else {
                fatal('Cannot find expansive configuration file')
            }
        }
        package = loadPackage()
        config = readConfig('.')
        loadConfig('.', topMeta)
        checkPaks()
        loadPlugins()
        setupEjsTransformer()
        if (options.debug) {
            dump('Meta', topMeta)
            dump('Control', control)
            dump('Transforms', transforms)
            dump('Services', services)
        }
        initialized = true
        return topMeta
    }

    public static function load(obj: Object) {
        expansive.currentConfig = obj
    }

    function findConfig(dir: Path): Path? {
        let path = dir.join(CONFIG).joinExt('json')
        if (path.exists) {
            return path
        }
        path = dir.join(CONFIG).joinExt('es')
        if (path.exists) {
            return path
        }
        return null
    }

    function readConfig(path: Path): Object {
        path = findConfig(path)
        currentConfigPath = path
        try {
            vtrace('Loading', path)
            if (path.extension == 'json') {
                currentConfig = path.readJSON()
            } else {
                global.load(path)
            }
        } catch (e) {
            fatal('Syntax error in "' + path + '"' + '\n' + e)
        }
        return currentConfig
    }

    function loadConfig(path: Path, meta = {}): Object {
        let cfg = readConfig(path)
        vtrace('Info', 'Using mode:', package.pak.mode)
        let mode = cfg[package ? package.pak.mode : '']
        if (mode) {
            blend(cfg, { meta: {}, control: {}, services: {}}, {combine: true})
            blend(cfg.meta, mode.meta, {combine: true})
            if (!initialized) {
                blend(cfg.control, mode.control, {combine: true})
                blend(cfg.services, mode.services, {combine: true})
            }
            delete meta[cfg.mode]
        }
        blend(meta, cfg.meta)
        if (!initialized) {
            blend(control, cfg.control, {combine: true})
            for (let [key,value] in cfg.services) {
                if (value === true || value === false) {
                    cfg.services[key] = { enable: value }
                }
            }
            blend(services, cfg.services, {combine: true})
        }
        if (cfg.control && cfg.control.script) {
            delete control.script
            try {
                vtrace('Eval', 'Script for ' + path)
                eval(cfg.control.script)
            } catch (e) {
                fatal('Script error in "' + path + '"\n' + e)
            }
        }
        castDirectories()
        return meta
    }

    function createService(def) {
        if (def.from) {
            trace('Warn', 'Service ' + def.name + ' is using the legacy "from" property. Use "input" instead')
            def.input = def.from
            delete def.from
        }
        if (def.to) {
            trace('Warn', 'Service ' + def.name + ' is using the legacy "to" property. Use "output" instead')
            def.output = def.to
            delete def.to
        }
        let service = services[def.name] ||= {}
        if (service.name) {
            vtrace('Warn', 'Redefining service "' + def.name + '"" from ' +
                services[def.name].plugin + ' to ' + def.plugin)
        }
        blend(service, def, {overwrite: false})
        service.render = def.render
        if (service.enable == null) {
            service.enable = true
        }
        stats.services[def.name] = { elapsed: 0, count: 0}

        //  DEPRECATE input/output
        if (def.output && !(def.output is Array)) {
            def.output = [def.output]
        }
        if (def.input && !(def.input is Array)) {
            def.input = [def.input]
        }
        if (def.input) {
            //DEPRECATE
            trace('Warn', 'Using deprecated input/output. Use mappings instead.')
            dump("DEF", def)
        }
        for each (input in def.input) {
            for each (output in def.output) {
                let mapping = input + ' -> ' + output
                let transform = transforms[mapping] ||= []
                if (!transform.contains(def.name)) {
                    transform.push(def.name)
                }
                vtrace('Plugin', def.plugin + ' provides "' + def.name + '" for ' + mapping)
            }
        }
        if (def.mappings is String) {
            let v = {}
            v[def.mappings] = def.mappings
            def.mappings = v
        }
        for (let [key,value] in def.mappings) {
            if (!value) {
                value = [key]
            } else if (!(value is Array)) {
                value = [value]
            }
            for each (to in value) {
                let mapping = key + ' -> ' + to
                let transform = transforms[mapping] ||= []
                if (!transform.contains(def.name)) {
                    transform.push(def.name)
                }
                vtrace('Plugin', def.plugin + ' provides "' + def.name + '" for ' + mapping)
            }
        }
    }

    function loadPlugin(name, requiredVersion) {
        if (plugins[name]) {
            return
        }
        plugins[name] = true

        let path = findPackage(name, requiredVersion)
        if (!path) {
            trace('Warn', 'Cannot load plugin ' + name + ' ' + requiredVersion)
            return
        }
        vtrace('Load', 'Plugin', path)
        checkEngines(name, path)

        let epath = findConfig(path)
        if (epath && epath.exists) {
            if (epath.extension == 'json') {
                currentConfig = epath.readJSON()
            } else {
                global.load(epath)
            }
            let pluginMeta = currentConfig
            if (pluginMeta.expansive) {
                trace('Warn', 'Plugin ' + path + ' is using deprecated expansive property')
                if (pluginMeta.expansive.transforms) {
                    trace('Warn', 'Plugin ' + path + ' is using deprecated expansive.transforms property')
                    pluginMeta.transforms = pluginMeta.expansive.transforms
                }
            }
            let defs = (pluginMeta.transforms)
            if (defs) {
                if (!(defs is Array)) {
                    defs = [defs]
                }
                for each (def in defs) {
                    def.plugin = name
                    def.path = path
                    createService(def)
                }
            }
        }
        let pkg = readPackage(path)
        if (!pkg) {
            throw 'Cannot find plugin package.json at: ' + path
        }
        for (let [name, requiredVersion] in pkg.dependencies) {
            loadPlugin(name, requiredVersion)
        }
    }

    function loadPlugins() {
        createService({ plugin: 'exp-internal', name: 'exp', mappings: { exp: '*' }, render: transformExp } )
        let stat = stats.services.exp
        stat.parse = stat.eval = stat.run = 0

        for (let [name, requiredVersion] in package.dependencies) {
            loadPlugin(name, requiredVersion)
        }
        for each (service in services) {
            if (service.script) {
                try {
                    eval(service.script)
                    service.render = global.transform
                    delete global.transform
                    if (global.post) {
                        postProcessors.push({ service: service, post: global.post})
                        delete global.post
                    }
                    delete service.script
                } catch (e) {
                    fatal('Plugin script error in "' + service.name + '"\n' + e)
                }
            }
        }
    }

    function readPackage(dir: Path) {
        let path = dir.join(PACKAGE)
        if (path.exists) {
            return path.readJSON()
        }
        return null
    }

    function loadPackage() {
        let pkg = readPackage('.')
        if (pkg) {
            pkg.pak ||= {}
            blend(directories, pkg.directories)
            castDirectories()
            topMeta.description = pkg.description
            topMeta.title = pkg.title
        }
        return pkg || {pak: {}}
    }

    function findPackage(name, requiredVersion = '*'): Path? {
        if (name.contains('#')) {
            [name,requiredVersion] = name.split('#')
        }
        let path = directories.paks.join(name)
        if (path.exists) {
            return path
        }
        let pakcache = App.home.join('.paks')
        for each (vpath in Version.sort(pakcache.join(name).files('*/*'))) {
            let version = Version(vpath.basename)
            if (version.acceptable(requiredVersion)) {
                return vpath
            }
        }
        return null
    }

    function process(): Void {
        let task = args.rest.shift()
        if (task == 'init') {
            init()
            return
        }
        let rest = args.rest
        let meta = setup(task)
        vtrace('Task', task, rest)

        switch (task) {
        case 'clean':
            preclean(meta)
            break

        case 'edit':
            edit(rest, meta)
            break

        case 'mode':
            mode(rest)
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
        for (let [path, dependencies] in control.dependencies) {
            path = directories.contents.join(path)
            let deps = directories.contents.files(dependencies)
            for each (let file: Path in deps) {
                if (file.modified.time >= lastGen.time) {
                    impliedUpdates[path] = true
                    modified = true
                    event('onchange', file, meta)
                }
            }
        }
    }

    function watch(meta) {
        mastersModified = checkMastersModified()
        if (!options.norender) {
            trace('Render', 'Initial render ...')
            options.quiet = true
            renderAll = true
            render()
            renderAll = false
            options.quiet = false
        }
        trace('Watching', 'for changes every ' + control.watch + ' msec ...')
        if (control.watch < 1000) {
            /* File modified resolution is at best (portably) 1000 msec */
            control.watch = 1000
        }
        while (true) {
            let mark = Date(((Date().time / 1000).toFixed(0) * 1000))
            modified = false
            event('check', lastGen)
            checkDepends(meta)
            mastersModified = checkMastersModified()
            render(false)
            if (options.serve && modified) {
                restartServer()
            }
            App.sleep(control.watch)

            vtrace('Check', 'for changes (' + Date().format('%I:%M:%S') + ')')
            if (modified) {
                lastGen = mark
            }
        }
    }

    function externalServer() {
        if (pid) {
            vtrace('Kill', 'Server', pid)
            Cmd.kill(pid)
            pid = null
        }
        command = (services.serve) ? services.serve.command : null
        if (command) {
            let cmd = new Cmd
            cmd.on('readable', function(event, cmd) {
                let buf = new ByteArray
                let len = cmd.read(buf, -1)
                prints(buf)
                if (len == 0 && cmd.wait(0)) {
                    options.quiet = false
                    trace('Info', 'Server exited, restarting ...')
                    pid = cmd.pid
                    restartServer()
                }
            })
            cmd.start(command, {detach: true})
            cmd.finalize()
            pid = cmd.pid
            trace('Run', command, '(' + pid + ')')
        }
        lastRestart = new Date
    }

    function internalServer() {
        let address = options.listen || control.listen || '127.0.0.1:4000'
        let server: HttpServer = new HttpServer({documents: directories.dist})
        let routes = control.routes || Router.Top
        var router = Router(Router.WebSite)
        router.addCatchall()
        server.on('readable', function (event, request) {
            try {
                server.serve(request, router)
            } catch (e) {
                trace('Error', 'Cannot serve request')
                App.log.debug(3, e)
                App.exit(1)
            }
        })
        try {
            server.listen(address)
        } catch (e) {
            fatal('Cannot listen on', address)
        }
    }

    function restartServer() {
        if (services.serve && services.serve.command) {
            if (lastRestart.elapsed < 5000) {
                trace('Info', 'Server lasted less than 5 seconds, pausing 5 seconds before restart')
                setTimeout(function() { externalServer() }, 5000)
            } else {
                trace('Info', 'Restart server')
                externalServer()
            }
        }
    }

    function serve(meta) {
        if (services.serve && services.serve.command) {
            externalServer()
        } else {
            internalServer()
        }
        options.serve = true
        let address = options.listen || control.listen || '127.0.0.1:4000'
        if (options.nowatch) {
            trace('Listen', address)
            App.run()
        } else {
            trace('Listen', address)
            watch(meta)
        }
    }

    function render(initial = true) {
        stats.started = new Date
        stats.files = 0
        if (mastersModified) {
            cache = {}
        }
        copy = {}
        for each (item in directories.contents.files(control.copy, {contents: true})) {
            copy[item] = true
        }
        if (initial) {
            renderFiles(topMeta)
        }
        renderDocuments()
        renderSitemaps()
        postProcess()
        postclean()

        if (options.benchmark) {
            trace('Debug', '\n' + serialize(stats, {pretty: true, indent: 4, quotes: false}))
            let total = 0
            for each (service in stats.services) {
                total += service.elapsed
            }
            trace('Debug', 'Total plugin time %.2f' % ((total / 1000) + ' secs.'))
        }
        if (renderAll) {
            trace('Info', 'Rendered ' + stats.files + ' files to "' + directories.dist + '". ' +
                'Elapsed time %.2f' % ((stats.started.elapsed / 1000)) + ' secs.')
        } else if (filters && stats.files == 0) {
            trace('Warn', 'No matching files for filter: ' + filters)
        }
    }

    /*
        Render 'files' and 'lib'. These are rendered without processing by a simple copy.
        Note: the paths under files do not copy the first directory portion, whereas the files under lib do.
        Note: files and lib are not watched for changes.
     */
    function renderFiles(meta) {
        if (!filters) {
            let files = (control.files || []).clone()
            directories.dist.makeDir()
            if (directories.files.exists) {
                files.push(directories.files)
            }
            cp(files, directories.dist, {
                flatten: false,
                trim: 1,
                post: function(from, to) {
                    expansive.trace('Copy', to)
                }
            })
            files = []
            cp(files, directories.dist, {
                flatten: false,
                post: function(from, to) {
                    expansive.trace('Copy', to)
                }
            })
        }
    }

    /*
        Copy file as-is without processing
     */
    function copyFile(file, meta) {
        let trimmed = trimPath(file, directories.contents)
        if (file.isDir) {
            if (renderAll || checkModified(file, meta)) {
                trace('Copy', file)
                cp(file.join('**'), directories.dist.join(trimmed), {dir: true, relative: file})

            } else {
                for each (path in file.files('**')) {
                    if (checkModified(path, meta)) {
                        trace('Copy', path)
                        cp(path, directories.dist.join(path))
                    }
                }
            }
        } else {
            if (renderAll || checkModified(file, meta)) {
                trace('Copy', file)
                cp(file, directories.dist.join(trimmed))
            }
        }
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

    /*
        Create meta cache for each directory that will be processed.
        Load expansive.es files and inherit upper definitions.
     */
    function buildMetaCache() {
        if (!metaCache) {
            metaCache ||= {}
            let dirs = [ Path('.'), directories.contents, directories.lib ]
            dirs += directories.top.files(control.documents, {include: /\/$/, relative: true})

            for each (dir in dirs) {
                if (findConfig(dir)) {
                    let meta = metaCache[dir.parent] || topMeta
                    let meta = metaCache[dir] = loadConfig(dir, meta.clone(true))
                    if (meta.sitemap) {
                        /* Site maps must be processed after all rendering using the documents directory */
                        let pubdir = trimPath(dir, directories.contents)
                        pubdir = directories.dist.join(pubdir)
                        sitemaps.push({dir: pubdir, meta: meta, sitemap: meta.sitemap})
                    }
                } else {
                    metaCache[dir] = metaCache[dir.parent] || metaCache['.']
                }
            }
        }
    }

    /*
        Test if a path should be processed according to command line filters
     */
    function filter(path: Path): Boolean {
        if (!filters) {
            return true
        }
        for each (filter in filters) {
            if (filter.startsWith(path) || path.startsWith(filter)) {
                return true
            }
        }
        return false
    }

    function renderDocuments() {
        buildMetaCache()
        let files = directories.top.files(control.documents, {exclude: 'directories', relative: true})
        for (let [index,file] in files) {
            if (!filter(file)) {
                continue
            }
            let meta = metaCache[file.dirname]
            if (copy[file]) {
                copyFile(file, meta)
            } else if (renderAll || filters || mastersModified || checkModified(file, meta)) {
                modified = true
                renderDocument(file, meta)
            }
        }
    }

    function postProcess() {
        if (modified) {
            for each (pp in postProcessors) {
                vtrace('Process', pp.service.name)
                if (pp.service.enable !== false) {
                    pp.post.call(this, meta, pp.service)
                }
            }
        }
    }

    function renderSitemaps() {
        for each (map in sitemaps) {
            sitemap(map)
        }
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
        if (file.modified && file.modified.time < lastGen.time) {
            return false
        }
        vtrace('Modified', file)
        modified = true
        event('onchange', file, meta)
        return true
    }

    function checkMastersModified(dir): Boolean {
        for each (file in directories.partials.files('*')) {
            if (file.modified.time >= lastGen.time) {
                modified = true
                event('onchange', file, topMeta)
                return true
            }
        }
        for each (file in directories.layouts.files('*')) {
            if (file.modified.time >= lastGen.time) {
                modified = true
                event('onchange', file, topMeta)
                return true
            }
        }
        return false
    }

    function getExt(file: Path) {
        if (!file.extension) {
            return ''
        }
        let extensions = file.basename.name.split('.').slice(1)
        while (extensions.length) {
            for (let [key,value] in transforms) {
                let [from] = key.split(' -> ')
                let joined = extensions.join('.')
                if (from == joined) {
                    return from
                }
            }
            extensions.shift()
        }
        return file.extension
    }

    function getMapping(file, wild = false) {
        let ext = getExt(file)
        let next = getExt(file.trimEnd('.' + ext))
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

//  MOB - not right
    function getExtensions(file) {
    print("WARNING")
        return [file.extension, file.trimExt().extension]
    }

    function getMappingDest(file, mapping) {
        let dest
        if (!file.startsWith(directories.dist)) {
            dest = directories.dist.join(file)
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

    public function trimPath(file, dir) {
        let count = dir.components.length
        return file.trimComponents(count)
    }

    public function getDest(file, meta) {
        meta ||= topMeta
        let dest = directories.dist.join(meta.sourcePath || file)
        let mapping = getMapping(file)
        while (transforms[mapping]) {
            dest = getMappingDest(file, mapping)
            if (dest == file) {
                break
            }
            mapping = getMapping(dest)
            file = dest
        }
        return dest
    }

    /*
        Initialize meta

        source   - Current source file being processed. Relative path including 'contents/lib/layouts/partials'.
        dest     - Destination filename being created. Relative path including 'dist'.
        base     - Source file without 'contents/lib'.
        document - Source of the document being processed. For partials/layouts, it is the invoking document.
        path     - Destination without 'dist'. Note: may have different extensions to base.
        url      - Url made from 'path'.
        top      - Relative URL to application home page.
     */
    function initMeta(path, meta) {
        meta.document = path
        meta.source = path

        let sourcePath
        if (path.startsWith(directories.contents)) {
            sourcePath = path.trimComponents(directories.contents.components.length)
        } else if (path.startsWith(directories.lib)) {
            sourcePath = path.trimComponents(directories.lib.components.length)
        } else {
            sourcePath = path
        }
        meta.sourcePath = sourcePath
        meta.dest = destCache[meta.source] = (destCache[meta.source] || getDest(sourcePath, meta))
        meta.path = trimPath(meta.dest, directories.dist)
        meta.url = Uri(meta.path)

        let dir = meta.path.dirname
        let count = (dir == '.') ? 0 : dir.components.length
        meta.top = '../'.times(count)
        meta.date = new Date
        global.top = meta.top
    }

    function renderDocument(file, meta) {
        /*
            Collections reset at the start of each document so layouts/partials can modify
         */
        collections = (control.collections || {}).clone()
        let [fileMeta, contents] = splitMetaContents(file, file.readString())
        meta = blendMeta(meta.clone(true), fileMeta || {})
        initMeta(file, meta)
        contents = transformContents(contents, meta)
        if (fileMeta) {
            contents = blendLayout(contents, meta)
        }
        contents = pipeline(contents, '* -> *', meta.dest, meta)
        if (contents != null) {
            let dest = meta.dest
            dest.dirname.makeDir()
            dest.write(contents)
            trace('Render', dest)
            stats.files++
        }
    }

    function transformContents(contents, meta) {
        let file = meta.source
        let mapping, nextMapping = getMapping(file)
        let transform
        do {
            mapping = nextMapping
            transform = transforms[mapping]
            if (transform) {
                contents = pipeline(contents, mapping, file, meta)
            }
            file = getMappingDest(file, mapping)
            nextMapping = getMapping(file)
        } while (nextMapping != mapping && contents != null)
        return contents
    }

    function pipeline(contents, mapping, file, meta) {
        meta.extensions = getAllExtensions(file)
        meta.extension = meta.extensions.slice(-1)[0]
        let transform = transforms[mapping]
        vtrace('Transform', meta.source + ' (' + mapping + ')')

        for each (serviceName in transform) {
            let service = meta.service = services[serviceName]
            if (!service) {
                fatal('Cannot find service "' + serviceName + '" for transform "' + mapping)
            }
            meta.service = service
            if (service.enable !== false) {
                if (service.render) {
                    if (service.files && !meta.source.glob(service.files)) {
                        App.log.debug(3, 'Document "' + meta.source + '" does not match "' + service.files + '"')
                    }
                    [meta.input, meta.output] = mapping.split(' -> ')
                    vtrace('Service', service.name + ' from "' + service.plugin + '"')
                    let started = new Date
                    try {
                        contents = service.render.call(this, contents, meta, service)
                    } catch (e) {
                        print(e)
                        if (options.serve) {
                            trace('Error', 'Cannot render ' + file)
                            print(e)
                        } else {
                            throw e
                        }
                    }
                    destCache[meta.source] = meta.dest
                    stats.services[service.name].count++
                    stats.services[service.name].elapsed += started.elapsed
                }
            } else {
                vtrace('Skip', service.name + ' for ' + meta.source + ' (disabled)')
            }
            if (contents == null) {
                break
            }
        }
        if (options.keep && file.startsWith(directories.dist)) {
            trace('Keep', file, mapping)
            file.dirname.makeDir()
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
        let parser = new ExpansiveParser
        let code
        let stat = stats.services.exp
        let priorMeta = global.meta
        try {
            let mark = new Date
            code = parser.parse(contents)
            stat.parse += mark.elapsed
            mark = new Date
            eval(code)
            stat.eval += mark.elapsed

            mark = new Date
            global.meta = meta
            global._export_.call(this)
            stat.run += mark.elapsed
        } catch (e) {
            trace('Error', 'Error when processing ' + meta.source)
            print('CODE \n' + code + '\n')
            fatal(e)
        }
        let results = obuf.toString()
        this.obuf = priorBuf
        global.meta = priorMeta
        return results
    }

    function runFile(cmd, contents, meta) {
        let file = meta.source
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

    function run(cmd, contents = null) {
        if (cmd is Array) {
            vtrace('Run', cmd.join(' '))
        } else {
            vtrace('Run', cmd)
        }
        return Cmd.run(cmd, {}, contents)
    }

    function searchPak(pak) {
        let pakcache = App.home.join('.paks')
        let path = Version.sort(pakcache.join(pak).files('*'), -1)[0]
        return path ? path : App.dir
    }

    /*
        Find a layout or partial.
        Find the first matching file using the order of transforms
     */
    function findFile(dir: Path, pattern: String, meta) {
        let path
        for each (f in dir.files(pattern + '.*')) {
            if (f.extension == 'html') {
                return f
            }
            for (let mapping in transforms) {
                let extensions = mapping.split(' -> ')
                if (f.extension == extensions[0]) {
                    return f
                }
            }
            if (!path) {
                path = f
            }
        }
        return path
    }

    function getCached(path, meta) {
        if (cache[path]) {
            let [fileMeta, contents] = cache[path]
            blendMeta(meta, fileMeta)
            return [meta, contents]
        }
        let data = path.readString()
        let [fileMeta, contents] = splitMetaContents(path, data)
        cache[path] = [fileMeta, contents]
        blendMeta(meta, fileMeta || {})
        return [meta, contents]
    }

    function blendLayout(contents, meta) {
        meta = meta.clone(true)
        if (!meta.layout) {
            contents = transformContents(contents, meta)
        } else {
            while (meta.layout) {
                let layout = findFile(directories.layouts, meta.layout, meta)
                if (!layout) {
                    fatal('Cannot find layout "' + meta.layout + '"')
                }
                meta.layout = ''
                let layoutContents
                [meta, layoutContents] = getCached(layout, meta)
                meta.source = layout
                meta.isLayout = true
                contents = contents.replace(/\$/mg, '$$$$')
                contents = layoutContents.replace(/ *<@ *content *@> */, contents)
                vtrace('Blend', layout + ' + ' + meta.source)
                contents = transformContents(contents, meta)
            }
        }
        return contents
    }

    /*
        This is the partial() global function
     */
    public function blendPartial(name: Path, options = {}) {
        let meta = global.meta.clone(true)
        let partial = findFile(directories.partials, name, meta)
        if (!partial) {
            fatal('Cannot find partial "' + name + '"' + ' for ' + meta.source)
        }
        blend(meta, options)
        if (meta.partial == name) {
            fatal('Recursive partial in "' + partial + '"')
        }
        meta.partial = name
        meta.isPartial = true
        meta.isLayout = false
        meta.source = partial
        try {
            let contents
            [meta, contents] = getCached(partial, meta)
            contents = transformContents(contents, meta)
            write(contents)
        }
        catch (e) {
            trace('Error', 'Cannot process partial "' + name + '"')
            fatal(e)
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
            //  DEPRECATE
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
                //  TEMP - need something better
                if (contents[0] == '{' && file.extension != 'json' && file.extension != 'map') {
                    let parts = contents.split('\n}')
                    //  TEMP - need something better
                    if (parts && parts.length > 1) {
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

    function blendMeta(meta, add): Object {
        blend(meta, add)
        for (let [key, value] in directories) {
            directories[key] = Path(value)
        }
        return meta
    }

    function edit(rest, meta) {
        let obj = config
        for each (arg in rest) {
            let [key,value] = arg.split('=')
            if (value) {
                let parts = key.split('.')
                for each (part in parts.slice(0, -1)) {
                    obj = obj[part]
                    if (!obj) {
                        fatal('Key ' + key + ' not found')
                    }
                }
                obj[parts.pop()] = value
                CONFIG.joinExt('.json').write(serialize(config, {pretty: true, indent: 4}) + '\n')
                trace('Update', key, '=', value)
            } else {
                for each (part in key.split('.')) {
                    config = config[part]
                    if (!config) {
                        fatal('Key ' + key + ' not found')
                    }
                }
                print(config)
            }
        }
    }

    function event(name, arg = null, meta = null) {
        if (global[name]) {
            (global[name]).call(this, arg, meta)
        }
    }

    function preclean() {
        if (!filters && !options.noclean) {
            directories.dist.removeAll()
        }
    }

    function postclean() {
        directories.dist.join('partials').remove()
    }

    function init() {
        if (findConfig('.')) {
            trace('Warn', 'Expansive configuration already exists')
            return
        }
        let path = CONFIG.joinExt('json')
        trace('Create', path)
        path.write(App.exeDir.join('sample.json').readString())
        for each (p in [ 'documents', 'layouts', 'partials', 'source' ]) {
            Path(p).makeDir()
        }
        if (!PACKAGE.exists) {
            PakTemplate.name = '' + App.dir.basename
            PakTemplate.title = PakTemplate.name.toPascal()
            PakTemplate.description = PakTemplate.name.toPascal() + ' Description'
            PACKAGE.write(serialize(PakTemplate, {pretty: true, indent: 4}) + '\n')
        }
    }

    function mode(newMode, meta) {
        if (newMode.length == 0) {
            print(package.pak ? package.pak.mode : 'debug')
        } else {
            package.pak ||= {}
            package.pak.mode = newMode[0].toString()
            PACKAGE.write(serialize(package, {pretty: true, indent: 4}) + '\n')
            trace('Set', 'Mode to "' + package.pak.mode + '"')
        }
    }

    function sitemap(map) {
        let dir = map.dir
        let meta = map.meta
        let sitemap = map.sitemap
        if (!(renderAll || mastersModified)) {
            return
        }
        let path = dir.join('Sitemap.xml')
        path.dirname.makeDir()
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        let list = dir.files(sitemap.files || '**.html', {exclude: 'directories', relative: true})
        let url = meta.url.trimEnd('/')
        let base = dir.trimStart(directories.dist).trimStart('/')
        for each (file in list) {
            let filename = base.join(file.name).trimEnd('.gz')
            fp.write('    <url>\n' +
                '        <loc>' + url + '/' + filename + '</loc>\n' +
                '        <lastmod>' + dir.join(file).modified.format('%F') + '</lastmod>\n' +
                '        <changefreq>weekly</changefreq>\n' +
                '        <priority>0.5</priority>\n' +
                '    </url>\n')
        }
        fp.write('</urlset>\n')
        fp.close()
        if (!options.quiet) {
            trace('Create', path + ', ' + list.length + ' entries')
        }
    }

    function fatal(...args): Void {
        log.error(...args)
        App.exit(1)
    }

    function checkEngines(name, path) {
        let path = path.join(PACKAGE)
        if (path.exists) {
            let obj = path.readJSON()
            for (engine in obj.engines) {
                if (!Cmd.locate(engine)) {
                    trace('Warn', 'Cannot locate required "' + engine + '" for plugin "' + name + '"')
                }
            }
        }
    }

    //////// Public API

    public function trace(tag: String, ...args): Void {
        if (!options.quiet) {
            log.activity(tag, ...args)
        }
    }

    public function vtrace(tag: String, ...args): Void {
        if (verbosity > 0) {
            log.activity(tag, ...args)
        }
    }

    public function touch(path: Path) {
        path.dirname.makeDir()
        if (path.exists) {
        } else {
            path.write('')
        }
    }

    public function addItems(collection, items) {
        if (!items) {
            return
        }
        if (!(items is Array)) {
            items = [items]
        }
        collections[collection] = ((collections[collection] || []) + items).unique()
    }

    public function getFiles(query: Object, operation = 'and', options = {files: "**"}) {
        let list = []
        for each (file in directories.contents.files(pattern)) {
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

    public function getFileMeta(file: Path) {
        let [fileMeta, contents] = splitMetaContents(file, file.readString())
        let meta = blend(topMeta.clone(true), fileMeta || {})
        return meta
    }

    public function getItems(collection) collections[collection]

    public function removeItems(collection, items) {
        if (!items || !collections[collection]) {
            return
        }
        if (!(items is Array)) {
            items = [items]
        }
        collections[collection] -= items
    }

    function castDirectories() {
        for (let [key,value] in directories) {
            directories[key] = Path(value)
        }
        dirTokens = {}
        for (let [name,value] in directories) {
            dirTokens[name.toUpperCase()] = value
        }
    }

    private function checkPaks(name = null) {
        let pak, path
        if (paks[name]) {
            return
        }
        if (!name) {
            pak = package
        } else {
            path = directories.paks.join(name, PACKAGE)
            if (!path.exists) {
                return
            }
            pak = path.readJSON()
        }
        for (dname in pak.dependencies) {
            checkPaks(dname)
        }
        paks[pak.name] = pak
        blend(pak, {pak: {render:{}}}, {overwrite: false})
        let render = pak.pak.render
        for (let [kind, patterns] in render) {
            /* Expand first to permit ${TOP} which is absolute to override directories.lib */
            for (let [index,pattern] in patterns) {
                patterns[index] = pattern.expand(expansive.dirTokens, { fill: '.' })
            }
            let dir = name ? directories.lib.join(pak) : directories.top
            render[kind] = dir.files(patterns, {relative: true})
        }
    }

    /*
        Order files based on pak order and permit render:{} overrides
     */
    public function orderFiles(files: Array, kind): Array {
        let result = []
        for each (pak in paks) {
            let render = pak.pak.render[kind]
            if (render) {
                for each (path in render) {
                    result.push(path)
                }
            } else {
                let pdir = directories.lib.join(pak.name)
                for each (file in files) {
                    if (file.name.startsWith(pdir.name + pdir.separator)) {
                        result.push(file)
                    }
                }
            }
        }
        return result.unique()
    }
}

public function active(item)
    meta.menu == item ? 'active' : ''

/*
    Main program
 */
public var expansive = new Expansive

try {
    expansive.parseArgs()
    expansive.process()
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
