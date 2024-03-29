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
const PAK = Path('pak.json')
const LAST_GEN = Path('.expansive-lastgen')

const USAGE = 'Expansive Web Site Generator
  Usage: expansive [options] [FILES ...]
    --abort              # Abort rendering on errors
    --chdir dir          # Change to directory before running
    --clean              # Clean "dist" first
    --listen IP:PORT     # Endpoint to listen on
    --log path:level     # Trace to logfile
    --noclean            # Do not clean "dist" directory before render
    --norender           # Do not do an initial render before watching
    --nowatch            # Do not watch for changes, just serve
    --profile PROFILE    # Set the build profile (dev, prod, ...)
    --quiet              # Quiet mode
    --rebuild            # Clean and render
    --trace path:level   # Trace http requests
    --verbose            # Verbose mode
    --version            # Output version information
  Commands:
    clean                # Clean "dist" output directory
    deploy [directory]   # Deploy required production files
    edit key[=value]     # Get and set expansive.json values
    init                 # Create expansive.json
    profile [dev|prod]   # Set profile
    render               # Render entire site
    serve                # Serve and watch for changes
    watch                # Watch for changes and render as required
    FILES, ...           # Render only matching files
    <CR>                 # Same as "expansive serve"
'

public class Expansive {
    public var args: Args
    var cache: Object
    var config: Object
    public var collections: Object
    public var control: Object
    var copy: Object
    var currentConfig: Object
    public var currentMeta: Object
    public var directories: Object
    var dirTokens: Object
    var errors: Number = 0
    var filters: Array
    var destPathCache: Object
    var impliedUpdates: Object
    var initialized: Boolean
    public var lastGen: Date
    var loaders: Object = {}
    public var log: Logger = App.log
    public var metaCache: Object
    public var modified: Object = {file: {}}
    var obuf: ByteArray?                    /* Output buffer for render data */
    public var options: Object
    public var package: Object
    var paks: Object = {}
    var plugins: Object = {}
    var reload: Array = []
    var resolveCache: Object
    var restarts = []
    var server: Cmd
    public var services: Object = {}
    var serviceConfig: Object = {}
    var sitemaps: Array = []
    var skipFilter: Object = {}
    var stats: Object
    public var topMeta: Object
    var mappings: Object = {}
    var preProcessors: Array = []
    var postProcessors: Array = []
    var resolvers: Object = {}
    public var transforms: Object = {}
    var using: Object = {}
    public var verbosity: Number = 0
    var watchers: Object = {}

    let argsTemplate = {
        options: {
            abort:     { alias: 'a' },
            benchmark: { alias: 'b' },        /* Undocumented */
            chdir:     { range: Path },       /* Implemented in expansive.c */
            clean:     { alias: 'c' },
            debug:     { alias: 'd' },        /* Undocumented */
            keep:      { alias: 'k' },
            listen:    { range: String },
            log:       { alias: 'l', range: String },
            //  LEGACY
            mode:      { alias: 'm', range: String },
            noclean:   { },
            norender:  { },
            nowatch:   { },
            profile:   { alias: 'p', range: String },
            rebuild:   { alias: 'r' },
            quiet:     { alias: 'q' },
            trace:     { alias: 't', range: String },
            verbose:   { alias: 'v' },
            version:   { },
            why:       { alias: 'w' },
        },
        unknown: unknown,
        usage: usage,
    }

    var PakTemplate = {
        name: 'Package Name',
        title: 'Display Package Title - several words. E.g. Company Product',
        description: 'Full Package Description - one line',
        version: '1.0.0',
        import: true,
        directories: {
            export: 'contents/lib'
        }
    }

    function Expansive() {
        cache = {}
        /*
            Updated with expansive {} properties from expansive.es files
         */
        control = {
            collections: {
                scripts: [],
                styles:  [],
            },
            copy: ['images'],                       /* Directory relative to 'contents' */
            dependencies: {},
            directories: {
                cache:      Path('cache'),
                contents:   Path('contents'),
                deploy:     Path('deploy'),
                dist:       Path('dist'),
                files:      Path('files'),
                layouts:    Path('layouts'),
                lib:        Path('contents/lib'),   /* Exported pak contents */
                paks:       Path('paks'),
                partials:   Path('partials'),
                top:        Path('.'),
            },
            listen: LISTEN,
            watch: 2500,
        }
        topMeta = {
            layout: 'default',
            control: control,
        }
        directories = control.directories
        impliedUpdates = {}
        destPathCache = {}
        resolveCache = {}
        stats = {transforms: {}}
        if (App.config.expansive) {
            /* From ejsrc */
            blendMeta(topMeta, App.config.expansive)
        }
        global.meta = topMeta
        global.css = topMeta.css = topMeta.css || {}
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
        //  LEGACY
        if (options.mode) {
            options.profile = options.mode
        }
        //  LEGACY
        options.mode = options.profile
    }

