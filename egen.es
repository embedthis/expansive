#!/usr/bin/env ejs
/*
    egen.es -- Ejs Generate Static Web Site

    egen generate                # generate entire site
    egen [--out dir] paths       # process one file
    egen run                     # watches for changes and serve
    egen path                    # process one file to stdout

 */
module egen {

require ejs.unix
require ejs.template
require ejs.web

class Egen {
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
            chdir: { range: Path },
            keep: { alias: 'k' },
            quiet: { alias: 'q' },
            verbose: { alias: 'v' },
            version: { },
        },
        usage: usage,
    }

    function Egen() {
        transforms = {
            ejs: transformEjs,
            less: transformLess,
            md: transformMarkdown,
            sh: transformShell,
        }
    }

    function usage(): Void {
        App.log.write('Usage: egen [options] [filter patterns...]\n' +
            '  --chdir dir   # Change to directory before testing\n' + 
            '  --keep        # Keep intermediate transforms\n' + 
            '  --quiet       # Quiet mode\n' + 
            '  --verbose     # Verbose mode\n' + 
            '  --version     # Output version information\n')
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
                out:       Path('out'),
            },
            layout: 'default',
            listen: '4000',
            plugins: { },
            watch: 2000,
        }
        if (App.config.egen) {
            blendMeta(topMeta, App.config.egen) 
        }
        loadConfig('.', topMeta)
    }

    function loadConfig(dir: Path, meta) {
        let path = dir.join('egen.json')
        if (path.exists) {
            let config = path.readJSON()
            blendMeta(meta, config)
            if (meta.mode && meta.modes && meta.modes[meta.mode]) {
                blend(meta, meta.modes[meta.mode])
            }
            if (config.script) {
                eval(config.script)
            }
        }
    }

    /*
        Package.json lists dependencies. Examine these for an egen.json
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
                let econfig = pdir.join('egen.json')
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
        let task = args.rest.shift() || 'run'
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

        case 'run':
            genall = mastersModified(meta.directories.partials) || mastersModified(meta.directories.layouts)
            run(topMeta)
            break

        default:
            /* Process only specified files. If not, process all */
            filters = [task] + rest
            genall = false
            generate()
            break
        }
    }

    function watch(meta) {
        options.quiet = true
        trace('Watching', 'for changes...')
        generate()
        options.quiet = false
        lastGen = new Date
        while (true) {
            genall = mastersModified(meta.directories.partials) || mastersModified(meta.directories.layouts)
            let mark = new Date()
            generate()
            lastGen = mark
            App.sleep(meta.watch || 2000)
        }
    }

    function run(meta) {
        let address = meta.listen || '127.0.0.1:4000'
        let documents = meta.documents || 'out'
        let server: HttpServer = new HttpServer({documents: documents})
        let routes = meta.routes || Router.Top
        var router = Router(routes)
        server.on("readable", function (event, request) {
            server.serve(request, router)
        })
        trace('Listen', address)
        server.listen(address)
        watch(meta)
        App.run()
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
            if (filters && processCount == 0) {
                trace('Warn', 'No matching files for filter: ' + filters)
            } else {
                trace('Info', 'Processed ' + processCount + ' files. ' + 
                    'Elapsed time %.2f' % ((started.elapsed / 1000)) + ' secs.')
            }
        }
    }

    function filesCopy(meta) {
        if (!filters && meta.directories.files.exists) {
            if (meta.directories.files.files().length == 0) {
                return
            }
            let home = App.dir
            let dest = meta.directories.out.absolute
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
            trace('Copy', file)
            if (file.isDir) {
                let trimmed = rebase(file, meta.directories.documents)
                let home = App.dir
                let dest = meta.directories.out.absolute
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
        let outfile = meta.directories.out.join(trimmed)
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
        let outfile = meta.directories.out.join(trimmed)
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
            if (file.startsWith(meta.directories.out) && !options.keep) {
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
            outfile = dirs.out.join(trimmed)
        } else if (file.startsWith(dirs.partials)) {
            trimmed = rebase(file, dirs.partials)
            outfile = dirs.out.join('partials', trimmed)
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
            meta.outpath = meta.directories.out.join(url)
            meta.url = Uri(url)
        }
        global.top = meta.top
    }

    function transformEjs(contents, file, meta) {
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
            trace('Error', 'Error when parsing ' + file)
            print('MOB CATCH', e)
            // print('CODE', code)
            fatal('Cannot render file ' + file + '\n' + e.message)
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
            if (file.startsWith(meta.directories.out) && !options.keep) {
                file.remove()
            }
            let outfile = transform(path, meta)
            contents = outfile.readString()
            if (outfile.startsWith(meta.directories.out) && !options.keep) {
                //  MOB NEW
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
                print('CATCH in blendPartial', e)
                print('NAME', name)
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
                            fatal('Badly formatted meta data in ' + file + '\n')
                        }
                        contents = parts.slice(1).join('\n}').trim()
                    }
                }
            }
        } catch (e) {
            print('MOB TEMP ONLY CATCH', e)
            fatal('Cannot parse meta data in ' + file + '\n' + e)
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

    function event(name, file, meta) {
        if (global[name]) {
            (global[name]).call(this, file, meta)
        }
    }

    function preclean() {
        if (!filters) {
            topMeta.directories.out.removeAll()
        }
    }

    function postclean() {
        topMeta.directories.out.join('partials').remove()
    }

    function sitemap() {
        if (!genall) {
            return
        }
        let path = topMeta.directories.out.join('Sitemap.xml')
        let fp = new File(path, 'w')
        fp.write('<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')

        let count = 0
        for each (file in topMeta.directories.out.files('**', topMeta.sitemap)) {
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
        trace('Create', path + ', ' + count + ' entries')
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
}

/*
    Main program
 */
var egen: Egen = new Egen

try {
    egen.parseArgs()
    egen.process()
} catch (e) { 
    App.log.error(e)
}
} /* module egen */

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
