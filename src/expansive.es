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
const LISTEN = '127.0.0.1:4000'
const EXTENSIONS = ['js', 'css']
const PACKAGE = Path('package.json')
const LAST_GEN = Path('.expansive-lastgen')

const USAGE = 'Expansive Web Site Generator
  Usage: exp [options] [FILES ...]
    --benchmark          # Show per-plugin stats
    --chdir dir          # Change to directory before running
    --clean              # Clean "dist" first
    --keep               # Keep intermediate transform results
    --listen IP:PORT     # Endpoint to listen on
    --log path:level     # Trace to logfile
    --noclean            # Do not clean "dist" directory before render
    --norender           # Do not do an initial render before watching
    --nowatch            # Do not watch for changes, just serve
    --quiet              # Quiet mode
    --trace path:level   # Trace http requests
    --verbose            # Verbose mode
    --version            # Output version information
  Commands:
    clean                # Clean "dist" output directory
    deploy [directory]   # Deploy required production files
    edit key[=value]     # Get and set expansive.json values
    init                 # Create expansive.json
    mode [debug|release] # Select property mode set
    render               # Render entire site
    serve                # Serve and watch for changes
    watch                # Watch for changes and render as required
    FILES, ...           # Render only matching files
    <CR>                 # Same as "expansive serve"
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
    var impliedUpdates: Object
    var initialized: Boolean
    var lastGen: Date
    var log: Logger = App.log
    var metaCache: Object
    var modified: Object
    var obuf: ByteArray?
    var options: Object
    var package: Object
    var paks: Object = {}
    var plugins: Object = {}
    var reload: Array = []
    var restarts = []
    var server: Cmd
    var services: Object = {}
    var sitemaps: Array = []
    var skipFilter: Object = {}
    var stats: Object
    var topMeta: Object
    var transforms: Object = {}
    var preProcessors: Object = {}
    var postProcessors: Object = {}
    var using: Object = {}
    var verbosity: Number = 0
    var watchers: Object = {}

    let argsTemplate = {
        options: {
            benchmark: { alias: 'b' },        /* Undocumented */
            chdir:     { range: Path },       /* Implemented in expansive.c */
            clean:     { alias: 'c' },
            debug:     { alias: 'd' },        /* Undocumented */
            keep:      { alias: 'k' },
            listen:    { range: String },
            log:       { alias: 'l', range: String },
            noclean:   { },
            norender:  { },
            nowatch:   { },
            rebuild:   { alias: 'r' },
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
            copy: ['images'],                   /* Directory relative to 'sources' */
            dependencies: {},
            directories: {
                cache:      Path('cache'),
                contents:   Path('contents'),
                deploy:     Path('deploy'),
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
            documents: [ 'lib', 'contents' ],
            listen: LISTEN,
            watch: 1500,
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
        lastGen = LAST_GEN.exists ? LAST_GEN.modified : Date(0)
        addWatcher('standard', standardWatcher)
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
        let criteria
        if (package.devDependencies) {
            criteria = package.devDependencies.expansive
        }
        criteria ||= config.expansive
        if (criteria && !Version(Config.Version).acceptable(criteria)) {
            throw 'Requires Expansive ' + criteria + '. Expansive version ' + Config.Version +
                            ' is not compatible with this requirement.' + '\n'
        }
        loadConfig('.', topMeta)
        checkPaks()
        loadPlugins()
        setupEjsTransformer()
        clean(meta)
        if (options.debug) {
            dump('Directories', directories)
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
        for (let [name, requiredVersion] in pkg.installedDependencies) {
            loadPlugin(name, requiredVersion)
        }
    }

    function loadPlugins() {
        createService({ plugin: 'compile-exp', name: 'exp', mappings: { exp: '*' }, render: transformExp } )
        let stat = stats.services.exp
        stat.parse = stat.eval = stat.run = 0

        for (let [name, requiredVersion] in package.installedDependencies) {
            loadPlugin(name, requiredVersion)
        }
        buildMetaCache()
        for each (service in services) {
            if (service.script && service.enable) {
                try {
                    eval(service.script)
                    service.render = global.transform
                    delete global.transform
                    if (global.pre) {
                        service.pre = global.pre
                        preProcessors[service.name] = service
                        delete global.pre
                    }
                    if (global.post) {
                        service.post = global.post
                        postProcessors[service.name] = service
                        delete global.post
                    }
                    delete service.script
                } catch (e) {
                    fatal('Plugin script error in "' + service.name + '"\n' + e)
                }
            }
        }
    }

    function getInstalledPaks() {
        let deps = {}
        for each (path in directories.paks.files('*')) {
            if (path.isDir && path.join('package.json').exists) {
                let name = path.basename
                deps[name] = true
            }
        }
        return deps
    }

    function readPackage(dir: Path) {
        let path = dir.join(PACKAGE)
        if (!path.exists) {
            return null
        }
        let pkg = path.readJSON()
        pkg.installedDependencies = getInstalledPaks()
        return pkg
    }

    function loadPackage() {
        let pkg = readPackage('.')
        if (pkg) {
            pkg.pak ||= {}
            blend(directories, pkg.directories)
            castDirectories()
            topMeta.title = pkg.title
            topMeta.description = pkg.description
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
        options.task = task
        if (task == 'init') {
            init()
            return
        }
        let rest = args.rest
        let meta = setup(task)
        vtrace('Task', task, rest)

        switch (task) {
        case 'clean':
            options.clean = true
            clean(meta)
            break

        case 'deploy':
            deploy(rest, meta)
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
            }
            runWatchers()
            render()
            break

        case 'watch':
            if (rest.length > 0) {
                filters = rest
            }
            watch(meta)
            break

        default:
            if (task && task != 'serve') {
                /* Process only specified files. If not, process all */
                filters = [task] + rest
                runWatchers()
                render()
            } else {
                serve(topMeta)
            }
            break
        }
    }

    function runWatchers() {
        modified = { file: {} }
        if (options.clean || options.rebuild) {
            modified.everything ||= {}
            modified.any = true
            options.clean = false
            options.rebuild = false
        }
        for each (watch in watchers) {
            watch.call(this)
        }
        if (modified.any) {
            lastGen = Date()
            LAST_GEN.write(lastGen + '\n')
        }
    }

    public function modify(file, ...kinds) {
        for each (kind in kinds) {
            modified[kind] ||= {}
            modified[kind][file] = true
        }
        modified.any = true
        vtrace('Modified', file)
        event('onchange', file)
    }

    public function skip(path) {
        skipFilter[path] = true
    }

    public function getLastRendered(source): Date {
        let sourcePath = getSourcePath(source)
        let dest = getDest(sourcePath)
        return dest.modified ? dest.modified : Date(0)
    }

    public function touchDir(dir: Path) {
        dir.makeDir()
        let path = dir.join('.touch')
        path.write('')
        path.remove()
    }

    public function addWatcher(key, fn) {
        watchers[key] = fn
    }

    function useFile(kind, key, file) {
        using[kind] ||= {}
        using[kind][key] ||= []
        using[kind][key].push(file)
    }

    function standardWatcher() {
        for each (partial in directories.partials.files('*')) {
            let found
            if (using.partials) {
                for each (file in using.partials[partial]) {
                    found = true
                    if (partial.modified > getLastRendered(file)) {
                        modify(file, 'file')
                        modify(partial, 'partial')
                    }
                }
            }
            if (!found && partial.modified > lastGen) {
                modify(partial, 'partial', 'everything')
            }
        }
        for each (layout in directories.layouts.files('*')) {
            let found
            if (using.layouts) {
                for each (file in using.layouts[layout]) {
                    found = true
                    if (layout.modified > getLastRendered(file)) {
                        modify(file, 'file')
                        modify(layout, 'layout')
                    }
                }
            }
            if (!found && layout.modified > lastGen) {
                modify(layout, 'layout', 'everything')
            }
        }

        //  Better to have a name that did not confuse with package.dependencies
        for (let [path, dependencies] in control.dependencies) {
            path = directories.contents.join(path)
            let deps = directories.contents.files(dependencies)
            for each (let file: Path in deps) {
                if (file.modified > getLastRendered(path)) {
                    modify(file, 'file')
                    modify(path, 'file')
                }
            }
        }

        let files = directories.top.files(control.documents, {contents: true, relative: true})
        files.push(directories.contents)
        files.push(directories.lib)
        for (let [index,file] in files) {
            if (!filter(file)) {
                continue
            }
            if (file.isDir) {
                if (file.modified > getLastRendered(file)) {
                    modify(file, 'file', 'everything')
                    touchDir(getDest(getSourcePath(file)))
                }
            } else if (file.modified > getLastRendered(file)) {
                let meta = getFileMeta(file)
                if (!meta || !meta.draft) {
                    modify(file, 'file')
                }
            }
        }

        /*
            This is costly - do only first time
         */
        if (!stats.started) {
            for each (dir in control.files) {
                for each (file in dir.files('**')) {
                    if (!filter(file)) {
                        continue
                    }
                    if (file.modified > getLastRendered(file)) {
                        modify(file, 'file')
                    }
                }
            }
        }

        for (dir in metaCache) {
            let path = findConfig(dir)
            if (path && path.modified > lastGen) {
                modify(path, 'config', 'everything')
            }
        }
        if (options.debug) {
            dump('Modified', modified)
        }
    }

    function watch(meta) {
        trace('Watching', 'for changes every ' + control.watch + ' msec ...')
        options.watching = true
        if (control.watch < 1000) {
            /* File modified resolution is at best (portably) 1000 msec */
            control.watch = 1000
        }
        while (true) {
            runWatchers()
            render()
            if (modified.any && options.serving) {
                trace('Restart', 'Content modified')
                if (options.debug) {
                    dump('Modified', modified)
                }
                restartServer(true)
            }
            if (modified.any) {
                reloadBrowsers();
            }
            App.sleep(control.watch)
            vtrace('Check', 'for changes (' + Date().format('%I:%M:%S') + ')')
        }
    }

    function externalWatch(event, cmd) {
        let buf = new ByteArray
        let len = cmd.read(buf, -1)
        prints(buf)
        if (len == 0 && cmd.wait(0)) {
            if (server) {
                options.quiet = false
                trace('Info', 'Server exited, restarting ...')
            }
            restartServer()
        }
    }

    public function stopExternalServer() {
        if (server) {
            if (server.pid) {
                server.off('readable', externalWatch)
                vtrace('Kill', 'Server', server.pid)
                try { Cmd.kill(server.pid) } catch {}
            }
        }
    }

    function externalServer() {
        if (server && server.pid) {
            stopExternalServer()
        }
        server = new Cmd
        externalWatch.bind(this)
        server.on('readable', externalWatch)
        server.start(control.server, {detach: true})
        server.finalize()
        trace('Run', control.server, '(' + server.pid + ')')
        if (restarts.push(Date.now()).length > 5) {
            restarts.splice(0, 1)
        }
    }

    var restarts = []

    function restartServer(force = false) {
        if (control.server) {
            if (restarts.length >= 5 && (Date.now() - restarts[0]) < 60000 && !force) {
                trace('Info', 'Server keeps dying, pausing 5 seconds before restart')
                restarts = []
                setTimeout(function() { restartServer(force) }, 5000)
            } else {
                trace('Info', 'Restart server')
                externalServer()
            }
        }
    }

    function reloadBrowsers() {
        for each (request in reload) {
            request.write('html')
            request.finalize()
        }
        reload = []
    }

    function internalServer() {
        let address = options.listen || control.listen || '127.0.0.1:4000'
        let server: HttpServer = new HttpServer({documents: directories.dist})
        let routes = control.routes || Router.Top
        var router = Router(Router.WebSite)
        router.addCatchall()
        let self = this
        server.on('readable', function (event, request) {
            try {
                if (request.pathInfo == '/reload-service') {
                    setLimits({inactivityTimeout: 999999999, requestTimeout: 99999999})
                    dontAutoFinalize()
                    self.reload.push(this)
                } else {
                    server.serve(request, router)
                }
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

    function serve(meta) {
        options.serve = true
        if (control.server) {
            externalServer()
        } else {
            internalServer()
        }
        options.serving = true
        let address = options.listen || control.listen || '127.0.0.1:4000'
        if (options.nowatch) {
            trace('Listen', address)
            App.run()
        } else {
            trace('Listen', address)
            watch(meta)
        }
    }

    function render() {
        if (options.norender) {
            return
        }
        stats.started = new Date
        stats.files = 0
        if (modified.everything || modified.partial) {
            cache = {}
        }
        buildMetaCache()
        preProcess()
        renderFiles()
        renderDocuments()
        renderSitemaps()
        postProcess()

        if (options.benchmark) {
            trace('Debug', '\n' + serialize(stats, {pretty: true, indent: 4, quotes: false}))
            let total = 0
            for each (service in stats.services) {
                total += service.elapsed
            }
            trace('Debug', 'Total plugin time %.2f' % ((total / 1000) + ' secs.'))
        }
        if (filters) {
            if (stats.files == 0) {
                trace('Warn', 'No matching files for filter: ' + filters)
            }
        } else if (!options.watching) {
            trace('Info', 'Rendered ' + stats.files + ' files to "' + directories.dist + '". ' +
                'Elapsed time %.2f' % ((stats.started.elapsed / 1000)) + ' secs.')
        }
    }

    /*
        Render 'files' and 'lib'. These are rendered without processing by a simple copy.
        Note: the paths under files do not copy the first directory portion, whereas the files under lib do.
        Note: files and lib are not watched for changes.
     */
    function renderFiles() {
        if (!filters) {
            for each (dir in control.files) {
                for each (file in dir.files('**', {directories: false})) {
                    if (modified.file[file]) {
                        let dest = directories.dist.join(getSourcePath(file))
                        cp(file, dest)
                        trace('Copy', dest)
                        stats.files++
                    }
                }
            }
        }
    }

    /*
        Copy file as-is without processing
     */
    function copyFile(file, meta) {
        if (modified.file[file] || modified.everything) {
            let trimmed = trimPath(file, directories.contents)
            let dest = directories.dist.join(trimmed)
            cp(file, dest)
            trace('Copy', dest)
            stats.files++
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
        if (!metaCache || modified.everything) {
            metaCache ||= {}
            let dirs = [ Path('.'), directories.contents, directories.lib ]
            dirs += directories.top.files(control.documents, {contents: true, include: /\/$/, relative: true})

            sitemaps = []
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
        Test if a path should be processed according to filters
     */
    function filter(path: Path): Boolean {
        if (skipFilter[path]) {
            return false
        }
        let base = path.basename
        if (base == 'expansive.json' || base == 'expansive.es') {
            return false
        }
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
        copy = {}
        for each (item in directories.contents.files(control.copy, {contents: true})) {
            copy[item] = true
        }
        let files = directories.top.files(control.documents, {contents: true, directories: false, relative: true})
        for (let [index,file] in files) {
            if (!filter(file)) {
                continue
            }
            if (modified.file[file] || modified.everything) {
                let meta = metaCache[file.dirname]
                if (copy[file]) {
                    copyFile(file, meta)
                } else {
                    renderDocument(file, meta)
                }
            }
        }
    }

    function preProcess() {
        control.pre ||= []
        for each (service in preProcessors) {
            if (!control.pre.contains(service.name)) {
                control.pre.push(service.name)
            }
        }
        for each (name in control.pre) {
            let service = preProcessors[name]
            if (!service) {
                throw 'Pre processing service "' + name + '" cannot be found'
            }
            vtrace('PreProcess', service.name)
            if (service.enable !== false) {
                service.pre.call(this, meta, service)
            }
        }
    }

    function postProcess() {
        if (modified.any) {
            control.post ||= []
            /*
                Control.post provides the required order
             */
            for each (service in postProcessors) {
                if (!control.post.contains(service.name)) {
                    control.post.push(service.name)
                }
            }
            for each (name in control.post) {
                let service = postProcessors[name]
                if (service) {
                    trace('Post', service.name)
                    if (service.enable !== false) {
                        service.post.call(this, meta, service)
                    }
                }
            }
        }
    }

    function renderSitemaps() {
        if (modified.everything) {
            for each (map in sitemaps) {
                sitemap(map)
            }
        }
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
        let source = file || meta.sourcePath
        if (!source) {
            return null
        }
        let dest = destCache[source]
        if (dest != null) {
            return dest
        }
        let dest = directories.dist.join(source)
        let mapping = getMapping(file)
        while (transforms[mapping]) {
            dest = getMappingDest(file, mapping)
            if (dest == file) {
                break
            }
            mapping = getMapping(dest)
            file = dest
        }
        destCache[source] = dest
        return dest
    }

    function getSourcePath(source) {
        //  TODO - optimize
        if (source.startsWith(directories.contents)) {
            return source.trimComponents(directories.contents.components.length)
        } else if (source.startsWith(directories.lib)) {
            return source.trimComponents(directories.lib.components.length)
        } else if (source.startsWith(directories.layouts)) {
            return source.trimComponents(directories.layouts.components.length)
        } else if (source.startsWith(directories.partials)) {
            return source.trimComponents(directories.partials.components.length)
        } else if (source.startsWith(directories.files)) {
            return source.trimComponents(directories.files.components.length)
        }
        return source
    }

    /*
        Initialize meta

        source     - Current source file being processed. Relative path including 'contents|lib|layouts|partials'.
        sourcePath - Current source file being processed. Relative path EXCLUDING 'contents|lib|layouts|partials'.
        dest       - Destination filename being created. Relative path including 'dist'.
        base       - Source file without 'contents/lib'.
        document   - Source of the document being processed. For partials/layouts, it is the invoking document.
        path       - Destination without 'dist'. Note: may have different extensions to base.
        url        - Url made from 'path'.
        top        - Relative URL to application home page.
     */
    function initMeta(path, meta) {
        if (options.serve) {
            meta.site = options.listen || control.listen || meta.site || 'localhost:4000'
        } else {
            meta.site ||= 'localhost'
        }
        meta.document = path
        meta.source = path
        meta.sourcePath = getSourcePath(meta.source)
        meta.dest = getDest(meta.sourcePath)
        /*
            Pages may define own path
         */
        meta.path ||= trimPath(meta.dest, directories.dist)
        meta.path = Path(meta.path)
        meta.dir ||= meta.path.dirname
        meta.dir = Path(meta.dir)

        let count = (meta.dir == '.') ? 0 : meta.dir.components.length
        meta.top = Path(count ? '/..'.times(count).slice(1) : '.')
        global.top = meta.top

        meta.url = Uri(Uri.encode(meta.path))
        meta.mode = package.pak.mode || 'debug'
        meta.date ||= new Date
        meta.date = Date(meta.date)
        meta.isoDate = meta.date.toISOString()

    }

    function renderContents(contents, meta) {
        /*
            Collections reset at the start of each document so layouts/partials can modify
         */
        collections = (control.collections || {}).clone()
        initMeta(meta.document, meta)
        contents = transformContents(contents, meta)
        if (meta.layout) {
            contents = blendLayout(contents, meta)
        }
        return pipeline(contents, '* -> *', meta.dest, meta)
    }

    function writeDest(contents, meta) {
        if (contents != null) {
            let dest = meta.dest
            dest.dirname.makeDir()
            dest.write(contents)
            trace('Render', dest)
            stats.files++
        }
    }

    function renderDocument(file, meta) {
        /*
            Collections reset at the start of each document so layouts/partials can modify
         */
        let [fileMeta, contents] = splitMetaContents(file, file.readString())
        meta = blendMeta(meta.clone(true), fileMeta || {})
        if (meta.draft) {
            return
        }
        meta.document = file
        if (!fileMeta) {
            delete meta.layout
        }
        contents = renderContents(contents, meta)
        if (meta.redirect) {
            contents = '<html><body><script type="text/javascript">window.location="' + meta.redirect + 
                '"</script></body></html>\n'
        }
        writeDest(contents, meta)
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
                        if (options.serving) {
                            trace('Error', 'Cannot render ' + file)
                            print(e)
                        } else {
                            throw e
                        }
                    }
                    if (destCache[meta.source] == null) {
                        destCache[meta.source] = meta.dest
                    }
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
            if (code) {
                print('Code: \n' + code + '\n')
            } else {
                print('Contents \n' + contents + '\n')
            }
            dump("Meta", meta)
            print("In document", meta.document)
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
                useFile('layouts', layout, meta.document)
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
        useFile('partials', partial, meta.document)
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

    function deploy(rest, meta) {
        if (!control.deploy) {
            control.deploy = {
                from: [directories.dist.join('**'), directories.cache.join('*'), 'package.json', 'esp.json'],
                flatten: false,
                clean: true
            }
        }
        if (!(control.deploy is Array)) {
            control.deploy = [control.deploy]
        }
        for each (dep in control.deploy) {
            if (rest[0]) {
                dep.to = rest[0]
            }
            dep.to ||= directories.deploy || '.'
            if (dep.flatten !== true) {
                dep.flatten = false
            }
            if (dep.clean !== false) {
                dep.clean = true
            }
            trace('Deploy', 'To "' + dep.to + '"')
            if (!options.noclean && dep.clean !== false) {
                Path(dep.to).removeAll()
            }
            Path().operate(dep)
            if (dep.script) {
                eval(dep.script)
            }
        }
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
            (global[name]).call(this, arg, meta || topMeta)
        }
    }

    function clean() {
        if ((options.clean || options.rebuild) && !options.noclean) {
            trace('Clean', directories.dist)
            directories.dist.removeAll()
            trace('Clean', directories.cache)
            directories.cache.removeAll()
            LAST_GEN.remove()
        }
    }

    function init() {
        if (findConfig('.')) {
            trace('Warn', 'Expansive configuration already exists')
            return
        }
        let path = CONFIG.joinExt('json')
        trace('Create', path)
        path.write(App.exeDir.join('sample.json').readString())

        //  TODO - these names should come from directories
        for each (p in [ 'contents', 'dist', 'layouts', 'partials' ]) {
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
            options.clean = true
            clean(topMeta)
        }
    }

    function sitemap(map) {
        let dir = map.dir
        let meta = map.meta
        let sitemap = map.sitemap
        let path = dir.join('Sitemap.xml')
        path.dirname.makeDir()
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        let list = dir.files(sitemap.files || '**.html', {exclude: 'directories', relative: true})
        if (!meta.site) {
            throw 'Must define a meta "site" URL'
        }
        let url = meta.site.trimEnd('/')
        let base = dir.trimStart(directories.dist).trimStart('/')
        for each (file in list) {
            if (!filter(file)) {
                continue
            }
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

    public function getFiles(patterns: Object, query: Object) {
        let list = []
        for each (file in directories.contents.files(patterns, {directories: false})) {
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
        if (!fileMeta) {
            meta.default = true
        }
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
        control.files ||= []
        for (let [key, value] in control.files) {
            control.files[key] = Path(value)
        }
        if (directories.files.exists && !control.files.contains(directories.files)) {
            control.files.push(directories.files)
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
        let dir = name ? directories.lib.join(pak.name) : directories.top
        for (let [kind, patterns] in render) {
            for (let [index,pattern] in patterns) {
                /* Expand first to permit ${TOP} which is absolute to override directories.lib */
                patterns[index] = dir.join(pattern.expand(expansive.dirTokens, { fill: '.' }))
            }
            render[kind] = Path().files(patterns, {relative: true})
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

public function trace(tag: String, ...args): Void
    expansive.trace(tag, ...args)

public function vtrace(tag: String, ...args): Void
    expansive.vtrace(tag, ...args)

/*
    Main program
 */
public var expansive = new Expansive

try {
    expansive.parseArgs()
    expansive.process()
} catch (e) {
    App.log.error(e)
    expansive.stopExternalServer()
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