    function setup(task) {
        if (!findConfig('.')) {
            if (task == 'init' || task == 'install') {
                init()
            } else {
                fatal('Cannot find expansive configuration file')
            }
        }
        package = loadPak()
        if (!package) {
            throw 'Cannot find pak.json'
        }
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
        trace('Info', 'Using profile:', package.profile)
        computeOrder()
        loadPlugins()
        setupEjsTransformer()
        clean(meta)
        if (options.debug) {
            dump('Directories', directories)
            dump('Meta', topMeta)
            dump('Control', control)
            dump('Transforms', transforms)
            dump('Mappings', mappings)
            dump('Services', services)
            dump('PreProcessors', preProcessors)
            dump('PostProcessors', postProcessors)
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

    /*
        Read expansive.json or expansive.es
     */
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
        if (options.profile) {
            package.profile = options.profile
        }
        //  LEGACY
        package.mode = package.profile
        vtrace('Info', 'Using profile:', package.profile)
        blend(cfg, { meta: {}, control: {}, services: {}}, {combine: true})
        let profile = cfg[package ? package.profile : '']
        if (profile) {
            blend(cfg.meta, profile.meta, {combine: true})
            if (!initialized) {
                blend(cfg.control, profile.control, {combine: true})
                blend(cfg.services, profile.services, {combine: true})
            }
            delete meta[cfg.profile]
        }
        blend(meta, cfg.meta)
        if (!initialized) {
            blend(control, cfg.control, {combine: true})
            for (let [key,value] in cfg.services) {
                if (value === true || value === false) {
                    cfg.services[key] = { enable: value }
                }
            }
            blend(serviceConfig, cfg.services)
        }
        if (control.script) {
            try {
                vtrace('Eval', 'Script for ' + path)
                eval(control.script)
            } catch (e) {
                fatal('Script error in "' + path + '"\n' + e)
            }
            delete control.script
        }
        castDirectories()
        meta.path = path
        for each (loader in loaders) {
            loader.call(this, meta)
        }
        return meta
    }

    function createService(service) {
        if (services[service.name]) {
            vtrace('Warn', 'Redefining service ' + service.name)
        } else {
            vtrace('Create', 'Service ' + service.name)
        }
        services[service.name] = service
        if (serviceConfig[service.name] && serviceConfig[service.name].enable !== null) {
            service.enable = serviceConfig[service.name].enable
        }
        if (service.enable == null) {
            service.enable = true
        }
        if (service.transforms) {
            if (!(service.transforms is Array)) {
                service.transforms = [service.transforms]
            }
            for each (transform in service.transforms) {
                if (transform.name) {
                    transform.name = service.name + '-' + transform.name
                } else {
                    transform.name = service.name
                }
                vtrace('Create', 'Transform ' + transform.name)
                transforms[transform.name] = transform
                transform.service = service

                if (!service.enable || transform.enable == null) {
                    transform.enable = service.enable
                }
                stats.transforms[transform.name] = { elapsed: 0, count: 0}
            }
        }
        return service
    }

    function loadPlugin(name, requiredVersion) {
        if (plugins[name]) {
            return
        }
        plugins[name] = true

        let path = findPak(name, requiredVersion)
        if (!path) {
            trace('Warn', 'Cannot load plugin ' + name + ' ' + requiredVersion)
            return
        }
        checkEngines(name, path)

        let epath = findConfig(path)
        if (epath && epath.exists && epath.extension == 'es') {
            vtrace('Load', 'Plugin', path)
            global.load(epath)
            let plugin = currentConfig
            if (plugin && plugin.services) {
                let services = plugin.services
                if (services) {
                    if (!(services is Array)) {
                        services = [services]
                    }
                    for each (service in services) {
                        service.name ||= name
                        createService(service, path)
                    }
                }
            }
        }
        let pkg = readPak(path)
        if (!pkg) {
            throw 'Cannot find plugin pak json at: ' + path
        }
        for (let [name, requiredVersion] in pkg._installedDependencies_) {
            loadPlugin(name, requiredVersion)
        }
    }

    function loadPlugins() {
        let exp = createService({name: 'exp', transforms: [{ mappings: { exp: '*' }, render: renderExp }]})
        let stat = stats.transforms.exp
        stat.parse = stat.eval = stat.run = 0

        for (let [name, requiredVersion] in package._installedDependencies_) {
            loadPlugin(name, requiredVersion)
        }
        buildMetaCache()
        blend(services, serviceConfig, {combine: true})
        fixMappings()

        if (control.pipeline) {
            for (let [key,value] in control.pipeline) {
                let stages = mappings[key] ||= []
                if (!(value is Array)) {
                    value = [value]
                }
                for each (name in value) {
                    let transform = transforms[name]
                    if (!transform) {
                        fatal('Cannot find transform', name, 'in control.pipeline.' + key)
                    }
                    if (key == 'pre') {
                        preProcessors.push(transform)
                    } else if (key == 'post') {
                        postProcessors.push(transform)
                    } else {
                        if (!stages.contains(transform.name)) {
                            stages.push(transform)
                        }
                    }
                }
            }
        }
        for each (service in services) {
            if (service.enable) {
                if (service.init) {
                    service.init.call(this, service)
                }
                for each (transform in service.transforms) {
                    try {
                        if (transform.init) {
                            transform.init.call(this, transform)
                        }
                        if (transform.script) {
                            eval(transform.script)
                            delete service.script
                        }
                    } catch (e) {
                        fatal('Plugin script error in "' + transform.name + '"\n' + e)
                    }
                    if (transform.enable) {
                        for (let [key,value] in transform.mappings) {
                            if (!value) {
                                value = [key]
                            } else if (!(value is Array)) {
                                value = [value]
                            }
                            for each (to in value) {
                                let mapping = key + ' -> ' + to
                                let stages = mappings[mapping] ||= []
                                if (!stages.contains(transform.name)) {
                                    stages.push(transform)
                                }
                                vtrace('Plugin', service.name + ' provides transform "' +
                                    transform.name + '" for ' + mapping)
                            }
                        }
                        if (transform.resolve) {
                            for (let ext in transform.mappings) {
                                resolvers[ext] = transform
                            }
                        }
                        if (transform.pre) {
                            preProcessors.push(transform)
                        }
                        if (transform.post) {
                            postProcessors.push(transform)
                        }
                    }
                }
                delete service.transforms
            }
        }
        preProcessors = preProcessors.unique()
        postProcessors = postProcessors.unique()
    }

    function fixMappings() {
        for each (service in services) {
            /*
                Overwrite transform mappings with user configuration from 'services.*.mappings'
                This may be a String, Array or Object
             */
            if (service.mappings) {
                if (service.mappings is String || service.mappings is Array) {
                    let transform = transforms[service.name]
                    if (transform) {
                        transform.mappings = service.mappings
                    }
                } else {
                    for (let [name,mapping] in service.mappings) {
                        let transform = transforms[service.name + '-' + name]
                        if (transform) {
                            transform.mappings = mapping
                        }
                    }
                }
            }
            for each (transform in service.transforms) {
                if (transform.mappings is String) {
                    let v = {}
                    v[transform.mappings] = transform.mappings
                    transform.mappings = v
                }
                if (transform.mappings is Array) {
                    let v = {}
                    for each (mapping in transform.mappings) {
                        v[mapping] = mapping
                    }
                    transform.mappings = v
                }
            }
        }
    }

    function getInstalledPaks() {
        let deps = {}
        for each (path in directories.paks.files('*')) {
            if (path.isDir && (path.join(PAK).exists || path.join('package.json').exists)) {
                let name = path.basename
                deps[name] = true
            }
        }
        return deps
    }

    function readPak(dir: Path) {
        let path = dir.join(PAK)
        let pkg
        if (path.exists) {
            pkg = path.readJSON()
            if (!pkg.version) {
                let package = dir.join("package.json")
                if (package.exists) {
                    let data = package.readJSON()
                    pkg.version = data.version
                }
            }
        } else {
            path = dir.join("package.json")
            if (!path.exists) {
                return null
            }
            pkg = path.readJSON()
        }
        pkg._installedDependencies_ = getInstalledPaks()
        return pkg
    }

    /*
        Load the top level pak.json, product.json or package.json
     */
    function loadPak() {
        let pkg = readPak('.')
        if (pkg) {
            pkg.profile = options.profile || pkg.profile
            let product = Path('product.json')
            if (product.exists) {
                let data = product.readJSON()
                if (data && data.profile) {
                    pkg.profile ||= data.profile
                    vtrace('Info', 'Set profile ' + pkg.profile + ' from product.json')
                }
            }
            pkg.profile ||= 'debug'
            blend(directories, pkg.directories)
            castDirectories()
            topMeta.title = pkg.title
            topMeta.description = pkg.description
        }
        return pkg
    }

    function findPak(name, requiredVersion = '*'): Path? {
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
            if (requiredVersion == true || version.acceptable(requiredVersion)) {
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

        case 'profile':
            profile(rest)
            break

        case 'render':
            if (rest.length > 0) {
                filters = rest
            }
            render()
            break

        case 'serve':
            serve(topMeta)
            break

        case 'watch':
            if (rest.length > 0) {
                filters = rest
            }
            watch(meta)
            break

        default:
            if (task) {
                /* Process only specified files */
                filters = [task] + rest
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
            watch.call(this, topMeta)
        }
        if (modified.any) {
            lastGen = Date()
            LAST_GEN.write(lastGen + '\n')
        }
    }

    /*
        File is a path without 'contents', 'layouts' etc.
     */
    public function modify(file, ...kinds) {
        for each (kind in kinds) {
            modified[kind] ||= {}
            modified[kind][file] = true
        }
        modified.any = true
        if (options.why) {
            trace('Modified', file)
        }
        if (modified.everything || modified.partial) {
            cache = {}
        }
        event('onchange', file)
    }

    public function getLastRendered(source): Date {
        let sourcePath = getSourcePath(source)
        let dest = getDest(sourcePath)
        if (!dest) {
            /* Destination will not exist - return now */
            return Date()
        }
        /* If destination does not exist, but will exist, then return a very early date */
        return dest.modified ? dest.modified : Date(0)
    }

    public function touchDir(dir: Path) {
        dir.makeDir()
        let path = dir.join('.touch')
        path.write('')
        path.remove()
    }

    public function addLoader(key, fn) {
        loaders[key] = fn
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

        for (let [path, dependencies] in control.dependencies) {
            path = directories.contents.join(path)
            let deps = directories.contents.files(dependencies)
            for each (let file: Path in deps) {
                if (file != path && file.modified > getLastRendered(path)) {
                    modify(file, 'file')
                    modify(path, 'file')
                }
            }
        }

        let files = directories.top.files(directories.contents + '/**', {contents: true, relative: true})
        for (let [index,file] in files) {
            if (!filter(file)) {
                continue
            }
            if (!file.isDir && (file.modified > getLastRendered(file))) {
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
                    let dest = directories.dist.join(getSourcePath(file))
                    if (!file.isDir && file.modified > dest.modified) {
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
        if (false && options.debug) {
            dump('Modified', modified)
        }
    }

    function watch(meta) {
        /*
        if (package.profile != 'debug' && package.profile != 'dev') {
            trace('Warn', 'Watching for changes only supported in debug/dev profile')
            return
        } */
        trace('Watching', 'for changes every ' + control.watch + ' msec ...')
        options.watching = true
        if (control.watch < 1000) {
            /* File modified resolution is at best (portably) 1000 msec */
            control.watch = 1000
        }
        while (true) {
            render()
            if (modified.any && options.serving) {
                trace('Restart', 'Content modified')
                if (options.debug) {
                    dump('Modified', modified)
                }
                restartServer(true)
                if (modified.any) {
                    reloadBrowsers()
                }
                modified = { file: {} }
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
            request.write('reload')
            request.finalize()
            request.close()
        }
        reload = []
    }

    function internalServer() {
        let address = options.listen || control.listen || '127.0.0.1:4000'
        let documents = control.docs || directories.dist
        let server: HttpServer = new HttpServer({documents: documents})
        let routes = control.routes || Router.Top
        var router = Router(Router.WebSite)
        router.addCatchall()
        let self = this
        server.on('readable', function (event, request) {
            try {
                if (request.pathInfo.indexOf('/reload-service') == 0) {
                    setLimits({inactivityTimeout: 999999999, requestTimeout: 99999999})
                    dontAutoFinalize()
                    self.reload.push(this)
                } else {
                    request.setHeader('X-Frame-Options', 'AllowAll')
                    if (self.control.headers) {
                        for (header in self.control.headers) {
                            request.setHeader(header, self.control.headers[header])
                        }
                    }
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
        /*
        if (package.profile == 'release' || package.profile == 'prod') {
            options.nowatch = true
        }
        */
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
        stats.files = 0
        collections = control.collections.clone()
        if (modified.everything || modified.partial) {
            cache = {}
        }
        buildMetaCache()
        runWatchers()

        stats.started = new Date
        preProcess()
        renderFiles()
        renderDocuments()
        renderSitemaps()
        postProcess()

        if (options.benchmark) {
            trace('Debug', '\n' + serialize(stats, {pretty: true, indent: 4, quotes: false}))
            let total = 0
            for each (service in stats.transforms) {
                total += service.elapsed
            }
            trace('Debug', 'Total plugin time %.2f' % ((total / 1000) + ' secs.'))
        }
        if (filters) {
            if (stats.files == 0) {
                trace('Warn', 'No matching files need rendering for: ' + filters)
            }
        } else if (!options.watching) {
            trace('Info', 'Rendered ' + stats.files + ' files to "' + directories.dist + '". ' +
                'Elapsed time %.2f' % ((stats.started.elapsed / 1000)) + ' secs.')
            if (errors) {
                fatal('Error', 'Render had ' + errors + ' errors')
            }
        }
    }

    /*
        Render 'files'. These are rendered without processing by a simple copy.
        Note: the paths under files do not copy the first directory portion.
     */
    function renderFiles() {
        if (!filters) {
            for each (dir in control.files) {
                for each (file in dir.files('**', {directories: false})) {
                    if (modified.file[file]) {
                        let dest = directories.dist.join(getSourcePath(file))
                        cp(file, dest)
                        trace('Copy', file)
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
            trace('Copy', file)
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
            let dirs = [ Path('.') ] + [directories.contents]
            dirs += directories.top.files(directories.contents, {contents: true, include: /\/$/, relative: true})

            sitemaps = []
            for each (dir in dirs) {
                if (findConfig(dir)) {
                    let baseMeta = (metaCache[dir.parent] || topMeta).clone(true)
                    delete baseMeta.sitemap
                    let meta = metaCache[dir] = loadConfig(dir, baseMeta)
                    if (meta.sitemap) {
                        /* Site maps must be processed after all rendering using the documents directory */
                        let pubdir = trimPath(dir, directories.contents)
                        pubdir = directories.dist.join(pubdir)
                        sitemaps.push({dir: pubdir, meta: meta, sitemap: meta.sitemap})
                    }
                } else {
                    metaCache[dir] = metaCache[dir.parent] || metaCache['.']
                }
                if (metaCache[dir] && metaCache[dir].layout == null) {
                    print("MC for ", dir, "has no layout");
                }
            }
        }
    }

    /*
        Test if a file should be processed according to filters
        Path is relative to 'top'
     */
    public function filter(path: Path): Boolean {
        if (skipFilter[path]) {
            return false
        }
        let base = path.basename
        if (base == 'expansive.json' || base == 'expansive.es') {
            return false
        }
        if (control.filters && !path.glob(control.filters)) {
            // vtrace('Info', 'Filter', path)
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
        let files = directories.top.files(directories.contents, {contents: true, directories: false, relative: true})
        for (let [index,file] in files) {
            if (!filter(file)) {
                continue
            }
            if (filters || modified.file[file] || modified.everything) {
                let meta = metaCache[file.dirname] || {}
                if (copy[file]) {
                    copyFile(file, meta)
                } else {
                    try {
                        renderDocument(file, meta)
                    } catch (err) {
                        print('Cannot render', file)
                        throw err
                    }
                }
            }
        }
    }

    function preProcess() {
        if (control.pre) {
            trace('Warn', 'Using legacy control.pre, use control.pipeline.pre instead')
        }
        for each (transform in preProcessors) {
            vtrace('PreProcess', transform.name)
            if (transform.enable !== false) {
                let mark = new Date
                transform.pre.call(this, transform)
                let stat = stats.transforms[transform.name + ':post'] ||= { elapsed: 0, count: 0}
                stat.count++
                stat.elapsed += mark.elapsed
            }
        }
    }

    function postProcess() {
        if (control.post) {
            trace('Warn', 'Using legacy control.post, use control.pipeline.post instead')
        }
        if (modified.any) {
            for each (transform in postProcessors) {
                trace('Post', transform.name)
                if (transform.enable !== false) {
                    let mark = new Date
                    transform.post.call(this, transform)
                    let stat = stats.transforms[transform.name + ':post'] ||= { elapsed: 0, count: 0 }
                    stat.count++
                    stat.elapsed += mark.elapsed
                }
            }
        }
    }

    function renderSitemaps() {
        if (/* modified.everything && */ !filters && !options.watching) {
            for each (map in sitemaps) {
                sitemap(map)
            }
        }
    }

    function getExt(file: Path) {
        if (!file.extension) {
            return ''
        }
        /*
            Try to find the longest set of extensions that matches a mapping
         */
        let extensions = file.basename.name.split('.').slice(1)
        while (extensions.length) {
            for (let [key,value] in mappings) {
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

    function getMapping(file: Path?, wild = false) {
        let ext = getExt(file)
        let next = getExt(file.trimEnd('.' + ext))
        if (next) {
            mapping = ext + ' -> ' + next
            if (!mappings[mapping]) {
                mapping = ext + ' -> *'
                if (!mappings[mapping]) {
                    mapping = ext + ' -> ' + ext
                }
            }
        } else {
            mapping = ext + ' -> ' + ext
        }
        return mapping
    }

    /*
        Get the next (virtual) path after removing the mapping
        Returns [nextPath, terminal] where terminal will be true if a resolver is called for a terminal path.
     */
    function resolvePath(path: Path?, mapping) {
        let terminalPath = false
        let extensions = mapping.split(' -> ')
        let transform = resolvers[extensions[0]]
        if (transform) {
            if (resolveCache[path.name] === undefined) {
                resolveCache[path.name] = transform.resolve.call(this, path, transform)
            }
            path = resolveCache[path.name]
            if (path && path.name[0] == '|') {
                terminalPath = true
                path = Path(path.name.slice(1))
            }
        }
        if (path && extensions[0] != extensions[1]) {
            path = path.trimEnd('.' + extensions[0])
        }
        if (!path) {
            terminalPath = true
        }
        return [ path, terminalPath ]
    }

    public function trimPath(file, dir) {
        return file.trimComponents(dir.components.length)
    }

    public function getDest(sourcePath) {
        let path = getDestPath(sourcePath)
        return path ? directories.dist.join(path) : path
    }

    /*
        Convert a source file by stripping the 'contents' prefixes
     */
    function getSourcePath(source: Path): Path {
        let sep = FileSystem('/').separators[0]
        if (source.startsWith(directories.contents + sep)) {
            return source.trimComponents(directories.contents.components.length)
        } else if (source.startsWith(directories.layouts + sep)) {
            return source.trimComponents(directories.layouts.components.length)
        } else if (source.startsWith(directories.partials + sep)) {
            return source.trimComponents(directories.partials.components.length)
        } else if (source.startsWith(directories.files + sep)) {
            return source.trimComponents(directories.files.components.length)
        }
        return source
    }

    /*
        Initialize meta

        document   - Original source of the document being processed. For partials/layouts, it is the invoking document.
        sourcePath - Current source file being processed. Relative path EXCLUDING 'contents|layouts|partials'.
        source     - Current source file being processed. Relative path including 'contents|layouts|partials'.
        destPath   - Final destination filename being created. Relative path excluding 'dist'.
        dest       - Final destination filename being created. Relative path including 'dist'.
        current    - Current virtual path being transformed.
        url        - Url made from 'path'.
        absurl     - Absolute Url made from 'path'.
        top        - Relative URL path to application home page.
        abstop     - Absolute URL path to the application home page.
        abs        - Absolute URL path to the page.
        site       - Canonical absolute URL to the site. Includes scheme and host
     */
    public function initMeta(path, meta) {
        meta.pubsite = Uri(meta.site)
        if (options.serve) {
            let original: Uri? = meta.site
            meta.site = Uri(options.listen || control.listen || meta.site || 'http://localhost:4000').complete()
            if (original && original.path && meta.site.path == '/') {
                meta.site.path = original.path
            }
        } else {
            meta.site ||= Uri('http://localhost')
        }
        meta.site = Uri(meta.site)
        meta.abstop = Uri(meta.site.path)

        meta.sourcePath = getSourcePath(path)
        if ((meta.destPath = getDestPath(meta.sourcePath)) == null) {
            /* This document is not required - resolver returned null */
            return null
        }
        meta.dest = directories.dist.join(meta.destPath)
        meta.document = path
        meta.source = path

        /*
            Documents may define their own "dir" and "url". Dir is used to calculate the meta.top.
         */
        meta.dir ||= meta.destPath.dirname
        meta.dir = Path(meta.dir)
        let count = (meta.dir == '.') ? 0 : meta.dir.components.length
        meta.top = Uri(count ? '/..'.times(count).slice(1) : '.')
        global.top = meta.top

        if (meta.destPath.basename == 'index.html' && !control.keepIndex) {
            meta.url ||= Uri(Uri.encode(meta.destPath.dirname + '/'))
        } else {
            meta.url ||= Uri(Uri.encode(meta.destPath))
        }
        meta.absurl = meta.abstop.join(meta.url).normalize
        meta.fullurl = meta.site + '' + meta.url

        meta.profile = package.profile || 'debug'
        //  LEGACY
        meta.mode = meta.profile
        meta.date ||= new Date
        meta.date = Date(meta.date)
        meta.isoDate = meta.date.toISOString()
        meta.services ||= {}
        meta.version = package.version
        return meta
    }

    public function writeDest(contents, meta) {
        if (contents != null) {
            let dest = meta.dest
            dest.dirname.makeDir()
            dest.write(contents)
            trace('Render', meta.destPath)
            stats.files++
        }
    }

    /*
        Render a document by preparing the meta data, reading the contents and running the transformation pipeline.
        This includes applying layouts.
     */
    function renderDocument(file, meta) {
        let [fileMeta, contents] = splitMetaContents(file, file.readString())
        if (fileMeta) {
            meta = blendMeta(meta.clone(true), fileMeta || {})
        } else {
            meta = meta.clone(true)
        }
        if (!meta) {
            return
        }
        if (meta.draft) {
            return
        }
        meta.document = file
        meta.isDocument = true
        /*
            This is the code that prevents all files being interpreted as exp documents
         */
        if (!fileMeta && file.extension != 'exp') {
            delete meta.layout
        }
        trace('Render', file)
        contents = renderContents(contents, meta)
        if (meta.redirect) {
            contents = '<html><head><title>' + meta.title +
                       '</title><meta http-equiv="refresh" content="0; url=' + meta.redirect + '"/></head></html>\n'
        }
        if (contents !== null) {
            writeDest(contents, meta)
        }
    }

    /*
        Render in-memory contents. Invoke the transform pipeline.
     */
    public function renderContents(contents, meta) {
        /*
            Collections reset at the start of each document so layouts/partials can modify
         */
        collections = (control.collections || {}).clone()
        if (!initMeta(meta.document, meta)) {
            return null
        }
        let priorMeta = global.meta
        try {
            global.meta = meta
            global.css = meta.css = meta.css || {}
            contents = pipeline(contents, meta)
            if (meta.layout) {
                contents = blendLayout(contents, meta)
            }
            return contents
        } catch (e) {
            errors++
            if (options.abort) {
                fatal(e)
            }
            print('Cannot render: ' + meta.sourcePath)
            print(e)
            return null
        } finally {
            global.meta = priorMeta
            global.css = global.meta.css
        }
    }

    public function renderImage (url, options = {}) {
        let width = ''
        if (meta.summary) {
            if (options.summary) {
                blend(options, options.summary)
            }
        } else {
            if (options.post) {
                blend(options, options.post)
            }
        }
        let style = '', clear = '', css = ''
        if (options.lead) {
            if (meta.summary) {
                css += 'w-[30%] '
                delete options.width
                delete options.css
            } else {
                css += '!mt-0 '
                if (!options.width) {
                    css += 'w-[40%] '
                }
                if (options.css && options.css.contains('right')) {
                    css += 'float-right !ml-8 '
                } else {
                    css += 'float-left !mr-8 '
                }
            }
        }
        if (options.width) {
            if (topMeta.csp) {
                let width = parseInt(options.width / 10) * 10
                css += 'w-[' + width + '] '
                dump(service)
            } else {
                let width = options.width
                if (parseInt(width) == width) {
                    style += 'width:' + options.width + '%;'
                } else {
                    style += 'width:' + options.width + ';'
                }
            }
        }
        if (options.widths) {
            let index = meta.summary ? 0 : 1
            let width = options.widths[index]
            if (topMeta.csp) {
                width = parseInt(width / 10) * 10
                css += 'w-[' + width + '] '
            } else {
                style += 'width:' + width + ';'
            }
        }
        if (options.style) {
            if (topMeta.csp) {
                trace('Warn', 'Inline styles used with CSP')
            } else {
                style += options.style + ';'
            }
        }
        if (options.clearfix || options.clear) {
            clear = 'clearfix'
        }
        if (options.css) {
            css += options.css + ' ' + clear + ' '
            if (options.css.contains('screen')) {
                css += 'dark:shadow-none '
            }
        } else if (clear) {
            css += 'clear-both '
        }
        if (options.caption) {
            css += 'captioned '
        }
        if (css) {
            css = 'class="' + css.trim() + '" '
        }
        if (style) {
            style = 'style="' + style.trim().trim(';') + ';" '
        }
        url = url || meta.featured
        let alt = options.alt || Uri(url).basename.trimExt()
        let type = Uri(url).extension
        let avif = url.replace(/jpg|jpeg|png/, 'avif')

        if (meta.summary) {
            if (options.ifpost) {
                return
            }
            write('<a href="' + meta.url.basename + '">\n')
        } else {
            if (options.ifsummary) {
                return
            }
            if (options.click) {
                write('<a href="' + options.click + '">\n')
            }
        }
        let apath = directories.contents.join(avif[0] == '/' ? avif.slice(1) : avif)
        if (apath.exists && avif != url) {
            write('<picture>\n' +
                '<source srcset="' + avif + '" type="image/avif">\n' +
                '<source srcset="' + url + '" type="image/' + type + '">\n' +
                '<img ' + css + style + 'src="' + url + '" alt="' + alt + '">\n' +
              '</picture>\n')
        } else {
            write('<img ' + css + style + 'src="' + url + '" alt="' + alt + '">\n')
        }
        if (!meta.summary) {
            if (options.click) {
                write('</a>\n')
            }
        }
        if (options.caption) {
            write('<div class="caption">' + options.caption + '</div>\n')
        }
        if (options.lead) {
            write('<div class="nop"></div>')
        }
    }

    /*
        Convert an input source path into a destination path relative to 'dist'
        This resolves all extension mappings.
     */
    public function getDestPath(sourcePath) {
        let path = destPathCache[sourcePath]
        if (path != null) {
            return path
        }
        let terminalPath
        let path = sourcePath
        let visited = {}
        while (!terminalPath && !visited[path]) {
            visited[path] = true
            [ path, terminalPath ] = resolvePath(path, getMapping(path))
        }
        destPathCache[sourcePath] = path
        return path
    }

    /*
        Run the transformation pipeline on the contents applying all mappings.
     */
    function pipeline(contents, meta) {
        let terminalPath, mapping
        let path = meta.sourcePath
        let visited = {}
        while (contents && !terminalPath && !visited[path]) {
            mapping = getMapping(path)
            contents = transform(contents, mapping, path, meta)
            visited[path] = true
            [ path, terminalPath ] = resolvePath(path, mapping)
        }
        if (terminalPath) {
            meta.destPath = path
            meta.dest = directories.dist.join(meta.destPath)
        }
        return contents
    }

    public function terminal(path: Path?): Path? {
        if (path) {
            return Path('|' + path.name)
        }
        return path
    }

    /*
        Transform content from one extension to another. Invoke all required services.
     */
    function transform(contents, mapping, path, meta) {
        vtrace('Transform', meta.source + ' (' + mapping + ')')
        meta.extensions = getAllExtensions(path)
        meta.extension = meta.extensions.slice(-1)[0]
        meta.current = path

        let stages = mappings[mapping]
        for each (transform in stages) {
            if (transform.enable !== false) {
                if (transform.render) {
                    [meta.input, meta.output] = mapping.split(' -> ')
                    let started = new Date
                    try {
                        vtrace('Transform', transform.name)
                        /*
                            Override service configuration with per-document meta.services
                         */
                        meta.service = blend(meta.service || {}, transform.service, {overwrite: false})
                        contents = transform.render.call(this, contents, meta, transform)
                    } catch (e) {
                        if (options.serving) {
                            trace('Error', 'Cannot render ' + path)
                            print(e)
                        } else {
                            trace('Error', 'Cannot render ' + path + ' for document ' + meta.dest)
                            throw e
                        }
                    }
                    stats.transforms[transform.name].count++
                    stats.transforms[transform.name].elapsed += started.elapsed
                }
            } else {
                vtrace('Skip', transform.name + ' for ' + meta.source + ' (disabled)')
            }
            if (contents == null) {
                break
            }
        }
        return contents
    }

    /*
        Get list of extensions
     */
    function getAllExtensions(file) {
        let extensions = []
        while (mappings[file.extension]) {
            ext = file.extension
            extensions.push(ext)
            file = file.trimExt()
        }
        extensions.push(file.extension)
        return extensions.reverse()
    }

    /*
        Render .exp content
     */
    function renderExp(contents, meta, transform) {
        let priorBuf = this.obuf
        this.obuf = new ByteArray
        let parser = new ExpansiveParser
        let code
        let stat = stats.transforms.exp
        try {
            let mark = new Date
            contents = contents.replace(/<!--prettier-ignore-->\s*/sm, '')
            code = parser.parse(contents)
            stat.parse += mark.elapsed
            mark = new Date
            this.currentMeta = meta
            eval(code)
            stat.eval += mark.elapsed

            mark = new Date
            /* Exported from expParser */
            global._exp_parser_.call(this)
            stat.run += mark.elapsed
        } catch (e) {
            trace('Error', 'Error when processing ' + meta.source)
            if (options.debug) {
                if (code) {
                    print('Code: \n' + code.slice(0, 160) + '\n')
                } else {
                    print('Contents \n' + contents.slice(0, 160) + '\n')
                }
                dump("Meta", meta)
                print("In document", meta.document)
            }
            throw e
        }
        let results = obuf.toString()
        this.obuf = priorBuf
        return results
    }

    public function runFile(cmd, contents, meta) {
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

    public function run(cmd, contents = null) {
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
        Find the first matching file using the order of mappings
     */
    function findFile(dir: Path, pattern: String, meta) {
        let path
        for each (f in dir.files(pattern + '.*')) {
            if (f.extension == 'html') {
                return f
            }
            for (let mapping in mappings) {
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
        let priorMeta = meta
        global.meta = meta = meta.clone(true)
        global.css = meta.css = meta.css || {}
        if (!meta.layout) {
            contents = pipeline(contents, meta)
        } else {
            while (meta.layout) {
                let layout = findFile(directories.layouts, meta.layout, meta)
                if (meta.once) {
                    useFile('layouts', layout, meta.document)
                }
                if (!layout) {
                    fatal('Cannot find layout "' + meta.layout + '"')
                }
                meta.layout = ''
                let layoutContents
                [meta, layoutContents] = getCached(layout, meta)
                meta.source = layout
                meta.sourcePath = getSourcePath(meta.source)
                meta.isLayout = true
                delete meta.isDocument
                contents = contents.replace(/\$/mg, '$$$$')
                contents = layoutContents.replace(/ *<@ *content *@> */, contents)
                vtrace('Blend', layout + ' + ' + meta.source)
                contents = pipeline(contents, meta)
            }
        }
        global.meta = priorMeta
        global.css = global.meta.css || {}
        return contents
    }

    /*
        This is the partial() global function
     */
    public function blendPartial(name: Path, options = {}) {
        let priorMeta = global.meta
        let meta = global.meta = global.meta.clone(true)
        global.css = meta.css = meta.css || {}
        let partial = findFile(directories.partials, name, meta)
        if (!partial) {
            fatal('Cannot find partial "' + name + '"' + ' for ' + meta.source)
        }
        if (!meta.once) {
            useFile('partials', partial, meta.document)
        }
        blend(meta, options)
        if (meta.partial == name) {
            fatal('Recursive partial in "' + partial + '"')
        }
        meta.partial = name
        meta.isPartial = true
        delete meta.isDocument
        meta.isLayout = false
        meta.source = partial
        meta.sourcePath = getSourcePath(meta.source)
        try {
            let contents
            [meta, contents] = getCached(partial, meta)
            contents = contents.trimStart()
            contents = pipeline(contents, meta)
            write(contents)
        }
        catch (e) {
            trace('Error', 'Cannot process partial "' + name + '"')
            fatal(e)
        }
        global.meta = priorMeta
        global.css = global.meta || {}
    }

    public function svg(name: Path, options = {}) {
        let svg = Path(name)
        if (!svg.exists && directories.svg) {
            svg = directories.svg.join(svg)
        }
        if (!svg.exists) {
            throw 'Cannot find ' + svg
        }
        let data = svg.readString()
        if (options.klass) {
            data = data.replace(/\<svg/, '<svg class="' + options.klass + '"')
        }
        let color = options.fill ? options.fill : 'currentColor'
        data = data.replace(/\<svg/, '<svg fill="' + color + '"')

        if (options.viewbox) {
            data = data.replace(/viewBox="[^"]*"/, 'viewBox="' + options.viewbox + '"')
        }
        write(data)
    }

    public function vary(name, ...variants) {
        write(`<script>\n(function() {\n` + 
        `let variants = ` + JSON.stringify(variants) + `;\n` + 
        `let variant = variants[Date.now() % variants.length];\n` + 
        `document.getElementById(variant).style.display = 'block';\n` + 
        `(globalThis.metricVariants = globalThis.metricVariants || {})["` + name + `"] = variant;\n` +
        `})();\n</script>\n`)
    }

    function setupEjsTransformer() {
        global.partial = blendPartial
        global.vary = vary
        global.write = write
        global.writeSafe = writeSafe
        global.renderImage = renderImage
        global.partial.bind(this)
        global.renderImage.bind(this)
        global.vary.bind(this)
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

    public function splitMetaContents(file, contents): Array {
        let meta
        try {
            if (file.extension == 'exp') {
                //  Non greedy match of all characters up to a } at the end of a line
                let match = contents.match(/^.*?}$/sm)
                if (match) {
                    let prefix = contents.substring(0, match[0].length)
                    prefix = prefix.replace(/<!--prettier-ignore-->\s*/sm, '')
                    meta = JSON.parse(prefix)
                    contents = contents.substring(match[0].length)
                }
            }
        } catch (e) {
            //  Continue without parsing meta
        }
        return [meta, contents]
    }

    public function blendMeta(meta, add): Object {
        blend(meta, add)
        for (let [key, value] in directories) {
            directories[key] = Path(value)
        }
        return meta
    }

    function deploy(rest, meta) {
        if (!control.deploy) {
            control.deploy = {
                from: [directories.dist.join('**'), directories.cache.join('*'), PAK, 'package.json', 'esp.json'],
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

        for each (p in [ directories.contents, directories.dist, directories.layouts, directories.partials ]) {
            Path(p).makeDir()
        }
        if (!PAK.exists) {
            PakTemplate.name = '' + App.dir.basename
            PakTemplate.title = PakTemplate.name.toPascal()
            PakTemplate.description = PakTemplate.name.toPascal() + ' Description'
            PAK.write(serialize(PakTemplate, {pretty: true, indent: 4}) + '\n')
        }
    }

    function profile(newProfile, meta) {
        if (newProfile.length == 0) {
            print(package.profile || 'debug')
        } else {
            package.profile = newProfile[0].toString()
            delete package._installedDependencies_
            delete package._expansive_
            delete package.mode
            PAK.write(serialize(package, {pretty: true, indent: 4}) + '\n')
            trace('Set', 'Profile to "' + package.profile + '"')
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
        let site: Uri = meta.site.trimEnd('/')
        let base = dir.trimStart(directories.dist).trimStart('/')
        for each (let file: Path in list) {
            if (!filter(file)) {
                continue
            }
            if (file.basename == 'index.html' && !control.keepIndex) {
                file = file.dirname + '/'
            }
            let url: String = site.join(base, Uri.encode(file.name)).toString().trimEnd('.gz').trimEnd('./')
            fp.write('    <url>\n' +
                '        <loc>' + url + '</loc>\n' +
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

    public function fatal(...args): Void {
        log.error(...args)
        App.exit(1)
    }

    function checkEngines(name, path) {
        let path = path.join(PAK)
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
        if (!options || !options.quiet) {
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

    public function addItems(collection, items, modifiers = '') {
        if (!items) {
            return
        }
        if (!(items is Array)) {
            items = [items]
        }
        //  If called before rendering, update the control
        let collections = collections || control.collections
        let list = (collections[collection] || [])
        for each (let item in items) {
            if (!list.find(function(i) { return i.item == item })) {
                list.push({item, modifiers})
            }
        }
        collections[collection] = list
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
        for each (let item in items) {
            collections[collection] = collections[collection].map(function(i) {
                return i.item != item
            })
        }
    }

    public function resetItems(collection) {
        if (!collections[collection]) {
            return
        }
        collections[collection] = []
    }

    public function setItems(collection, items) {
        if (!items || !collections[collection]) {
            return
        }
        collections[collection] = []
        addItems(collection, items)
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

    /*
        Compute the render order requirements for packages.
     */
    private function computeOrder(name = null) {
        let pak, path
        if (paks[name]) {
            return
        }
        let dependencies
        if (!name) {
            pak = package
            pak._expansive_ = config.clone()
            /*
                Blend with the documented dependencies then add any locally installed dependencies
             */
            dependencies = (pak.dependencies.clone() || {})
            blend(dependencies, pak._installedDependencies_)
        } else {
            path = directories.paks.join(name, PAK)
            if (!path.exists) {
                //  LEGACY
                path = directories.paks.join(name, 'package.json')
                if (!path.exists) {
                    return
                }
            }
            pak = path.readJSON()
            path = directories.paks.join(name, CONFIG).joinExt('json')
            if (path.exists) {
                pak._expansive_ = path.readJSON()
            }
            dependencies = pak.dependencies
            if (pak.devDependencies) {
                let criteria = pak.devDependencies.expansive
                if (criteria) {
                    if (!Version(Config.Version).acceptable(criteria)) {
                        throw 'Package ' + pak.name + ' requires Expansive ' + criteria +
                              '. Expansive version ' + Config.Version + ' is not compatible with this requirement.' + '\n'
                    }
                }
            }
        }
        blend(pak, {_expansive_: {control:{render:{}}}}, {overwrite: false})

        for (dname in dependencies) {
            /* Depth first traversal */
            computeOrder(dname)
        }
        paks[pak.name] = pak

        /*
            Render patterns are computed relative to the containing package under contents/lib/NAME
         */
        let render = pak._expansive_.control.render
        for (let [kind, patterns] in render) {
            for (let [index,pattern] in patterns) {
                if (pattern.startsWith('contents')) {
                    print("WARNING - render values start with contents/")
                }
                patterns[index] = Path(pattern).name.expand(expansive.dirTokens, { fill: '.' })
            }
            render[kind] = directories.contents.files(patterns, {relative: true})
        }
    }

    /*
        Order files based on pak order and permit render:{} overrides
     */
    public function orderFiles(files: Array, kind): Array {
        let result = []
        for each (pak in paks) {
            let render = pak._expansive_.control.render[kind]
            if (render) {
                for each (path in render) {
                    result.push(path)
                }
            } else {
                let pdir = getSourcePath(directories.lib).join(pak.name)
                for each (file in files) {
                    if (file.name.startsWith(pdir.name + pdir.separator)) {
                        result.push(file)
                    }
                }
            }
        }
        return (result + files).unique()
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

    @end
 */
