#!/usr/bin/env ejs
/*
    exp.es - Expansive Static Site Generator
 */

module exp {

require ejs.unix
require ejs.template
require ejs.web
require ejs.version

const CONFIG: Path = Path('exp.json')
const VERSION = '0.1.0'
const LISTEN = '4000'

const USAGE = 'Usage: exp [options] [filters ...]
    --chdir dir      # Change to directory before running
    --gen            # Do an initial gen before watching
    --keep           # Keep intermediate transforms
    --listen IP:PORT # Endpoint to listen on
    --log path:level # Trace to logfile
    --noclean        # Do not clean final before generate
    --nowatch        # No watch, just run
    --quiet          # Quiet mode
    --verbose        # Verbose mode
    --version        # Output version information
  Commands:
    clean            # Clean final output directory
    init             # Create exp.json
    generate         # Generate entire site
    filters, ...     # Generate only matching documents
    watch            # Watch for changes and regen
    <CR>             # Serve and watches for changes
'

class Exp {
    var args: Args
    var currentPlugin: Path
    var currentPluginDefinition: Object
    var copy: Object
    var dirs: Object
    var exclude: Object
    var filters: Array
    var genall: Boolean
    var lastGen: Date
    var log: Logger = App.log
    var mastersModified: Boolean
    var obuf: ByteArray?
    var options: Object
    var paks: Path
    var processCount
    var topMeta: Object
    var transforms: Object
    var verbosity: Number = 0

    let argsTemplate = {
        options: {
            chdir:   { range: Path },
            gen:     { alias: 'g' },
            keep:    { alias: 'k' },
            listen:  { range: String },
            log:     { alias: 'l', range: String },
            noclean: { },
            nowatch: { },
            quiet:   { alias: 'q' },
            verbose: { alias: 'v' },
            version: { },
        },
        unknown: unknown,
        usage: usage,
    }

    var ExpTemplate = {
        title:       'Home page title',
        url:         'Home page url',
        description: 'Meta data description (optional)',
        keywords:    'Meta data keywords (optional)',
        control: {
            exclude: [],
            copy: [ 'images', 'lib', 'scripts' ],
            script: '',
            plugins: [],
            sitemap: {
                include: /\.html/,
            },
        }
    }


    function Exp() { }

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
        setupMeta()
        setupPlugins()
        setupEjsTransformer()
        return topMeta
    }

