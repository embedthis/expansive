#!/usr/bin/env ejs
/*
    exp.es - Expansive Static Site Generator

    exp generate                # generate entire site
    exp filters, ...            # Generate only matching documents
    exp [--gen] watch           # Watch for changes and regen
    exp [--nowatch]             # Serve and watches for changes
 */
module exp {

require ejs.unix
require ejs.template
require ejs.web

class Exp {
    const VERSION = '0.1.0'
    var args: Args
    var filters: Array
    var genall: Boolean
    var lastGen: Date
    var log: Logger = App.log
    var obuf: ByteArray?
    var options: Object
    var paks: Path
    var processCount
    var plugins
    var topMeta: Object
    var transforms
    var verbosity: Number = 0

    let argsTemplate = {
        options: {
            chdir:   { range: Path },
            gen:     { alias: 'g' },
            keep:    { alias: 'k' },
            listen:  { range: String },
            log:     { alias: 'l', range: String },
            nowatch: { },
            quiet:   { alias: 'q' },
            verbose: { alias: 'v' },
            version: { },
        },
        unknown: unknown,
        usage: usage,
    }

    function Exp() {
        transforms = {
            exp: transformExp,
            less: transformLess,
            md: transformMarkdown,
            sh: transformShell,
        }
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
        App.log.write('Usage: exp [options] [filter patterns...]\n' +
            '    --chdir dir      # Change to directory before testing\n' + 
            '    --gen            # Do an initial gen before watching\n' + 
            '    --keep           # Keep intermediate transforms\n' + 
            '    --listen IP:PORT # Endpoint to listen on\n' + 
            '    --log path:level # Trace to logfile\n' + 
            '    --nowatch        # No watch, just run\n' + 
            '    --quiet          # Quiet mode\n' + 
            '    --verbose        # Verbose mode\n' + 
            '    --version        # Output version information\n' +
            '  Commands:\n' +
            '    generate         # generate entire site\n' +
            '    filters, ...     # Generate only matching documents\n' +
            '    watch            # Watch for changes and regen\n' +
            '    <CR>             # Serve and watches for changes\n' +
            '\n')
        App.exit(1)
    }

    function parseArgs(): Void {
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
        setupMeta()
        setupPlugins()
        setupEjsTransformer()
    }

    function setupMeta() {
        topMeta = {
            directories: {
                documents: Path('documents'),
                layouts:   Path('layouts'),
                partials:  Path('partials'),
                files:     Path('files'),
                final:     Path('final'),
            },
            layout: 'default',
            listen: options.listen || '4000',
            plugins: { },
            watch: 2000,
        }
        if (App.config.exp) {
            blendMeta(topMeta, App.config.exp) 
        }
        if (!Path('exp.json').exists) {
            throw 'Cannot find exp.json'
            fatal('Cannot find exp.json')
        }
        loadConfig('.', topMeta)
    }

    function loadConfig(dir: Path, meta) {
        let path = dir.join('exp.json')
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
            if (config.script) {
                try {
                    eval(config.script)
                } catch (e) {
                    fatal('Script in "' + path + '"\n' + e)
                }
            }
        }
    }

    /*
        Package.json lists dependencies. Examine these for an exp.json
     */
    function setupPlugins() {
        let path = Path('package.json')
        let plugins = {}
        if (path.exists) {
            package = path.readJSON()
            blend(package, { directories: { paks: 'paks' } }, false)
            paks = Path(package.directories.paks)
            for (dep in package.dependencies) {
                let pdir = paks.join(dep)
                let econfig = pdir.join('exp.json')
                if (econfig.exists) {
                    transforms[dep] = transformPlugin
                    loadConfig(transform.dirname, topMeta)
                    let pconfig = topMeta.plugins[dep]
                    plugins[dep] = (pconfig && pconfig.transform) ? pconfig.transform : 'transform.es'
                }
            }
            vtrace('Plugins', plugins)
        }
    }