    function setupMeta() {
        topMeta = {
            layout: 'default',
            control: {
                directories: {
                    documents: Path('documents'),
                    layouts:   Path('layouts'),
                    partials:  Path('partials'),
                    final:     Path('final'),
                },
                listen: options.listen || LISTEN
                plugins: [],
                watch: 2000,
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
    }

    function loadConfig(dir: Path, meta) {
        let path = dir.join(CONFIG)
        if (path.exists) {
            let config
            try {
                config = path.readJSON()
            } catch (e) {
                fatal('Syntax error in "' + path + '"')
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

    function plugin(name, from, toList, fun, obj = {}) {
        if (!(toList is Array)) {
            toList = [toList]
        }
        for each (to in toList) {
            let mapping = from + ' -> ' + to
            let transform = transforms[mapping]
            if (transform && transform.name) {
                vtrace('Warn', 'Redefining transform ' + mapping + ' by ' + name)
            }
            transform ||= {}
            transforms[mapping] = transform
            blend(transform, currentPluginDefinition || {}, {overwrite: false})
            blend(transform, obj, {overwrite: false})
            transform.name = name
            transform.path = currentPlugin
            transform.render = fun
            vtrace('Transform', mapping + ' by ' + name)
        }
    }

    function setupInternalPlugins() {
        plugin('exp-internal', 'exp', '*', transformExp)
    }

    function setupPlugins() {
        transforms = topMeta.control.transforms ||= {}
        setupInternalPlugins()
        setupCachedPlugins()
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

    function setupPlugin(name, path) {
        let epath = path.join('exp.json')
        if (!epath.exists) {
            fatal('Plugin "' + path + '" is missing exp.json')
        }
        checkEngines(name, path)
        let config = epath.readJSON()
        for each (def in config.control.transforms) {
            if (!def.service || !def.from || !def.to || !def.script) {
                fatal('Plugin "' + file.extension + '" is incomplete')
            }
            try {
                currentPlugin = path
                currentPluginDefinition = def
                eval(def.script)
            } catch (e) {
                fatal('Script error in "' + path + '"\n' + e)
            }
        }
        if (config.script) {
            try {
                vtrace('Eval', 'Script for plugin "' + path + '"')
                eval(config.script)
            } catch (e) {
                fatal('Script error in "' + path + '"\n' + e)
            }
        }
    }

    function setupCachedPlugins() {
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
                setupPlugin(fullname, path)
            } else {
                let path = dirs.paks.join(name)
                if (path.join('exp.json').exists) {
                    setupPlugin(name, dirs.paks.join(name))
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
        lastGen = new Date(0)

        switch (task) {
        case 'clean':
            preclean(meta)
            break

        case 'generate':
            genall = true
            if (rest.length > 0) {
                filters = rest
            }
            preclean()
            generate()
            break

        case 'install':
            if (rest.length == 0) {
                usage()
            }
            install(rest, meta)
            break

        case 'watch':
            watch(meta)
            break

        default:
            if (task) {
                /* Process only specified files. If not, process all */
                filters = [task] + rest
                genall = false
                generate()
            } else {
                serve(topMeta)
            }
            break
        }
    }

    function watch(meta) {
        if (options.gen) {
            options.quiet = true
            trace('Generate', 'Initial generation ...')
            lastGen = new Date()
            generate()
            options.quiet = false
        }
        trace('Watching', 'for changes every ' + meta.control.watch + ' msec ...')
        while (true) {
            let mark = new Date()
            event('check', lastGen)
            mastersModified = checkMastersModified()
            generate()
            lastGen = mark
            App.sleep(meta.control.watch || 2000)
        }
    }

    function serve(meta) {
        let address = options.listen || meta.control.listen || '127.0.0.1:4000'
        let server: HttpServer = new HttpServer({documents: dirs.final})
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

    function generate() {
        let started = new Date
        processCount = 0

        exclude = buildFileHash(topMeta.control.exclude)
        copy = buildFileHash(topMeta.control.copy)

        generateDir(dirs.documents, topMeta)
        generateFiles(topMeta)
        postclean()
        sitemap()
        if (genall) {
            trace('Info', 'Generated ' + processCount + ' files to "' + dirs.final + '". ' +
                'Elapsed time %.2f' % ((started.elapsed / 1000)) + ' secs.')
        } else if (filters && processCount == 0) {
            trace('Warn', 'No matching files for filter: ' + filters)
        }
    }

    /*
        Not watched
     */
    function generateFiles(meta) {
        if (!filters) {
            for each (let pattern: Path in meta.control.files) {
                cp(pattern, dirs.final, {tree: true})
            }
        }
    }

    function copyFile(file, meta) {
        let trimmed = rebase(file, dirs.documents)
        if (file.isDir) {
            if (genall || checkModified(file, meta)) {
                let home = App.dir
                let dest = dirs.final.absolute
                App.chdir(file)
                qtrace('Copy', file)
                cp('**', dest.join(trimmed), {tree: true, nothrow: true})
                App.chdir(home)
            } else {
                for each (path in file.files('**')) {
                    if (checkModified(path, meta)) {
                        qtrace('Copy', path)
                        cp(path, dirs.final.join(path))
                    }
                }
            }
        } else {
            if (genall || checkModified(file, meta)) {
                qtrace('Copy', file)
                cp(file, dirs.final.join(trimmed))
            }
        }
    }

    function buildFileHash(list: Array) {
        let hash = {}
        for each (pattern in list) {
            let path = dirs.documents.join(pattern)
            if (path.isDir) {
                pattern = pattern.toString() + '/**'
                hash[path] = true
            }
            for each (path in dirs.documents.files(pattern)) {
                hash[path] = true
            }
        }
        return hash
    }

    function generateDir(dir: Path, meta) {
        let priorDirs = dirs
        loadConfig(dir, meta)
        dirs = meta.control.directories

        for each (file in dir.files()) {
            if (exclude[file]) {
                vtrace('Exclude', file)
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
                generateDir(file, meta.clone())

            } else {
                if (genall || mastersModified || checkModified(file, meta)) {
                    meta.page = rebase(file, dirs.documents)
                    transform(file, meta)
                }
            }
        }
        dirs = priorDirs
    }

    function rebase(file, to) {
        let count = to.components.length
        return file.trimComponents(count)
    }

    function getFinalDest(file) {
        let trimmed = rebase(file, dirs.documents)
        let dest = dirs.final.join(trimmed)
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

    function checkModified(file, meta) {
        if (file.isDir) {
            if (file.modified.time >= lastGen.time) {
                return true
            }
            return false
        }
        let dest = getFinalDest(file)
        // print("CHECK", file, dest, dest.exists, file.modified.time - lastGen.time, file.modified.time)
        if (dest.exists && file.modified.time < lastGen.time) {
            /* print("FALSE", dest, dest.exists, file.modified.time - lastGen.time,
                    Date(file.modified.time)) */
            return false
        }
        vtrace('Modified', file)
        event('onchange', file, meta)
        return true
    }

    function checkMastersModified(dir): Boolean {
        lastGen ||= Date(0)
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
    //  MOB - order functions

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
            dest = dirs.final.join(trimmed)
        } else if (file.startsWith(dirs.partials)) {
            print("@@@@@ USED")
            trimmed = rebase(file, dirs.partials)
            dest = dirs.final.join('partials', trimmed)
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

    function transform(file, meta): Path {
        let original = file
        let dest = file
        let transformed
        do {
            let mapping = getMapping(file)
            dest = getDest(file, mapping)
            if (dest == file) {
                break
            }
            transformed = transformInner(file, dest, mapping, meta)
            file = dest
        } while (transformed)

        transformInner(file, dest, '* -> *', meta)

        if (original.startsWith(dirs.documents)) {
            if (!options.verbose && !options.quiet) {
                trace('Created', file)
            }
            processCount++
        }
        return file
    }

    function transformInner(file, dest, mapping, meta): Boolean {
        let transform = transforms[mapping]
        let [fileMeta, contents] = splitMeta(file.readString(), file)
        blendMeta(meta, fileMeta || {})

        if (transform) {
            if (transform.enable !== false) {
                if (transform.render) {
                    let extensions = mapping.split(' -> ')
                    meta.from = extensions[0]
                    meta.to = extensions[1]
                    delete meta.file
/*
    MOB - 
    perhaps better to return [contents, dest] instead of setting meta.file
    Allow to just return string
 */
                    let result = transform.render.call(this, contents, file, meta, transform)
                    if (result is String) {
                        contents = result
                    } else if (result is Array) {
print("GOT ARRAY")
                        [contents, dest] = result
                    } else {
                        fatal('Plugin "' + transform.name + ' has bad result: ' + typeOf(result))
                    }
                    vtrace('Transform', file + ' -> ' + dest +  ' (' + transform.name + ': ' + mapping + ')')
                } else {
                    fatal("Transform missing render method", file)
                }
            } else {
                vtrace('Skip', transform.name + ' for ' + file + ' (disabled)')
            }
        } else if (file == dest) {
            return false
        }
        dest.dirname.makeDir()
        if (fileMeta) {
            dest.write(blendLayout(contents, dest, meta))
        } else {
            dest.write(contents.toString())
        }
        vtrace('Process', file, '->', dest)
        if (file != dest && !file.startsWith(dirs.documents) && !options.keep) {
            file.remove()
        }
        return true
    }

/* UNUSED
    function transformFinal(file, dest, meta) {
        let [fileMeta, contents] = splitMeta(file.readString(), file)
        blendMeta(meta, fileMeta || {})
        if (fileMeta) {
            dest.write(blendLayout(contents, dest, meta))
        } else {
            dest.write(contents.toString())
        }
    }
*/

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

    function setupTransform(file, meta) {
        global.meta = meta
        meta.date = new Date
        meta.extensions = getAllExtensions(file)
        meta.extension = meta.extensions.slice(-1)[0]
        meta.path = file
        meta.tags ||= []
        let dir = meta.page.dirname
        let count = (dir == '.') ? 0 : dir.components.length
        meta.top = '../'.times(count)
        if (!meta.isPartial) {
            let trimExt = meta.extensions.slice(1).join('.')
            let url = rebase(file, dirs.documents).trimEnd('.' + trimExt)
            meta.basename = url.basename
            meta.outpath = dirs.final.join(url)
            meta.url = Uri(url)
        }
        global.top = meta.top
    }

    function transformExp(contents, file, meta) {
        vtrace('Parse', file)
        let priorBuf = this.obuf
        this.obuf = new ByteArray
        let priorMeta = global.meta
        setupTransform(file, meta)
        let parser = new TemplateParser
        let code
        try {
            code = parser.parse(contents, {dir: '', layout: ''})
            code = 'global._export_ = function() { ' + code + ' }'
            eval(code)
            global._export_.call(this)
        } catch (e) {
            trace('Error', 'Error when processing ' + meta.page + ' in file ' + file)
            fatal(e)
        }
        let results = obuf.toString()
        this.obuf = priorBuf
        global.meta = priorMeta
        return results
    }

    function runFromContents(cmd, contents, file) {
        let path = file.dirname.join('_etmp_').joinExt(file.extension)
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

    function matchFile(dir: Path, pattern: String, meta) {
        for each (f in dir.files(pattern + '*')) {
            if (f.extension == 'html') {
                return f
            }
            for (let ext in transforms) {
                if (f.extension == ext) {
                    return f
                }
            }
        }
        return null
    }

    function blendLayout(contents, file, meta) {
        if (meta.layout) {
            let layout = matchFile(dirs.layouts, meta.layout, meta)
            if (!layout) {
                fatal('Cannot find layout "' + meta.layout + '"')
            }
            meta.layout = layout
            let ldata = layout.readString()
            contents = contents.replace(/\$/mg, '$$$$')
            contents = ldata.replace(/ *<%.*content.*%> */, contents)
            /*
                Create a filename using the layout extensions and the filename base without extensions
             */
            let extensions = layout.basename.toString().split('.').slice(1).join('.')
            let basename = file.basename.toString().split('.')[0]
            let path = file.dirname.join(basename).joinExt(extensions)
            vtrace('Blend', layout + ' + ' + file + ' -> ' + path)
            path.write(contents)
            if (file.startsWith(dirs.final) && !options.keep) {
                file.remove()
            }
            let dest = transform(path, meta)
            contents = dest.readString()
            if (dest.startsWith(dirs.final) && !options.keep) {
                dest.remove()
            }
        }
        return contents
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
        Global functions for ejs templates
     */
    public function writeSafe(...args) {
        obuf.write(...args)
    }

    public function write(...args) {
        obuf.write(...args)
    }

    public function blendPartial(name: Path, options = {}) {
        let partial = matchFile(dirs.partials, name, global.meta)
        if (partial) {
            let dest
            try {
                let meta = global.meta.clone()
                blend(meta, options)
                meta.partial = name
                meta.isPartial = true
                dest = transform(partial, meta)
                writeSafe(dest.readString())
            }
            catch (e) {
                trace('Error', 'Cannot process partial "' + name + '"')
                trace('Details', e.message)
                App.log.debug(3, e)
            }
            finally {
                dest.remove()
            }
            return
        }
        fatal('Cannot find partial "' + name + '"' + ' for ' + meta.page)
    }

    function splitMeta(contents, file): Array {
        let meta
        try {
            if (contents[0] == '-') {
                let parts = contents.split('---')
                if (parts) {
                    let mdata = parts[1].trim()
                    contents = parts.slice(2).join('---').trim()
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
                        contents = parts.slice(1).join('\n}').trim()
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

    function event(name, file = null, meta = null) {
        if (global[name]) {
            global.meta = topMeta
            (global[name]).call(this, file, meta)
        }
    }

    function preclean() {
        if (!filters && !options.noclean) {
            dirs.final.removeAll()
        }
    }

    function postclean() {
        dirs.final.join('partials').remove()
    }

    function init() {
        let path = CONFIG
        if (path.exists) {
            trace('Warn', CONFIG + ' already exists')
            return
        }
        trace('Create', CONFIG)
        path.write(serialize(ExpTemplate, {pretty: true, indent: 4, quotes: false}))
        for each (p in [ 'documents', 'layouts', 'partials', 'files', 'final' ]) {
            Path(p).makeDir()
        }
    }

    function install(plugins, meta) {
        let pak = Cmd.locate('pak')
        if (!pak) {
            fatal('Cannot find pak. Install from https://embedthis.com/pak')
        }
        let paks = plugins.map(function(name) 'exp-' + name)
        try {
            Cmd.run([pak, 'cache'] + paks)
            trace('Installed', plugins + ' to ' + App.home.join('.paks'))
        } catch(e) {
            fatal('Cannot install', plugins + '\n' + e.message)
        }
        let path = Path('exp.json')
        let obj = path.readJSON()
        obj.plugins ||= []
        obj.plugins.push(plugins)
        path.write(serialize(obj, {pretty: true, indent: 4, quotes: false}))
    }

    function sitemap() {
        if (!genall && !mastersModified) {
            return
        }
        let path = dirs.final.join('Sitemap.xml')
        path.dirname.makeDir()
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')

        let count = 0
        for each (file in dirs.final.files('**', topMeta.control.sitemap)) {
            //  MOB - must get length of "final" to trim
            //  MOB - trim gz must be conditional on ??
            let filename = file.trimComponents(1).toString().trimEnd('.gz') 
            fp.write('    <url>\n' +
                '        <loc>' + topMeta.url + '/' + filename + '</loc>\n' +
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

    function qtrace(tag: String, ...args): Void {
        if (!options.quiet) {
            log.activity(tag, ...args)
        }
    }

    function trace(tag: String, ...args): Void {
        log.activity(tag, ...args)
    }

    function vtrace(tag: String, ...args): Void {
        if (verbosity > 0) {
            log.activity(tag, ...args)
        }
    }

    function touch(path: Path) {
        path.write(path.readString())
    }

    public function getFileMeta(file: Path) {
        let [meta, contents] = splitMeta(file.readString(), file)
        meta = blend(topMeta.clone(), meta || {})
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
}

/*
    Main program
 */
var exp: Exp = new Exp
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