    function process(): Void {
        let task = args.rest.shift()
        let rest = args.rest
        let meta = topMeta
        vtrace('Task', task, rest)
        lastGen = new Date(0)

        switch (task) {
        case 'generate':
            genall = true
            if (rest.length > 0) {
                filters = rest
            }
            preclean()
            generate()
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
                genall = mastersModified(meta.directories.partials) || mastersModified(meta.directories.layouts)
                serve(topMeta)
            }
            break
        }
    }

    function watch(meta) {
        if (options.gen) {
            options.quiet = true
            trace('Generate', 'Initial generation ...')
            generate()
            options.quiet = false
        }
        lastGen = new Date
        trace('Watching', 'for changes every ' + meta.watch + ' msec ...')
        while (true) {
            event('check', lastGen - meta.watch/2)
            genall = mastersModified(meta.directories.partials) || mastersModified(meta.directories.layouts)
            let mark = new Date()
            generate()
            lastGen = mark
            App.sleep(meta.watch || 2000)
        }
    }

    function serve(meta) {
        let address = options.listen || meta.listen || '127.0.0.1:4000'
        let documents = meta.final || 'final'
        let server: HttpServer = new HttpServer({documents: documents})
        let routes = meta.routes || Router.Top
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
        server.listen(address)
        if (options.nowatch) {
            trace('Listen', address)
            App.run()
        } else {
            trace('Listen', address)
            watch(meta)
        }
    }

    function exclude(file, meta): Boolean {
        for each (d in meta.exclude) {
            if (file.startsWith(d)) {
                return true
            }
        }
        return false
    }

    function include(file, meta): Boolean {
        for each (filter in filters) {
            if (filter.startsWith(file)) {
                return true
            }
            if (file.startsWith(filter)) {
                return true
            }
        }
        return false
    }

    function generate() {
        let started = new Date
        processCount = 0
        generateDir(topMeta.directories.documents, topMeta)
        filesCopy(topMeta)
        postclean()
        sitemap()
        if (genall) {
            trace('Info', 'Generated ' + processCount + ' files to "' + topMeta.directories.final + '". ' +
                'Elapsed time %.2f' % ((started.elapsed / 1000)) + ' secs.')
        } else if (filters && processCount == 0) {
            trace('Warn', 'No matching files for filter: ' + filters)
        }
    }

    function filesCopy(meta) {
        if (!filters && meta.directories.files.exists) {
            if (meta.directories.files.files().length == 0) {
                return
            }
            let home = App.dir
            let dest = meta.directories.final.absolute
            App.chdir(meta.directories.files)
            cp('**', dest, {tree: true})
            App.chdir(home)
        }
    }

    function shouldCopy(file, meta): Boolean {
        for each (d in meta.copy) {
            if (file.startsWith(d)) {
                return true
            }
        }
        return false
    }

    function copy(file, meta) {
        if (genall || checkModified(file, meta)) { 
            if (!options.quiet) {
                trace('Copy', file)
            }
            if (file.isDir) {
                let trimmed = rebase(file, meta.directories.documents)
                let home = App.dir
                let dest = meta.directories.final.absolute
                App.chdir(file)
                cp('**', dest.join(trimmed), {tree: true})
                App.chdir(home)
            } else {
                cp(file, dest)
            }
        }
    }

    function generateDir(dir: Path, meta) {
        loadConfig(dir, meta)
        for each (file in dir.files()) {
            if (exclude(file, meta)) {
                vtrace('Exclude', file)
                continue
            }
            if (filters && !include(file, meta)) {
                continue
            }
            if (shouldCopy(file, meta)) {
                copy(file, meta)
                continue
            }
            if (file.isDir) {
                generateDir(file, meta.clone())
            } else {
                if (genall || checkModified(file, meta)) { 
                    meta.page = rebase(file, meta.directories.documents)
                    transform(file, meta)
                }
            }
        }
    }

    function rebase(file, to) {
        let count = to.components.length
        return file.trimComponents(count)
    }

    function checkModified(file, meta) {
        if (file.isDir) {
            return checkModifiedDir(file, meta)
        }
        let trimmed = rebase(file, meta.directories.documents)
        let outfile = meta.directories.final.join(trimmed)
        while (transforms[outfile.extension]) {
            outfile = outfile.trimExt()
        }
        if (outfile.exists && file.modified.time < (lastGen.time - meta.watch/2)) {
            return false
        } else {
            vtrace('Modified', file)
            event('onchange', file, meta)
            return true
        }
    }

    function checkModifiedDir(file, meta) {
        let trimmed = rebase(file, meta.directories.documents)
        let outfile = meta.directories.final.join(trimmed)
        if (!outfile.exists) {
            return true
        }
        for each (f in file.files('**')) {
            if (f.modified.time >= (lastGen.time - meta.watch/2)) {
                vtrace('Modified', f)
                event('onchange', f, meta)
                return true
            }
        }
        return false
    }

    function transform(file, meta) {
        let outfile
        while ((outfile = transformFile(file, meta.clone())) != null) {
            if (file.startsWith(meta.directories.final) && !options.keep) {
                file.remove()
            }
            if (!transforms[outfile.extension]) {
                break
            }
            file = outfile
        }
        return outfile
    }

    function transformFile(file, meta): Path? {
        let dirs = meta.directories
        let outfile
        if (file.startsWith(dirs.documents)) {
            trimmed = rebase(file, dirs.documents)
            outfile = dirs.final.join(trimmed)
        } else if (file.startsWith(dirs.partials)) {
            trimmed = rebase(file, dirs.partials)
            outfile = dirs.final.join('partials', trimmed)
        } else {
            outfile = file
        }
        if (transforms[file.extension]) {
            outfile = outfile.trimExt()
        }
        outfile.dirname.makeDir()
        let [fileMeta, contents] = splitMeta(file.readString(), file)
        if (fileMeta) {
            blendMeta(meta, fileMeta)
        }
        if (transforms[file.extension]) {
            contents = transforms[file.extension].call(this, contents, file, meta)
            vtrace('Processed', file, '=>', outfile)
        } else {
            vtrace('Copy', file + ' => ' + outfile)
        }
        vtrace('Save', outfile)
        if (fileMeta) {
            outfile.write(blendLayout(contents, outfile, meta))
        } else {
            outfile.write(contents.toString())
        }
        if (file.startsWith(dirs.documents)) {
            if (!options.verbose && !options.quiet) {
                trace('Processed', file)
            }
            processCount++
        }
        return outfile
    }

    function getExtensions(file) {
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
        meta.extensions = getExtensions(file)
        meta.extension = meta.extensions.slice(-1)[0]
        meta.path = file
        meta.tags ||= []
        let dir = meta.page.dirname
        let count = (dir == '.') ? 0 : dir.components.length
        meta.top = '../'.times(count)
        if (!meta.isPartial) {
            let trimExt = meta.extensions.slice(1).join('.')
            let url = rebase(file, meta.directories.documents).trimEnd('.' + trimExt)
            meta.basename = url.basename
            meta.outpath = meta.directories.final.join(url)
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
            trace('Details', e.message)
            App.log.debug(3, e)
        }
        let results = obuf.toString()
        this.obuf = priorBuf
        global.meta = priorMeta
        return results
    }

    function runContents(cmd, contents, file) {
        let path = file.dirname.join('_etmp_').joinExt(file.extension)
        let results
        try {
            vtrace('Save', file + ' => ' + path)
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

    //  MOB - should be externalized via plugin

    function transformMinify(contents, file, meta) {
        return runContents('recess -compress', contents, file)
    }

    //  MOB - should be externalized via plugin

    function transformLess(contents, file, meta) {
        let compress = ''
        if (meta.plugins.less && meta.plugins.less.compress) {
            compress = meta.plugins.less.compress
        }
        let results = runContents('recess ' + compress + ' -compile', contents, file)
        if (results == '') {
            /* Run again to get diagnostics */
            results = runContents('recess ', contents, file)
            fatal('Failed to parse less sheet ' + file + '\n' + results + '\n')
        }
        return runContents('autoprefixer -o -', results, file)
    }

    function transformMarkdown(contents, file, meta) {
        return runContents('marked', contents, file)
    }

    function transformShell(contents, file, meta) {
        return runContents('bash', contents, file)
    }

    function transformPlugin(contents, file, meta) {
        let transform = plugins[file.extension]
        vtrace('Run', 'ejs transform.es ' + file + ' ' + file.trimExt())
        //  MOB incomplete
        return runContents('ejs transform.es ' + file + ' ' + file.trimExt(), file)
    }

    function matchFile(dir: Path, pattern: String) {
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
            let layout = matchFile(meta.directories.layouts, meta.layout)
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
            vtrace('Blend', layout + ' + ' + file + ' => ' + path)
            path.write(contents)
            if (file.startsWith(meta.directories.final) && !options.keep) {
                file.remove()
            }
            let outfile = transform(path, meta)
            contents = outfile.readString()
            if (outfile.startsWith(meta.directories.final) && !options.keep) {
                outfile.remove()
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
        let partial = matchFile(meta.directories.partials, name)
        if (partial) {
            let outfile
            try {
                let meta = global.meta.clone()
                blend(meta, options)
                meta.partial = name
                meta.isPartial = true
                outfile = transform(partial, meta)
                writeSafe(outfile.readString())
            }
            catch (e) {
                trace('Error', 'Cannot process partial "' + name + '"')
                trace('Details', e.message)
                App.log.debug(3, e)
            }
            finally {
                outfile.remove()
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
        for (let [key, value] in meta.directories) {
            meta.directories[key] = Path(value)
        }
    }

    function mastersModified(dir): Boolean {
        lastGen ||= Date(0)
        for each (file in dir.files('*')) {
            if (file.modified.time >= (lastGen.time - topMeta.watch/2)) {
                event('onchange', file, topMeta)
                return true
            }
        }
        return false
    }

    function event(name, file = null, meta = null) {
        if (global[name]) {
            global.meta = topMeta
            (global[name]).call(this, file, meta)
        }
    }

    function preclean() {
        if (!filters) {
            topMeta.directories.final.removeAll()
        }
    }

    function postclean() {
        topMeta.directories.final.join('partials').remove()
    }

    function sitemap() {
        if (!genall) {
            return
        }
        let path = topMeta.directories.final.join('Sitemap.xml')
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')

        let count = 0
        for each (file in topMeta.directories.final.files('**', topMeta.sitemap)) {
            fp.write('    <url>\n' +
                '        <loc>' + topMeta.url + file.trimComponents(1) + '</loc>\n' +
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

/*  UNUSED
    public function get meta() {
        return topMeta
    }
*/

    public function collection(query: Object, operation = 'and', pattern = "**") {
        let list = []
        for each (file in topMeta.directories.documents.files(pattern)) {
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
    if (e is String) {
        App.log.error(e)
    } else {
        App.log.error(e.message)
        App.log.debug(3, e)
    }
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
